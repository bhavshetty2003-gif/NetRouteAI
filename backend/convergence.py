"""Convergence-time measurement.

Convergence is the wall-clock time between a topology change and the network
finding a working replacement route. Measured the way the spec describes:

    t0 = now
    disable the link  (ip link set <iface> down)
    poll reachability of the destination until it succeeds
    convergence = now - t0

`ip link set down` on an OSPF transit link does not immediately break the
forwarding path (FRR keeps the adjacency until the dead timer expires), so the
poll loop measures what actually matters: when traffic flows again.
"""

from __future__ import annotations

import time
from typing import Any

from metrics_collector import (
    LabUnavailable,
    _client,
    _container,
    probe_ping,
    set_link_state,
)


def measure_convergence(
    source: str,
    destination: str,
    link: dict[str, str],
    timeout: float = 60.0,
    poll_interval: float = 0.25,
) -> dict[str, Any]:
    """Bring a link down and time how long routing takes to recover.

    `source`/`destination` are lab device ids (e.g. "R1"), which are resolved to
    container names and IPs. link = {"container": "r2", "interface": "eth0"}.

    The default timeout is 60s because OSPF's dead timer is 40s: a link that
    carries the only route to the destination stays unreachable until the dead
    timer expires, and the adjacency rebuild after that takes a few more
    seconds. Timeout below ~45s reports `detected: false` for that case.
    """
    client = _client()

    from lab_topology import discover_lab

    lab = discover_lab()
    if not lab["online"]:
        raise LabUnavailable(lab.get("error") or "Lab not running")

    container_map = lab["container_map"]
    ip_index = lab["ip_index"]

    src, dst = source.upper(), destination.upper()
    if src not in container_map or dst not in ip_index:
        raise LabUnavailable(f"'{source}'/'{destination}' not part of the running lab")

    source_container = container_map[src]
    target_ip = ip_index[dst]

    def ping_source(count: int, interval: float):
        return probe_ping(client, source_container, target_ip, count=count, interval=interval)

    container_name = link["container"]
    interface = link["interface"]

    container = _container(client, container_name)
    _, before_out = container.exec_run(["ip", "-s", "link", "show", interface], demux=True)
    from metrics_collector import _demux, parse_link_stats

    before = parse_link_stats(_demux(before_out))
    was_up = bool(before) and before[0]["state"] == "up"

    # Baseline reachability before the change
    baseline = ping_source(2, 0.1)

    started = time.perf_counter()
    set_link_state(client, container_name, interface, up=False)

    recovered_after: float | None = None
    attempts = 0
    while time.perf_counter() - started < timeout:
        attempts += 1
        probe = ping_source(1, 0.05)
        if probe["reachable"]:
            recovered_after = time.perf_counter() - started
            break
        time.sleep(poll_interval)

    if was_up:
        set_link_state(client, container_name, interface, up=True)

    after = ping_source(3, 0.1)

    return {
        "source": source,
        "destination": destination,
        "link": link,
        "convergence_ms": round(recovered_after * 1000, 1) if recovered_after else None,
        "detected": recovered_after is not None,
        "baseline_reachable": baseline["reachable"],
        "recovered_reachable": after["reachable"],
        "post_recovery_latency_ms": after["rtt_avg_ms"],
        "post_recovery_loss_percent": after["loss_percent"],
        "poll_attempts": attempts,
        "timeout_seconds": timeout,
    }
