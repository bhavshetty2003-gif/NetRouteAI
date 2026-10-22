"""AI route recommendation backed by a Random Forest fitted on real measurements.

What is real here
-----------------
* The **model** is fitted on rows measured inside a lab container. Rows tagged
  ``synthetic`` are the bootstrap set that exists so a fresh install has
  something to fit on; they are used only when no measured row exists yet, and
  the response says which set was used (``training_basis``). The old version
  always mixed the two together, so a third of the training set was invented --
  while the module's own docstring claimed the opposite.
* The **latency, loss and throughput** reported for the recommended path are
  measured on the running lab with real ICMP echo requests and real
  ``/proc/net/dev`` counter deltas -- or they are absent. When no lab built
  from this canvas is running, nothing is measured and the response says so.
* The **cost** and **hop count** are properties of the drawn topology, so they
  are always available.
* The figures inside ``path_ranking`` are *estimates* derived from the graph's
  edge attributes, and are named ``estimated_*`` so they cannot be mistaken for
  observations.

Scoring a path
--------------
The original implementation used ``max(predict_proba(...))`` on a 3-class
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
of being decorative.

``confidence`` is the model's own probability for the most likely congestion
class of the winning path. It used to be a hand-built
``55 + margin * 180 + congestion * 30`` expression, which could never report
less than 55% and was not a probability of anything.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import networkx as nx
from sklearn.ensemble import RandomForestClassifier

from database import get_training_data
from routing_service import build_graph, calculate_metrics

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

#: A fitted model is reused for this long. Refitting on every request cost a
#: second of CPU per click for a model whose training set changes only when a
#: dataset sweep finishes.
_FIT_TTL_SECONDS = 60.0
_fit_cache: dict[str, Any] = {"at": 0.0, "rf": None, "basis": "no training data"}


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


# --------------------------------------------------------------------------- #
# The model
# --------------------------------------------------------------------------- #
def _fit_random_forest() -> tuple[RandomForestClassifier | None, str]:
    """Fit (or reuse) the Random Forest, and say what it was fitted on.

    Measured rows first. The synthetic bootstrap rows exist so that a fresh
    install has a model at all; they are a fallback, and the response reports
    which set was used.
    """
    now = time.monotonic()
    cached = _fit_cache
    if cached["rf"] is not None and now - cached["at"] < _FIT_TTL_SECONDS:
        return cached["rf"], cached["basis"]

    X, y = get_training_data(origin="measured")
    basis = "measured rows collected from the lab"
    if not X:
        X, y = get_training_data(origin="synthetic")
        basis = "synthetic bootstrap rows (no measured row exists yet)"
    if not X:
        cached.update(at=now, rf=None, basis="no training data")
        return None, "no training data"

    rf = RandomForestClassifier(
        n_estimators=100, random_state=42, min_samples_leaf=2, oob_score=False
    )
    rf.fit(X, y)
    cached.update(at=now, rf=rf, basis=basis)
    return rf, basis


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


def extract_path_features(G: nx.Graph, path: list[str]) -> list[float]:
    """Path features matching the DB training schema.

    Returns ``[latency_ms, packet_loss_percent, bandwidth_mbps, hop_count,
    link_cost, congestion_level]`` -- the exact column order used by
    ``database.get_training_data()``.

    A hop whose edge carries no bandwidth, latency or loss contributes the
    neutral value for that quantity (0), which is what an unshaped link
    actually reports. The old code invented 100 Mbps and 10 ms per hop, so a
    path over links nobody had measured was scored as though it had.
    """
    hop_count = len(path) - 1
    total_cost = 0.0
    min_bandwidth = float("inf")
    total_latency = 0.0
    total_loss = 0.0

    for index in range(hop_count):
        edge = G[path[index]][path[index + 1]]
        total_cost += float(edge.get("cost", 1))
        if edge.get("bandwidth") is not None:
            min_bandwidth = min(min_bandwidth, float(edge["bandwidth"]))
        if edge.get("latency") is not None:
            total_latency += float(edge["latency"])
        if edge.get("loss_probability") is not None:
            total_loss += float(edge["loss_probability"])

    if min_bandwidth == float("inf"):
        min_bandwidth = 0.0

    congestion = congestion_estimate(G, path, min_bandwidth, total_loss)
    return [
        total_latency,
        total_loss * 100.0,
        min_bandwidth,
        float(hop_count),
        total_cost,
        congestion,
    ]


def congestion_estimate(
    G: nx.Graph, path: list[str], min_bandwidth: float, total_loss: float
) -> float:
    """Heuristic congestion in [0, 1] used as the Random Forest input feature."""
    total_cost = sum(
        G[path[index]][path[index + 1]].get("cost", 1)
        for index in range(len(path) - 1)
    )
    return float(
        min(
            1.0,
            (total_cost / 100) * 0.3
            + (1 - min(min_bandwidth, 1000) / 1000) * 0.4
            + min(total_loss, 1.0) * 10 * 0.3,
        )
    )


def _congestion_quality(rf, features: list[float]) -> tuple[float, float]:
    """(quality, model probability) for a path's congestion.

    ``quality`` is the probability mass on the good classes, so higher is
    better. ``model_probability`` is the model's probability for its own most
    likely class -- the honest statement of how sure the model is.
    """
    if rf is None:
        return 1.0 - features[5], 0.0

    proba = rf.predict_proba([features])[0]
    classes = list(rf.classes_)
    mapping = {"Low": 1.0, "Medium": 0.5, "High": 0.0}
    weighted = 0.0
    total = 0.0
    for index, label in enumerate(classes):
        weight = mapping.get(str(label), 0.5)
        weighted += proba[index] * weight
        total += proba[index]
    quality = weighted / total if total else 0.5
    top = float(max(proba)) if len(proba) else 0.0
    return quality, top


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

    rf, basis = _fit_random_forest()
    cong_s: list[float] = []
    model_probs: list[float] = []
    for feature in features:
        quality, probability = _congestion_quality(rf, feature)
        cong_s.append(quality)
        model_probs.append(probability)

    scored: list[dict] = []
    for index, path in enumerate(all_paths):
        quality = (
            _STATIC_WEIGHTS["latency"] * lat_s[index]
            + _STATIC_WEIGHTS["bandwidth"] * bw_s[index]
            + _STATIC_WEIGHTS["loss"] * loss_s[index]
            + _STATIC_WEIGHTS["cost"] * cost_s[index]
            + _RF_WEIGHT * cong_s[index]
        )
        scored.append(
            {
                "path": path,
                "quality": round(quality, 6),
                # Named "estimated" because they are derived from the graph's
                # edge attributes, not observed on a wire.
                "estimated_latency_ms": round(latencies[index], 3),
                "estimated_bandwidth_mbps": round(bandwidths[index], 3),
                "estimated_packet_loss_percent": round(losses[index], 4),
                "total_cost": round(costs[index], 3),
                "congestion_quality": round(cong_s[index], 4),
                "model_probability": round(model_probs[index], 4),
                "hop_count": len(path) - 1,
            }
        )

    scored.sort(key=lambda s: s["quality"], reverse=True)
    best = scored[0]

    # How far ahead of the runner-up the winner is. Reported next to the
    # model's own probability, because the two say different things: one is
    # how sure the model is, the other is how much the choice matters.
    margin = best["quality"] - scored[1]["quality"] if len(scored) > 1 else best["quality"]

    return {
        "best": best,
        "ranking": scored,
        "confidence": int(round(best["model_probability"] * 100)),
        "margin": round(margin, 6),
        "model": "RandomForestClassifier" if rf is not None else "heuristic",
        "training_basis": basis,
    }


def rank_by_cost(G: nx.Graph, source: str, destination: str) -> dict:
    """Rank the canvas paths by the cost the user set on each link.

    Used when there is no lab to measure. The cost is the one number the
    canvas really holds, so this answers a real question -- the cheapest path
    by your own figures -- instead of pretending a model had an opinion.
    """
    try:
        all_paths = list(nx.all_simple_paths(G, source, destination, cutoff=10))
    except nx.NetworkXNoPath:
        return {"error": f"No path found between {source} and {destination}"}
    if not all_paths:
        return {"error": f"No path found between {source} and {destination}"}
    if len(all_paths) > _MAX_PATHS:
        all_paths = sorted(all_paths, key=len)[:_MAX_PATHS]

    costs = [
        sum(
            float(G[path[i]][path[i + 1]].get("cost", 1))
            for i in range(len(path) - 1)
        )
        for path in all_paths
    ]
    cost_s = _normalise(costs, higher_is_better=False)

    scored = [
        {
            "path": path,
            "quality": round(cost_s[index], 6),
            "estimated_latency_ms": None,
            "estimated_bandwidth_mbps": None,
            "estimated_packet_loss_percent": None,
            "total_cost": round(costs[index], 3),
            "congestion_quality": None,
            "model_probability": None,
            "hop_count": len(path) - 1,
        }
        for index, path in enumerate(all_paths)
    ]
    scored.sort(key=lambda s: s["quality"], reverse=True)
    best = scored[0]
    margin = best["quality"] - scored[1]["quality"] if len(scored) > 1 else best["quality"]
    return {
        "best": best,
        "ranking": scored,
        "confidence": 0,
        "margin": round(margin, 6),
        "model": "cost only",
        "training_basis": "not consulted (no lab to measure)",
    }


# --------------------------------------------------------------------------- #
# The running lab
# --------------------------------------------------------------------------- #
def _signature(plan: dict) -> tuple[list[str], list[str]]:
    """A comparable fingerprint of a plan: routers and links, with cost/area.

    Both the deployed plan and the plan this canvas *would* produce are
    reduced to the same shape, so the two can be compared without either side
    re-implementing the other's normalisation rules.
    """
    routers = sorted(
        f"{str(r.get('id', '')).upper()}:{r.get('area', 0)}"
        for r in plan.get("routers") or []
    )
    links = []
    for link in plan.get("links") or []:
        a = str(link.get("source", "")).upper()
        b = str(link.get("target", "")).upper()
        links.append(f"{'--'.join(sorted((a, b)))}:{link.get('cost')}:{link.get('area')}")
    return routers, sorted(links)


def _live_graph_for(topology: dict) -> tuple[nx.Graph | None, str]:
    """The running lab's own graph, when the lab really is this canvas.

    Returns ``(graph, note)``. The graph is the lab's live graph: OSPF costs
    read from the routers and the link shapes read back from the qdisc tree,
    so its edges carry real latency, loss and bandwidth.

    The lab is only used when it was built from *this* topology. A lab left
    over from somebody else's drawing answers every request perfectly well and
    describes the wrong network, so the deployed plan is compared with the plan
    this canvas would produce -- routers, links, costs and areas -- and a
    difference means nothing is measured.
    """
    # Imported here because `ospf_ai_service` imports this module.
    from lab_deploy import DeployError, load_plan, resolve_plan
    from lab_topology import discover_lab
    from ospf_ai_service import lab_graph

    lab = discover_lab()
    if not lab["online"]:
        return None, "No lab is running, so nothing was measured."

    deployed = load_plan()
    if not deployed:
        return None, (
            "The running lab was not built from this canvas, so nothing was measured."
        )

    try:
        resolved = resolve_plan(topology)
    except DeployError as exc:
        return None, f"This canvas cannot be deployed as it stands ({exc}), so nothing was measured."

    if _signature(deployed) != _signature(resolved):
        return None, (
            "The running lab was built from a different version of this canvas, "
            "so nothing was measured."
        )

    graph = lab_graph(lab)
    return graph, "Measured on the running lab."


def _measure_route(source: str, destination: str) -> dict | None:
    """Measure the recommended path end to end on the running lab.

    Real ICMP echo requests for latency and loss, real ``/proc/net/dev``
    counter deltas for throughput. Returns ``None`` when the pair cannot be
    measured at all, rather than a row of zeros.
    """
    from metrics_collector import (
        LabUnavailable,
        _client,
        measure_bandwidth,
        measure_path,
    )
    from lab_topology import discover_lab

    try:
        result = measure_path(source, destination, count=12, include_traceroute=True)
    except LabUnavailable:
        return None
    if not result.get("reachable"):
        return None

    ping = (result.get("raw") or {}).get("ping") or {}
    measured: dict[str, Any] = {
        "latency_ms": result.get("latency_ms"),
        "jitter_ms": result.get("jitter_ms"),
        "packet_loss_percent": result.get("packet_loss_percent"),
        "hop_count": result.get("hop_count"),
        "packets_sent": result.get("packets_sent"),
        "packets_received": result.get("packets_received"),
        "command": ping.get("command"),
        "throughput_mbps": None,
        "measured_interface": None,
    }

    # Throughput is a separate measurement: it needs the byte counters to move,
    # so it is only reported when something actually moved them.
    try:
        lab = discover_lab()
        target_ip = result.get("target_ip")
        container = lab["container_map"].get(source.upper())
        if target_ip and container:
            bandwidth = measure_bandwidth(_client(), container, [target_ip], duration=2.0)
            measured["throughput_mbps"] = bandwidth.get("throughput_mbps")
            measured["measured_interface"] = bandwidth.get("measured_interface")
    except LabUnavailable:
        pass

    return measured


# --------------------------------------------------------------------------- #
# The recommendation
# --------------------------------------------------------------------------- #
def recommend_route(source: str, destination: str) -> dict:
    """Recommend an AI route for the uploaded topology."""
    if CURRENT_TOPOLOGY is None:
        return {"error": "No topology uploaded. POST /upload-topology first."}

    topology = CURRENT_TOPOLOGY
    source, destination = str(source).upper(), str(destination).upper()

    live_graph, note = _live_graph_for(topology)
    using_lab = live_graph is not None
    G = live_graph if live_graph is not None else build_graph(topology)

    if source not in G or destination not in G:
        return {
            "error": (
                f"Source '{source}' or destination '{destination}' not found in "
                + ("the running lab" if using_lab else "topology")
            )
        }

    ranked = (
        rank_paths(G, source, destination)
        if using_lab
        else rank_by_cost(G, source, destination)
    )
    if "error" in ranked:
        return ranked

    best = ranked["best"]
    path = best["path"]
    metrics = calculate_metrics(G, path)

    measured = _measure_route(source, destination) if using_lab else None
    if measured:
        metrics["latency"] = measured["latency_ms"]
        metrics["packet_loss"] = measured["packet_loss_percent"]
        metrics["throughput"] = measured["throughput_mbps"]
        if measured.get("hop_count") is not None:
            metrics["hop_count"] = measured["hop_count"]

    return {
        "algorithm": "random_forest" if using_lab else "cost",
        "best_route": path,
        "path": path,
        "latency": metrics["latency"],
        "confidence": ranked["confidence"],
        "hop_count": metrics["hop_count"],
        "total_cost": int(best["total_cost"]),
        "metrics": metrics,
        "model": ranked["model"],
        "quality_score": best["quality"],
        "margin": ranked["margin"],
        "measurement_basis": "live lab" if using_lab else "canvas topology",
        "measurement_note": note,
        "training_basis": ranked["training_basis"],
        "measured": measured,
        "path_ranking": [
            {
                "path": s["path"],
                "quality": s["quality"],
                "estimated_latency_ms": s["estimated_latency_ms"],
                "estimated_bandwidth_mbps": s["estimated_bandwidth_mbps"],
                "estimated_packet_loss_percent": s["estimated_packet_loss_percent"],
                "total_cost": s["total_cost"],
                "hop_count": s["hop_count"],
            }
            for s in ranked["ranking"]
        ],
    }
