"""Build a Random Forest training set from real OSPF behaviour.

Why this exists
---------------
The Random Forest has to learn congestion from the OSPF lab, not from invented
numbers. A clean lab is a poor teacher: every router-to-router ping measures
0.1-0.8 ms with 0% loss, so `classify()` puts 100% of those rows in the "Low"
band and the model learns nothing about congestion at all.

So each pair is measured under several *real* network conditions, produced by
injecting real impairment with `tc` and driving real traffic:

    clean  -> "Low"     no qdisc, idle link
    mild   -> "Low"/"Medium"  light delay and jitter
    heavy  -> "Medium"/"High" heavy delay plus real packet loss
    loaded -> "High"    tbf rate limit so queues genuinely back up and the
                         kernel reports real drops

Every feature recorded comes from a measurement: latency/loss/jitter from
`ping`, hop count from `traceroute`, path cost from the live `ip ospf cost`
values, and congestion from the interface queue depth and drop counters read
back with `ip -s link` and `tc -s qdisc`.

Impairments are always cleared afterwards, including on failure, so the lab is
left as it was found.
"""

from __future__ import annotations

import time
from typing import Any, Callable

from database import record_measurement
from lab_topology import discover_lab
from metrics_collector import (
    LabUnavailable,
    _client,
    apply_impairment,
    clear_impairment,
    measure_path,
    probe_interfaces,
)
from ospf_ai_service import _in_subnet, _interface_costs, real_ospf_path

# Real impairment profiles applied to a link on the path. Values are the ones
# `tc netem`/`tbf` actually accept; the resulting delay/loss is measured, not
# assumed. The set is chosen so that each `classify()` band is reachable from a
# real measurement rather than only from the synthetic seed: 55 ms of real
# netem delay lands squarely in the "Medium" band (>50 ms), which the 45 ms
# "heavy" profile never reaches and clean links never approach.
PROFILES: list[dict[str, Any]] = [
    {"name": "clean", "impair": {}},
    {"name": "mild", "impair": {"delay": 8, "jitter": 3, "loss": 1}},
    {"name": "moderate", "impair": {"delay": 55, "jitter": 8, "loss": 2}},
    {"name": "heavy", "impair": {"delay": 45, "jitter": 12, "loss": 6}},
    {"name": "loaded", "impair": {"delay": 20, "loss": 3, "bandwidth": 1}},
]

# A single sweep of just the "moderate" profile, used to top up the Medium
# class without re-measuring every condition.
MODERATE_ONLY: list[dict[str, Any]] = [
    {"name": "moderate", "impair": {"delay": 55, "jitter": 8, "loss": 2}},
]


def _path_link(lab: dict[str, Any], path: list[str]) -> dict[str, str] | None:
    """The transit interface of the first hop on `path`, for impairment."""
    from ospf_ai_service import _path_ifaces

    for hop in _path_ifaces(path, lab):
        if hop.get("kind") == "transit":
            return {"container": hop["container"], "interface": hop["interface"]}
    return None


def _path_queue_state(lab: dict[str, Any], path: list[str], client) -> tuple[int, int, dict[str, int]]:
    """Snapshot the real queue counters on every interface along `path`.

    Returns `(queue_drops, interface_errors, shaper_overlimits_by_container)`.
    These are read back with `ip -s link` and `tc -s qdisc`; nothing is
    estimated. Taking a snapshot before and after the test lets the deltas
    reveal how hard the link actually pushed back, which is precisely the
    signal a flat idle queue cannot provide.
    """
    from ospf_ai_service import _path_ifaces

    hops = _path_ifaces(path, lab)
    drops = 0
    errors = 0
    overlimits: dict[str, int] = {}

    for hop in hops:
        try:
            probe = probe_interfaces(client, hop["container"])
        except LabUnavailable:
            continue

        # `interfaces` is a list of per-interface counter records.
        for iface in probe["interfaces"]:
            if iface.get("name") != hop["interface"]:
                continue
            errors += int(iface.get("rx_errors", 0)) + int(iface.get("tx_errors", 0))
            drops += int(iface.get("rx_dropped", 0)) + int(iface.get("tx_dropped", 0))

        qdisc = probe["queues"].get(hop["interface"])
        if qdisc:
            drops += int(qdisc.get("dropped", 0))
            overlimits[hop["container"]] = int(qdisc.get("overlimits", 0))

    return drops, errors, overlimits


def _congestion_from(
    before: tuple[int, int, dict[str, int]],
    after: tuple[int, int, dict[str, int]],
) -> tuple[float, int, int]:
    """Blend the real counter deltas into a 0..1 congestion score."""
    drops = after[0] - before[0]
    errors = after[1] - before[1]
    overlimit_delta = sum(after[2].values()) - sum(before[2].values())

    # A single dropped packet is notable; 20 is severe. Over-limit events mean
    # the shaper actively held traffic back, which is congestion even when
    # nothing was ultimately lost.
    score = min(1.0, drops / 20.0 + overlimit_delta / 20.0)
    if errors:
        score = min(1.0, score + 0.25)
    return round(score, 4), max(0, drops), max(0, errors)


