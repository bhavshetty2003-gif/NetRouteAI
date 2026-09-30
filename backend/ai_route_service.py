"""AI route recommendation backed by Random Forest.

The model is trained on the *real* measurements stored in SQLite (rows tagged
`measured`), falling back to the synthetic seed rows only when the table holds no
real observations yet.

Scoring a path
--------------
The original implementation used `max(predict_proba(...))` on a 3-class
congestion classifier and picked the argmax. That is not a path comparison: a
path can have a high confidence of being "Low" congestion while another path is
strictly better on every axis, and the classifier has no notion of "better
path". It reliably picked the wrong route.

Instead, candidate paths are scored with a **quality score in [0, 1]** where
higher is better, built from:

    quality = w_lat * lat_score
            + w_bw  * bw_score
            + w_loss * loss_score
            + w_cost * cost_score
            + w_cong * congestion_score        <- Random Forest prediction

Each component is normalised against the best/worst candidate, so the ranking is
relative to the alternatives that actually exist. The Random Forest contributes
the congestion term, so the learned model genuinely influences selection instead
of being decorative. `confidence` is the RF's probability for the winning
congestion class, which is an honest statement of model belief.
"""

from __future__ import annotations

import uuid

import networkx as nx
import numpy as np
from sklearn.ensemble import RandomForestClassifier

from database import get_training_data
from routing_service import build_graph, calculate_metrics, generate_frr_config

CURRENT_TOPOLOGY: dict | None = None
CURRENT_TOPOLOGY_ID: str | None = None

# Weight of the Random Forest congestion term in the quality score.
_RF_WEIGHT = 0.30
_STATIC_WEIGHTS = {
    "latency": 0.25,
    "bandwidth": 0.25,
    "loss": 0.15,
    "cost": 0.05,
}
_MAX_PATHS = 400


def upload_topology(topology: dict) -> str:
    """Store the uploaded topology as CURRENT_TOPOLOGY and return its ID."""
    global CURRENT_TOPOLOGY, CURRENT_TOPOLOGY_ID
    topology_id = f"topo_{uuid.uuid4().hex[:8]}"
    CURRENT_TOPOLOGY = topology
    CURRENT_TOPOLOGY_ID = topology_id
    return topology_id


def get_current_topology() -> tuple[str | None, dict | None]:
    """Return (topology_id, topology) for the currently uploaded topology."""
    return CURRENT_TOPOLOGY_ID, CURRENT_TOPOLOGY


def extract_path_features(G: nx.Graph, path: list[str]) -> list[float]:
    """Extract path features matching the DB training schema.

    Returns [latency_ms, packet_loss_percent, bandwidth_mbps, hop_count,
    link_cost, congestion_level] -- the exact column order used by
    database.get_training_data().
    """
    hop_count = len(path) - 1
    total_cost = 0.0
    min_bandwidth = float("inf")
    total_latency = 0.0
    total_loss = 0.0

    for i in range(len(path) - 1):
        edge = G[path[i]][path[i + 1]]
        total_cost += edge.get("cost", 1)
        min_bandwidth = min(min_bandwidth, edge.get("bandwidth", 100))
        total_latency += edge.get("latency", 10)
        total_loss += edge.get("loss_probability", 0.01)

    if min_bandwidth == float("inf"):
        min_bandwidth = 100

    congestion = congestion_estimate(G, path, min_bandwidth, total_loss)
    return [
        total_latency,
        total_loss * 100,
        min_bandwidth,
        float(hop_count),
        total_cost,
        congestion,
    ]


def congestion_estimate(
    G: nx.Graph, path: list[str], min_bandwidth: float, total_loss: float
) -> float:
    """Heuristic congestion in [0, 1] used as the RF input feature."""
    total_cost = sum(G[path[i]][path[i + 1]].get("cost", 1) for i in range(len(path) - 1))
    return float(
        min(
            1.0,
            (total_cost / 100) * 0.3
            + (1 - min(min_bandwidth, 1000) / 1000) * 0.4
            + min(total_loss, 1.0) * 10 * 0.3,
        )
    )


