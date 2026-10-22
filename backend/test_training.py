#!/usr/bin/env python3
"""
Test the parts of the backend that decide what the product claims.

The rule this project runs on is that every number a user sees traces back to
something real. Three things enforce it, and this script checks all three:

  1. the training set is split into measured rows and the synthetic bootstrap,
     and the model is fitted on the measured ones whenever they exist;
  2. a link that has never been measured produces *no* metric, rather than a
     plausible default;
  3. a row that could not produce a throughput number is not written at all.

It runs against a temporary database, so it never touches the rows the running
lab has collected.

Usage:
    python test_training.py
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))

import database
from ai_route_service import _fit_random_forest, rank_by_cost
from routing_service import build_graph, calculate_metrics

FAILURES: list[str] = []


def check(condition: bool, message: str) -> None:
    if condition:
        print(f"  ok    {message}")
    else:
        print(f"  FAIL  {message}")
        FAILURES.append(message)


def use_temporary_database() -> str:
    """Point the database at a scratch file so the real rows are untouched."""
    handle, path = tempfile.mkstemp(prefix="netrouteai-test-", suffix=".db")
    os.close(handle)
    database.DB_PATH = path
    return path


def test_origin_split() -> None:
    print("\n" + "=" * 68)
    print("The training set knows which rows were measured")
    print("=" * 68)

    database.init_db()

    # The bootstrap set exists so a fresh install has something to fit on.
    seeded, seeded_labels = database.get_training_data(origin="synthetic")
    check(len(seeded) > 0, f"the synthetic bootstrap set was seeded ({len(seeded)} rows)")
    check(len(seeded_labels) == len(seeded), "every seeded row has a label")

    measured, _ = database.get_training_data(origin="measured")
    check(len(measured) == 0, "no measured rows exist yet in a fresh database")

    database.insert_network_metrics(
        latency=12.5,
        packet_loss=0.2,
        bandwidth=240.0,
        hop_count=3,
        link_cost=30,
        congestion=0.2,
        label="Low",
        origin="measured",
    )
    measured, _ = database.get_training_data(origin="measured")
    check(len(measured) == 1, "a measured row is visible under origin='measured'")

    everything, _ = database.get_training_data()
    check(
        len(everything) == len(seeded) + 1,
        "the unfiltered set is the measured rows plus the bootstrap",
    )


def test_model_prefers_measured_rows() -> None:
    print("\n" + "=" * 68)
    print("The model is fitted on the measured rows when there are any")
    print("=" * 68)

    # Only one measured row is not enough to fit on, so add enough of them.
    for index in range(20):
        database.insert_network_metrics(
            latency=1.0 + index,
            packet_loss=0.1 * index,
            bandwidth=100.0 + index * 10,
            hop_count=1 + index % 5,
            link_cost=10 + index,
            congestion=0.05 * index,
            label=["Low", "Medium", "High"][index % 3],
            origin="measured",
        )

    rf, basis = _fit_random_forest()
    check(rf is not None, "the model was fitted")
    check("measured" in basis, f"the basis names the measured rows ({basis})")

    # With the cache warm, the same basis comes back.
    _rf_again, basis_again = _fit_random_forest()
    check(basis_again == basis, "the fitted model is reused with the same basis")


def test_unknown_metrics_are_absent() -> None:
    print("\n" + "=" * 68)
    print("A link that was never measured produces no metric")
    print("=" * 68)

    topology = {
        "devices": [
            {"id": "R1", "type": "router"},
            {"id": "R2", "type": "router"},
        ],
        "links": [
            # A canvas link carries a cost and nothing else.
            {"source": "R1", "target": "R2", "cost": 10},
        ],
    }
    graph = build_graph(topology)
    edge = graph["R1"]["R2"]
    check("bandwidth" not in edge, "no bandwidth was invented for the link")
    check("latency" not in edge, "no latency was invented for the link")
    check("loss_probability" not in edge, "no loss was invented for the link")
    check(edge["cost"] == 10, "the cost the designer set is kept")

    metrics = calculate_metrics(graph, ["R1", "R2"])
    check(metrics["latency"] is None, "the latency is absent rather than 10 ms")
    check(metrics["bandwidth"] is None, "the bandwidth is absent rather than 100 Mbps")
    check(metrics["packet_loss"] is None, "the loss is absent rather than 1%")
    check(metrics["throughput"] is None, "throughput is never derived from a graph")
    check(metrics["convergence_time"] is None, "convergence is never derived from a graph")
    check(metrics["hop_count"] == 1, "the hop count is real")
    check(metrics["total_cost"] == 10, "the total cost is real")

    # A path with one measured hop and one unmeasured hop has no end-to-end
    # figure at all, rather than an average of the hop that answered.
    two_hop = {
        "devices": [
            {"id": "R1", "type": "router"},
            {"id": "R2", "type": "router"},
            {"id": "R3", "type": "router"},
        ],
        "links": [
            {"source": "R1", "target": "R2", "cost": 10, "latency": 4.0},
            {"source": "R2", "target": "R3", "cost": 10},
        ],
    }
    partial = calculate_metrics(build_graph(two_hop), ["R1", "R2", "R3"])
    check(partial["latency"] is None, "a partially measured path has no latency")
    check(partial["total_cost"] == 20, "its cost is still known")


def test_cost_ranking() -> None:
    print("\n" + "=" * 68)
    print("With no lab, the cheapest path by the drawn cost is chosen")
    print("=" * 68)

    topology = {
        "devices": [
            {"id": "R1", "type": "router"},
            {"id": "R2", "type": "router"},
            {"id": "R3", "type": "router"},
        ],
        "links": [
            {"source": "R1", "target": "R2", "cost": 10},
            {"source": "R2", "target": "R3", "cost": 10},
            {"source": "R1", "target": "R3", "cost": 50},
        ],
    }
    ranked = rank_by_cost(build_graph(topology), "R1", "R3")
    check("error" not in ranked, "a route was found")
    check(
        ranked["best"]["path"] == ["R1", "R2", "R3"],
        "the cheaper of the two paths won",
    )
    check(ranked["confidence"] == 0, "no confidence is claimed without a model")
    check(
        ranked["best"]["estimated_latency_ms"] is None,
        "no latency is estimated without a lab",
    )


def test_rows_without_throughput_are_refused() -> None:
    print("\n" + "=" * 68)
    print("A row that could not be measured is not written")
    print("=" * 68)

    before, _ = database.get_training_data(origin="measured")
    database.record_measurement(
        {
            "latency_ms": 4.0,
            "packet_loss_percent": 0.0,
            "hop_count": 2,
            "total_cost": 20,
            "congestion_level": 0.1,
        }
    )
    after, _ = database.get_training_data(origin="measured")
    check(
        len(after) == len(before),
        "a measurement with no throughput number added no row",
    )

    database.record_measurement(
        {
            "latency_ms": 4.0,
            "packet_loss_percent": 0.0,
            "bandwidth_mbps": 120.0,
            "hop_count": 2,
            "total_cost": 20,
            "congestion_level": 0.1,
        }
    )
    final, _ = database.get_training_data(origin="measured")
    check(len(final) == len(before) + 1, "a fully measured row was written")


def main() -> int:
    print("=" * 68)
    print("What the backend claims")
    print("=" * 68)

    path = use_temporary_database()
    try:
        test_origin_split()
        test_model_prefers_measured_rows()
        test_unknown_metrics_are_absent()
        test_cost_ranking()
        test_rows_without_throughput_are_refused()
    finally:
        database.DB_PATH = os.path.join(os.path.dirname(__file__), "training_data.db")
        if os.path.exists(path):
            os.unlink(path)

    print("\n" + "=" * 68)
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
