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

    # A link with no way round it cannot converge, and reporting that as a bare
    # `detected: false` reads like a failed measurement. Whether the topology has
    # a second route is knowable from the discovered links, so it is checked up
    # front and the reason travels with the result.
    no_alternate = not _has_alternate_path(lab, container_name, interface)

    # Baseline reachability before the change
    baseline = ping_source(2, 0.1)

    started = time.perf_counter()
    set_link_state(client, container_name, interface, up=False)

    recovered_after: float | None = None
    attempts = 0
    # The link comes back up whatever happens. Bringing it down is a temporary
    # measurement, and leaving it down because the poll loop raised or was cut
    # short would silently change the network for everything measured after --
    # which is exactly what happened once: a timed-out run left R1's link to R2
    # down, and the next measurement honestly reported a detour through R12 and
    # R11 with no indication that anything had been injected.
    try:
        while time.perf_counter() - started < timeout:
            attempts += 1
            probe = ping_source(1, 0.05)
            if probe["reachable"]:
                recovered_after = time.perf_counter() - started
                break
            time.sleep(poll_interval)
    finally:
        restored = set_link_state(client, container_name, interface, up=True) if was_up else None

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
        # A link that was already down before this call stays down on purpose;
        # saying so is the difference between "we put it back" and "we found it
        # broken and left it that way".
        "link_restored": bool(was_up),
        "link_was_down_before": not was_up,
        # False convergence is a property of the topology, not of OSPF: on a cut
        # link there is nothing to converge to. Without this the UI can only say
        # "not detected" and the reader has to guess whether the router was slow
        # or the topology had no other way across.
        "alternate_path_exists": not no_alternate,
        # Only meaningful when nothing recovered. A cut link can still "converge"
        # instantly when the pair being measured never used it -- R2 -> R6 does
        # not cross R4-R5 -- and calling that a convergence time would be
        # measuring a link the traffic avoided.
        "note": (
            "This link is the only route between its two ends, so there is nothing "
            "to fail over to. Convergence is undefined for it, not unmeasured."
            if no_alternate and recovered_after is None
            else None
        ),
        "destination_avoided_failed_link": (
            bool(recovered_after is not None and no_alternate)
        ),
    }


def _has_alternate_path(
    lab: dict[str, Any], container: str, interface: str
) -> bool:
    """Is there another route between the two routers this interface joins?

    Answered from the discovered links, before anything is brought down: if
    removing this link leaves the graph connected, OSPF has a second path to
    converge onto. If it does not, the interface sits on a cut edge and no amount
    of waiting will produce a convergence time.

    Anything that cannot be identified returns True. Claiming "there is no way
    round this" on a link we failed to identify would report a topology property
    we have not actually established.
    """
    import ipaddress

    from networkx import is_connected

    from ospf_ai_service import lab_graph

    device = next(
        (d for d in lab.get("devices", []) if d.get("container") == container), None
    )
    if not device:
        return True
    address = (device.get("addresses") or {}).get(interface)
    if not address:
        return True

    # The discovered link carries the real prefix. An address on its own does
    # not: `ip_interface("192.168.4.2").network` is a /32, which would match
    # nothing and silently report every link as having a way round it.
    ends: list[str] | None = None
    for link in lab.get("links", []):
        try:
            network = ipaddress.ip_network(link.get("subnet") or "", strict=False)
        except ValueError:
            continue
        if ipaddress.ip_address(address) in network:
            ends = sorted([link.get("source"), link.get("target")])
            break
    if not ends or len(ends) != 2 or not all(ends):
        return True

    graph = lab_graph(lab)
    if not graph.has_edge(*ends):
        return True
    trimmed = graph.copy()
    trimmed.remove_edge(*ends)
    if trimmed.number_of_nodes() < 2:
        return True
    return is_connected(trimmed)
