"""The routing graph, and the metrics that can honestly be derived from it.

Two rules govern this module, and both exist because the previous version broke
them:

1. **A link carries only what is actually known.** A link drawn on the canvas
   has a *cost* and nothing else, so that is all it carries here. The old
   version filled every link with 100 Mbps, 10 ms and 1% loss, which meant that
   every metric derived from a path repeated three invented numbers -- and the
   invention was invisible, because the numbers looked like measurements next to
   a real model confidence.

2. **A metric the graph cannot support is ``None``, never a default.** The
   caller can then say "not measured" instead of printing a plausible figure.
   The old version answered 10 ms per hop and 1000 Mbps for a link nobody had
   ever measured.

``throughput`` and ``convergence_time`` are always ``None`` here. Both are
measurements of a running lab (``metrics_collector.measure_bandwidth`` and
``convergence.measure_convergence``); a graph cannot supply either, and a
formula that looks like one is how a modelled number gets mistaken for an
observation.
"""

from __future__ import annotations

import networkx as nx

#: Edge attributes that describe a link's behaviour rather than its topology.
#: They are only set on an edge when the caller really knows them.
BEHAVIOUR_ATTRIBUTES = ("bandwidth", "latency", "loss_probability")


def edge_key(a: str, b: str) -> frozenset[str]:
    """A direction-independent key for the edge between two devices."""
    return frozenset((str(a), str(b)))


def build_graph(
    topology: dict, edge_attributes: dict | None = None
) -> nx.Graph:
    """Build a NetworkX graph from a topology dict.

    ``edge_attributes`` carries measured values for the edges the caller really
    knows about, keyed by :func:`edge_key`. It is merged *over* the topology's
    own values, so a measurement always wins over a declared one.
    """
    G = nx.Graph()
    for device in topology.get("devices") or []:
        G.add_node(device["id"], type=device.get("type", "unknown"))

    for link in topology.get("links") or []:
        attrs: dict[str, float] = {"cost": float(link.get("cost") or 1)}
        for name in BEHAVIOUR_ATTRIBUTES:
            value = link.get(name)
            if value is not None:
                attrs[name] = float(value)
        if edge_attributes:
            attrs.update(edge_attributes.get(edge_key(link["source"], link["target"]), {}))
        G.add_edge(link["source"], link["target"], **attrs)

    return G


def calculate_metrics(G: nx.Graph, path: list[str]) -> dict:
    """Metrics for a path, derived only from what the graph actually holds.

    ``latency``, ``bandwidth`` and ``packet_loss`` are ``None`` unless *every*
    hop carries the quantity. A path with one unmeasured hop has no end-to-end
    figure, and averaging the hops that did answer would produce a different
    number wearing the same label.
    """
    hop_count = max(0, len(path) - 1)
    total_cost = 0.0
    latencies: list[float] = []
    bandwidths: list[float] = []
    losses: list[float] = []

    for index in range(hop_count):
        edge = G[path[index]][path[index + 1]]
        total_cost += float(edge.get("cost", 1))
        for name, bucket in (
            ("latency", latencies),
            ("bandwidth", bandwidths),
            ("loss_probability", losses),
        ):
            value = edge.get(name)
            if value is not None:
                bucket.append(float(value))

    complete = hop_count > 0
    return {
        "latency": (
            round(sum(latencies), 3) if complete and len(latencies) == hop_count else None
        ),
        "bandwidth": (
            round(min(bandwidths), 3)
            if complete and len(bandwidths) == hop_count
            else None
        ),
        "packet_loss": (
            round(sum(losses) * 100.0, 4)
            if complete and len(losses) == hop_count
            else None
        ),
        # Measured elsewhere, never derivable from a graph.
        "throughput": None,
        "convergence_time": None,
        "hop_count": hop_count,
        "total_cost": total_cost,
    }