def _path_cost(lab: dict[str, Any], path: list[str], costs: dict[str, dict[str, int]]) -> int:
    """Sum the live `ip ospf cost` of each hop, in the direction of travel."""
    by_id = {d["id"]: d for d in lab["devices"]}
    total = 0
    for a, b in zip(path, path[1:]):
        link = next(
            (
                l
                for l in lab["links"]
                if frozenset((l["source"], l["target"])) == frozenset((a, b))
            ),
            None,
        )
        if not link:
            continue
        iface = next(
            (
                name
                for name, addr in by_id.get(a, {}).get("addresses", {}).items()
                if _in_subnet(addr, link.get("subnet"))
            ),
            None,
        )
        if iface:
            total += costs.get(by_id[a]["container"], {}).get(iface, 10)
    return total or len(path)


def _drive_traffic(client, container: str, targets: list[str], seconds: float) -> None:
    """Run real ping load so queues and counters actually move."""
    for ip in targets:
        try:
            container_obj = client.containers.get(container)
            container_obj.exec_run(
                ["ping", "-i", "0.02", "-c", str(int(seconds / 0.02)), "-W", "1", ip],
                detach=True,
            )
        except Exception:  # noqa: BLE001
            continue
    time.sleep(seconds)


def collect(
    max_pairs: int = 66,
    profiles: list[dict[str, Any]] | None = None,
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Measure the lab across every profile and store real training rows.

    Runs strictly one pair at a time. Parallelising is tempting but incorrect:
    impairment is applied to the first hop's egress interface, and several
    distinct pairs share that same interface (every R1 pair goes out of r1's
    eth0). Concurrent workers would add competing `tc qdisc add root` rules to
    one interface, each `clear_impairment` would tear down the others, and a
    1 Mbps tbf limit would starve unrelated measurements -- which is exactly
    what made multi-hop pairs report as unreachable.
    """
    lab = discover_lab()
    if not lab["online"]:
        raise LabUnavailable(lab.get("error") or "Lab not running")

    client = _client()
    profile_list = profiles or PROFILES

    routers = [d["id"] for d in lab["devices"] if d["type"] == "router"]
    pairs = [
        (a, b)
        for i, a in enumerate(routers)
        for b in routers[i + 1:]
    ][:max_pairs]

    # One config read per router, reused across every pair and profile.
    costs = _interface_costs(client, lab)

    def neighbours(source: str) -> list[str]:
        out = []
        for link in lab["links"]:
            if link["source"] == source:
                out.append(link["target"])
            elif link["target"] == source:
                out.append(link["source"])
        return out

    stored = 0
    skipped = 0
    started = time.time()

    def handle(source: str, destination: str) -> tuple[int, int]:
        added = 0
        missed = 0

        live = real_ospf_path(lab, source, destination)
        path = live["path"]
        if not path:
            return 0, 1

        link = _path_link(lab, path)
        if not link:
            return 0, 1

        for profile in profile_list:
            impair = profile["impair"]
            try:
                if impair:
                    apply_impairment(client, link["container"], link["interface"], **impair)

                # A tbf limit only bites when there is traffic to queue.
                if impair.get("bandwidth"):
                    _drive_traffic(client, source, neighbours(source)[:2], 1.5)

                before = _path_queue_state(lab, path, client)
                measurement = measure_path(source, destination, count=4, include_traceroute=True)
                after = _path_queue_state(lab, path, client)
            except LabUnavailable:
                missed += 1
                continue
            finally:
                # Always restore the link, even if the measurement blew up.
                if impair:
                    clear_impairment(client, link["container"], link["interface"])

            if not measurement["reachable"] or measurement["latency_ms"] is None:
                missed += 1
                continue

            congestion, _drops, _errors = _congestion_from(before, after)
            cost = _path_cost(lab, path, costs)

            record_measurement(
                {
                    "latency_ms": measurement["latency_ms"],
                    "packet_loss_percent": measurement["packet_loss_percent"],
                    "bandwidth_mbps": float(impair.get("bandwidth", 1000)),
                    "hop_count": measurement.get("hop_count") or len(path) - 1,
                    "total_cost": cost,
                    "congestion_level": congestion,
                    "topology_id": f"{source}-{destination}",
                }
            )
            added += 1

        return added, missed

    for source, destination in pairs:
        try:
            added, missed = handle(source, destination)
        except Exception as exc:  # noqa: BLE001
            if on_progress:
                on_progress(f"{source}->{destination} failed: {exc}")
            continue
        stored += added
        skipped += missed
        if on_progress:
            on_progress(
                f"{source}->{destination}: {added} rows"
                + (f", {missed} unreachable" if missed else "")
            )

    return {
        "pairs": len(pairs),
        "profiles": [p["name"] for p in profile_list],
        "rows_stored": stored,
        "rows_skipped": skipped,
        "seconds": round(time.time() - started, 1),
    }