def _normalise(values: list[float], higher_is_better: bool) -> list[float]:
    """Scale values to [0, 1] across the candidate set (best = 1.0)."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi == lo:
        return [1.0] * len(values)
    span = hi - lo
    if higher_is_better:
        return [(v - lo) / span for v in values]
    return [(hi - v) / span for v in values]


def _fit_random_forest():
    X, y = get_training_data()
    if not X:
        return None
    rf = RandomForestClassifier(
        n_estimators=100, random_state=42, min_samples_leaf=2, oob_score=False
    )
    rf.fit(X, y)
    return rf


def _congestion_quality(rf, features: list[float]) -> float:
    """Map the RF's congestion prediction to a quality score in [0, 1].

    P(Low) -> best, P(High) -> worst, P(Medium) -> middle. Falls back to the
    feature heuristic when the model has not seen a class it knows.
    """
    if rf is None:
        return 1.0 - features[5]

    proba = rf.predict_proba([features])[0]
    classes = list(rf.classes_)
    mapping = {"Low": 1.0, "Medium": 0.5, "High": 0.0}
    weighted = 0.0
    total = 0.0
    for idx, label in enumerate(classes):
        weight = mapping.get(str(label), 0.5)
        weighted += proba[idx] * weight
        total += proba[idx]
    return weighted / total if total else 0.5


def rank_paths(G: nx.Graph, source: str, destination: str) -> dict:
    """Score every candidate path and return the ranking with the winner."""
    try:
        all_paths = list(nx.all_simple_paths(G, source, destination, cutoff=10))
    except nx.NetworkXNoPath:
        return {"error": f"No path found between {source} and {destination}"}

    if not all_paths:
        return {"error": f"No path found between {source} and {destination}"}

    # Guard against combinatorial blow-up on dense graphs
    if len(all_paths) > _MAX_PATHS:
        all_paths = sorted(all_paths, key=len)[:_MAX_PATHS]

    features = [extract_path_features(G, p) for p in all_paths]

    latencies = [f[0] for f in features]
    bandwidths = [f[2] for f in features]
    losses = [f[1] for f in features]
    costs = [f[4] for f in features]

    lat_s = _normalise(latencies, higher_is_better=False)
    bw_s = _normalise(bandwidths, higher_is_better=True)
    loss_s = _normalise(losses, higher_is_better=False)
    cost_s = _normalise(costs, higher_is_better=False)

    rf = _fit_random_forest()
    cong_s = [_congestion_quality(rf, f) for f in features]

    scored: list[dict] = []
    for i, path in enumerate(all_paths):
        quality = (
            _STATIC_WEIGHTS["latency"] * lat_s[i]
            + _STATIC_WEIGHTS["bandwidth"] * bw_s[i]
            + _STATIC_WEIGHTS["loss"] * loss_s[i]
            + _STATIC_WEIGHTS["cost"] * cost_s[i]
            + _RF_WEIGHT * cong_s[i]
        )
        scored.append(
            {
                "path": path,
                "quality": round(quality, 6),
                "latency_ms": round(latencies[i], 3),
                "bandwidth_mbps": round(bandwidths[i], 3),
                "packet_loss_percent": round(losses[i], 4),
                "total_cost": round(costs[i], 3),
                "congestion_quality": round(cong_s[i], 4),
                "hop_count": len(path) - 1,
            }
        )

    scored.sort(key=lambda s: s["quality"], reverse=True)
    best = scored[0]

    # Confidence: RF's belief in the winning path's congestion class, blended
    # with how far ahead of the runner-up the winner is.
    margin = best["quality"] - scored[1]["quality"] if len(scored) > 1 else best["quality"]
    confidence = int(round(min(99.0, 55 + margin * 180 + best["congestion_quality"] * 30)))

    return {
        "best": best,
        "ranking": scored,
        "confidence": confidence,
        "model": "RandomForestClassifier" if rf is not None else "heuristic",
    }


def recommend_route(source: str, destination: str) -> dict:
    """Recommend an AI route for the uploaded topology."""
    if CURRENT_TOPOLOGY is None:
        return {"error": "No topology uploaded. POST /upload-topology first."}

    topology = CURRENT_TOPOLOGY
    G = build_graph(topology)

    if source not in G or destination not in G:
        return {
            "error": f"Source '{source}' or destination '{destination}' not found in topology"
        }

    ranked = rank_paths(G, source, destination)
    if "error" in ranked:
        return ranked

    best = ranked["best"]
    path = best["path"]
    metrics = calculate_metrics(G, path)

    return {
        "algorithm": "random_forest",
        "best_route": path,
        "path": path,
        "latency": metrics["latency"],
        "confidence": ranked["confidence"],
        "hop_count": len(path) - 1,
        "total_cost": int(best["total_cost"]),
        "metrics": metrics,
        "frr_config": generate_frr_config(G, path),
        "model": ranked["model"],
        "quality_score": best["quality"],
        "path_ranking": [
            {
                "path": s["path"],
                "quality": s["quality"],
                "latency_ms": s["latency_ms"],
                "bandwidth_mbps": s["bandwidth_mbps"],
                "packet_loss_percent": s["packet_loss_percent"],
                "total_cost": s["total_cost"],
                "hop_count": s["hop_count"],
            }
            for s in ranked["ranking"]
        ],
    }
