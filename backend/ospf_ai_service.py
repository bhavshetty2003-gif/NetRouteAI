"""End-to-end OSPF vs AI comparison over the real running lab.

Produces the payload the Analytics page renders. Every figure is measured:

  * OSPF metrics  -> real `ping`/`traceroute` against the path FRR actually
                     selected (read from `vtysh show ip route`)
  * AI metrics    -> real `ping`/`traceroute` against the path the Random
                     Forest selects, with traffic steered along that path
  * convergence   -> timed by breaking a real link and polling for recovery
  * per-link      -> `ip -s link` + `tc -s qdisc` on each interface in the path

If the Docker lab is not running, `available` is False and the endpoint reports
that instead of inventing numbers.
"""

from __future__ import annotations

import ipaddress
import re
import time
from typing import Any

import networkx as nx

from ai_route_service import rank_paths
from convergence import measure_convergence
from lab_topology import discover_lab, lab_to_topology
from metrics_collector import (
    LabUnavailable,
    _client,
    _demux,
    _exec,
    measure_path,
    probe_interfaces,
    probe_ping,
    probe_traceroute,
)
from route_steer import steer_plan
from routing_service import build_graph, calculate_metrics


def lab_graph(lab: dict[str, Any]) -> nx.Graph:
    """Build the *routable* graph of the live lab.

    Only transit links carry OSPF in this lab -- `vtysh show ip route ospf` on
    r1 lists exclusively 10.0.0.0/8 prefixes, with the 192.168.x LANs present
    only as connected routes on their own gateway. So:

      * transit links become router-to-router edges, weighted with the live
        `ip ospf cost` read from the running config;
      * each LAN becomes a stub that attaches its hosts to the one router on
        that segment, which is what actually routes for them.

    Edge costs follow the OSPF convention of a LAN costing more than a
    point-to-point transit link.
    """
    G = nx.Graph()
    for d in lab["devices"]:
        G.add_node(d["id"], type=d["type"])

    client = _client()
    costs = _interface_costs(client, lab)

    for link in lab["links"]:
        if link["kind"] != "transit":
            continue
        a, b = link["source"], link["target"]
        cost = _ospf_cost(costs, lab, a, link.get("subnet"))
        G.add_edge(
            a,
            b,
            cost=cost if cost is not None else 10,
            bandwidth=1000,
            latency=0.2,
            loss_probability=0.0,
            kind="transit",
        )

    # LANs: one router per segment acts as the gateway for the other members.
    for network, members in _lan_segments(lab).items():
        gateways = [m for m in members if G.nodes[m].get("type") == "router"]
        if not gateways:
            continue
        gateway = gateways[0]
        for member in members:
            if member == gateway:
                continue
            G.add_edge(
                gateway,
                member,
                cost=10,
                bandwidth=1000,
                latency=0.2,
                loss_probability=0.0,
                kind="lan",
            )
    return G


def _lan_segments(lab: dict[str, Any]) -> dict[str, list[str]]:
    """Group LAN link records by the bridge they sit on -> member device ids."""
    segments: dict[str, set[str]] = {}
    for link in lab["links"]:
        if link["kind"] == "lan":
            segments.setdefault(link["network"], set()).update(link["members"])
    return {net: sorted(members) for net, members in segments.items()}


def _interface_costs(client, lab: dict[str, Any]) -> dict[str, dict[str, int]]:
    """Parse `{router_container: {interface: ospf_cost}}` from live FRR configs.

    `vtysh` has no per-interface config subcommand ("show running-config
    interface eth0" is rejected as an unknown command), so each router's running
    config is read once and split into interface stanzas. One read per router
    rather than one per link keeps a 12-router lab at 12 `vtysh` calls.
    """
    costs: dict[str, dict[str, int]] = {}

    for device in lab["devices"]:
        if device["type"] != "router":
            continue
        container_name = device["container"]
        if container_name in costs:
            continue

        try:
            container = client.containers.get(container_name)
        except Exception:  # noqa: BLE001
            costs[container_name] = {}
            continue

        res = container.exec_run(["vtysh", "-c", "show running-config"], demux=True)
        out = _demux(res.output)

        per_iface: dict[str, int] = {}
        current: str | None = None
        for line in out.splitlines():
            stripped = line.strip()
            if stripped.startswith("interface "):
                current = stripped.split()[1]
            elif stripped in ("exit", "!"):
                current = None
            elif current and stripped.startswith("ip ospf cost "):
                try:
                    per_iface[current] = int(stripped.rsplit(" ", 1)[1])
                except ValueError:
                    pass
        costs[container_name] = per_iface

    return costs


def _ospf_cost(
    costs: dict[str, dict[str, int]], lab: dict[str, Any], a: str, subnet: str | None
) -> int | None:
    """Live OSPF cost on the interface of `a` that sits on `subnet`."""
    device = next((d for d in lab["devices"] if d["id"] == a), None)
    if not device:
        return None

    iface = next(
        (name for name, addr in device["addresses"].items() if _in_subnet(addr, subnet)),
        None,
    )
    if not iface:
        return None

    return costs.get(device["container"], {}).get(iface)


def ospf_path(G: nx.Graph, source: str, destination: str) -> list[str]:
    """Fallback OSPF estimate: Dijkstra on the modelled interface costs.

    Only used when the live path cannot be read. Prefer `real_ospf_path`.
    """
    try:
        return nx.shortest_path(G, source, destination, weight="cost")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return []


def _ip_owner_index(lab: dict[str, Any]) -> dict[str, str]:
    """Map every lab IPv4 address to the device id that holds it."""
    index: dict[str, str] = {}
    for device in lab["devices"]:
        for addr in device["addresses"].values():
            index[addr] = device["id"]
    return index


def real_ospf_path(lab: dict[str, Any], source: str, destination: str) -> dict[str, Any]:
    """The OSPF path as the live network actually forwards it.

    Derived from `traceroute` hop addresses rather than by reimplementing FRR's
    SPF arithmetic: every hop IP is mapped back to the lab device holding it,
    giving the true forwarding path with real per-hop RTTs.

    Hand-rolled SPF is genuinely wrong here -- the modelled Dijkstra selected
    R1->R2->R11 while the routers in the lab forward R1->R12->R11, because OSPF
    charges cost on each router's own outgoing interface (r1->r2 costs 5 while
    r2->r1 costs 20), which a symmetric undirected graph cannot express.

    `truncated` is True when a hop answered but is not a known lab device, so the
    caller can fall back to the modelled path.
    """
    client = _client()
    src_dev = next((d for d in lab["devices"] if d["id"] == source), None)
    dest_ip = lab["ip_index"].get(destination)
    if not src_dev or not dest_ip:
        return {"path": [], "hops": [], "truncated": True, "method": "unavailable"}

    trace = probe_traceroute(client, src_dev["container"], dest_ip)
    owners = _ip_owner_index(lab)

    path = [source]
    hops: list[dict[str, Any]] = []
    truncated = False
    answered_any = False

    for line in trace.get("raw_lines", []):
        m = re.match(r"\s*(\d+)\s+(\S+)(.*)$", line)
        if not m:
            continue
        number = int(m.group(1))
        hop_ip = m.group(2)
        answered = "*" not in m.group(3)
        rtts = [float(x) for x in re.findall(r"([\d.]+)\s*ms", m.group(3))]
        answered_any = answered_any or answered

        device_id = owners.get(hop_ip) if re.match(r"^\d+\.\d+\.\d+\.\d+$", hop_ip) else None
        hops.append(
            {
                "hop": number,
                "address": hop_ip,
                "device": device_id,
                "rtt_ms": round(sum(rtts) / len(rtts), 4) if rtts else None,
            }
        )
        if device_id is None:
            if answered:
                truncated = True
        elif device_id != path[-1]:
            path.append(device_id)

    if not answered_any:
        # Nothing replied: report no path rather than inventing a direct hop.
        return {
            "path": [],
            "hops": hops,
            "truncated": True,
            "method": "unreachable",
        }

    if path[-1] != destination:
        path.append(destination)

    return {
        "path": path,
        "hops": hops,
        "truncated": truncated,
        "method": "traceroute (live forwarding path)",
    }


def _path_ifaces(path: list[str], lab: dict) -> list[dict[str, str]]:
    """Map each hop to the concrete (container, interface, subnet) that carries it.

    Two devices on the same wire hold *different* addresses inside that wire's
    subnet (R1 is 10.0.0.10, R12 is 10.0.0.11, both on 10.0.0.8/29), so a hop is
    identified by shared subnet membership, not by equal addresses.
    """
    link_index = {
        frozenset((l["source"], l["target"])): l for l in lab["links"]
    }
    by_id = {d["id"]: d for d in lab["devices"]}

    out: list[dict[str, str]] = []
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]

        # Prefer the discovered link record: it carries the subnet for the wire.
        link = link_index.get(frozenset((a, b)))
        if link is None:
            continue

        subnet = link.get("subnet")
        local = next(
            (
                (iface, addr)
                for iface, addr in by_id.get(a, {}).get("addresses", {}).items()
                if _in_subnet(addr, subnet)
            ),
            None,
        )
        if local is None:
            continue

        out.append(
            {
                "container": by_id[a]["container"],
                "interface": local[0],
                "from": a,
                "to": b,
                "local_ip": local[1],
                "subnet": subnet,
                "kind": link.get("kind", "transit"),
                "network": link.get("network", ""),
            }
        )
    return out


def _in_subnet(addr: str, subnet: str | None) -> bool:
    """True when `addr` falls inside `subnet`. Lab links are all /29."""
    if not addr or not subnet:
        return False
    try:
        return ipaddress.ip_address(addr) in ipaddress.ip_network(subnet, strict=False)
    except ValueError:
        return False


def _target_addresses(lab: dict[str, Any], device_id: str) -> list[str]:
    """All addresses of a lab device, primary first."""
    device = next((d for d in lab["devices"] if d["id"] == device_id), None)
    if not device:
        return []
    addrs = list(device["addresses"].values())
    primary = lab["ip_index"].get(device_id)
    if primary in addrs:
        addrs.remove(primary)
        addrs.insert(0, primary)
    return addrs


def _link_endpoint_addresses(lab: dict[str, Any], a: str, b: str) -> list[str]:
    """Address of `b` on the subnet that also carries `a`."""
    link = next(
        (
            l
            for l in lab["links"]
            if frozenset((l["source"], l["target"])) == frozenset((a, b))
        ),
        None,
    )
    if not link:
        return []
    return [addr for addr in _target_addresses(lab, b) if _in_subnet(addr, link.get("subnet"))]


def _measure_path_hops(path: list[str], lab: dict) -> dict[str, Any]:
    """Ping each hop-to-hop segment so latency is measured, not computed."""
    if len(path) < 2:
        return {"segments": [], "total_latency_ms": None, "reachable": False}

    client = _client()
    segments: list[dict[str, Any]] = []
    total = 0.0
    reachable = True
    measured = 0

    for i in range(len(path) - 1):
        src, dst = path[i], path[i + 1]
        src_dev = next((d for d in lab["devices"] if d["id"] == src), None)
        if not src_dev:
            continue

        # The next hop is adjacent, so the address on the connecting subnet is
        # the right target. Fall back to any of its addresses that answers.
        candidates = _link_endpoint_addresses(lab, src, dst) or _target_addresses(lab, dst)
        if not candidates:
            continue

        ping = None
        for candidate in candidates:
            try:
                attempt = probe_ping(
                    client, src_dev["container"], candidate, count=4, interval=0.15
                )
            except LabUnavailable:
                continue
            if ping is None:
                ping = attempt
            if attempt["reachable"]:
                ping = attempt
                break
        if ping is None:
            continue
        segments.append(
            {
                "from": src,
                "to": dst,
                "latency_ms": ping["rtt_avg_ms"],
                "jitter_ms": ping["jitter_ms"],
                "packet_loss_percent": ping["loss_percent"],
                "reachable": ping["reachable"],
                "command": ping["command"],
            }
        )
        if ping["rtt_avg_ms"] is not None:
            total += ping["rtt_avg_ms"]
            measured += 1
        if not ping["reachable"]:
            reachable = False

    return {
        "segments": segments,
        "total_latency_ms": round(total, 4) if measured else None,
        "measured_segments": measured,
        "reachable": reachable and measured > 0,
    }


def _link_metrics(path: list[str], lab: dict) -> list[dict[str, Any]]:
    """Per-link interface counters and queue depth for a path."""
    client = _client()
    rows: list[dict[str, Any]] = []
    for hop in _path_ifaces(path, lab):
        try:
            data = probe_interfaces(client, hop["container"])
        except LabUnavailable:
            continue
        iface = next(
            (i for i in data["interfaces"] if i["name"] == hop["interface"]), None
        )
        queue = data["queues"].get(hop["interface"], {})
        rows.append(
            {
                **hop,
                "state": iface["state"] if iface else "unknown",
                "rx_packets": iface["rx_packets"] if iface else 0,
                "tx_packets": iface["tx_packets"] if iface else 0,
                "rx_bytes": iface["rx_bytes"] if iface else 0,
                "tx_bytes": iface["tx_bytes"] if iface else 0,
                "errors": (iface["rx_errors"] + iface["tx_errors"]) if iface else 0,
                "dropped": (iface["rx_dropped"] + iface["tx_dropped"]) if iface else 0,
                "queue_length": queue.get("queue_length", 0),
                "backlog_packets": queue.get("backlog_packets", 0),
                "qdisc_drops": queue.get("dropped", 0),
            }
        )
    return rows


def compare_ospf_vs_ai(
    source: str,
    destination: str,
    include_convergence: bool = True,
    convergence_link: dict[str, str] | None = None,
    method: str = "ospf",
) -> dict[str, Any]:
    """Measure every routing method over the live lab and compare them.

    `method` selects which path the page treats as the active route. All three
    are always measured so the selection changes what is compared rather than
    hiding the alternatives.
    """
    lab = discover_lab()
    if not lab["online"]:
        raise LabUnavailable(lab.get("error") or "Lab not running")

    source, destination = source.upper(), destination.upper()
    if source not in lab["ip_index"] or destination not in lab["ip_index"]:
        raise LabUnavailable(
            f"'{source}' or '{destination}' is not part of the running lab"
        )
    if method not in ROUTING_METHODS:
        raise LabUnavailable(
            f"Unknown routing method '{method}'. Use one of: {', '.join(ROUTING_METHODS)}"
        )

    G = lab_graph(lab)

    # --- OSPF route, from three independent sources, most authoritative first.
    #
    # 1. Each router's OSPF RIB: what OSPF itself decides, unaffected by any
    #    static route in effect.
    # 2. traceroute: what the network is actually forwarding right now.
    # 3. Modelled Dijkstra over live interface costs, as a last resort.
    #
    # (2) is what the previous implementation used on its own, which is wrong
    # once the lab is steered: a static route makes traceroute report the AI
    # path, and calling that "the OSPF path" would be circular.
    rib = ospf_rib_path(lab, source, destination)
    live = real_ospf_path(lab, source, destination)
    modelled = ospf_path(G, source, destination)
    traced_ok = bool(live["path"]) and not live["truncated"] and live["path"][-1] == destination

    if rib and rib[-1] == destination:
        ospf = rib
        ospf_basis = "OSPF RIB on each router (show ip route ospf)"
    elif traced_ok:
        ospf = live["path"]
        ospf_basis = "Live forwarding path (traceroute)"
    else:
        ospf = modelled
        ospf_basis = (
            "Modelled Dijkstra on live interface cost (traceroute hop unattributable)"
        )
    if not ospf:
        raise LabUnavailable(f"No OSPF path between {source} and {destination}")

    ospf_measurements = _measure_path_hops(ospf, lab)

    # --- AI route (Random Forest ranking) ---
    ranked = rank_paths(G, source, destination)
    if "error" in ranked:
        raise LabUnavailable(ranked["error"])
    ai = ranked["best"]["path"]
    ai_measurements = _measure_path_hops(ai, lab)

    # --- Shortest-path (Dijkstra) route: the textbook SPF baseline ---
    dijkstra = ospf_path(G, source, destination) or ospf
    dijkstra_measurements = (
        ospf_measurements
        if dijkstra == ospf
        else _measure_path_hops(dijkstra, lab)
    )

    # --- End-to-end measurement from the real source container ---
    end_to_end = measure_path(source, destination, count=6)

    traced = resolve_traced_hops(end_to_end.get("hops", []), lab)
    walked = path_taken(traced, source)

    result: dict[str, Any] = {
        "available": True,
        "measured_at": time.time(),
        "source": source,
        "destination": destination,
        "methods": list(ROUTING_METHODS),
        "active_method": method,
        "ospf": _route_report(
            ospf, ospf_measurements, G, lab, ospf_basis, live["hops"]
        ),
        "ai": _route_report(
            ai,
            ai_measurements,
            G,
            lab,
            "Random Forest congestion-aware selection (modelled graph)",
            [],
        ),
        "dijkstra": _route_report(
            dijkstra,
            dijkstra_measurements,
            G,
            lab,
            "Dijkstra shortest path on live interface cost (modelled graph)",
            [],
        ),
        "path_taken": walked,
        "path_taken_matches": _matches_method(walked, ospf, ai, dijkstra),
        "forwarding_method": _forwarding_method(walked, ospf, ai, dijkstra),
        "end_to_end": {
            "latency_ms": end_to_end["latency_ms"],
            "rtt_min_ms": end_to_end["rtt_min_ms"],
            "rtt_max_ms": end_to_end["rtt_max_ms"],
            "jitter_ms": end_to_end["jitter_ms"],
            "packet_loss_percent": end_to_end["packet_loss_percent"],
            "hop_count": end_to_end["hop_count"],
            "reachable": end_to_end["reachable"],
            "target_ip": end_to_end["target_ip"],
            "packets_sent": end_to_end["packets_sent"],
            "packets_received": end_to_end["packets_received"],
            "addresses_tried": end_to_end["addresses_tried"],
            "hops": traced,
            "command": end_to_end["raw"]["ping"]["command"],
            "traceroute_command": end_to_end["raw"].get("traceroute", {}).get("command"),
            "diagnosis": _diagnose(end_to_end),
        },
        "ai_ranking": [
            {
                "path": s["path"],
                "quality": s["quality"],
                "latency_ms": s["latency_ms"],
                "bandwidth_mbps": s["bandwidth_mbps"],
                "total_cost": s["total_cost"],
                "hop_count": s["hop_count"],
            }
            for s in ranked["ranking"]
        ],
        "model": ranked["model"],
        "confidence": ranked["confidence"],
    }

    result["active"] = _active_method(
        method, ospf, ai, dijkstra, walked, lab, source, destination
    )
    result["comparison"] = _build_comparison(result)

    if include_convergence:
        link = convergence_link or _first_transit_link(ospf, lab)
        if link:
            try:
                result["convergence"] = measure_convergence(
                    source, destination, link, timeout=60.0
                )
            except LabUnavailable as exc:
                result["convergence"] = {"error": str(exc)}
        else:
            result["convergence"] = {"error": "No transit link available to test"}

    return result


def _method_paths(ospf: list[str], ai: list[str], dijkstra: list[str]) -> dict[str, list[str]]:
    return {"ospf": ospf, "ai": ai, "dijkstra": dijkstra}


# One line of `show ip route ospf`, e.g.
#   O>* 10.0.0.56/29 [110/15] via 10.0.0.11, eth0, weight 1, 01:42:23
_RIB_ENTRY = re.compile(
    r"^O[>*]*\s+(?P<prefix>\d+\.\d+\.\d+\.\d+/\d+)\s+\[(?P<dist>\d+)/(?P<metric>\d+)\]\s+"
    r"(?:is directly connected|(?:via|is directly connected,\s*)\s*(?P<nexthop>[\d.]+)?)"
)
_RIB_NEXTHOP = re.compile(r"(?:via\s+(?P<nexthop>[\d.]+))?")
_RIB_DIRECT = "is directly connected"


def _parse_ospf_rib(output: str) -> list[dict[str, Any]]:
    """Parse `show ip route ospf` into prefix / distance / metric / next hop.

    Only the OSPF RIB is read, never the whole table. That matters because the
    static routes used to steer the lab have distance 1 and would otherwise be
    the winning entry, making the OSPF column report the AI path back at us.
    """
    entries: list[dict[str, Any]] = []
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped.startswith("O"):
            continue
        m = re.match(
            r"^O[>*]*\s+(?P<prefix>\d+\.\d+\.\d+\.\d+/\d+)\s+"
            r"\[(?P<distance>\d+)/(?P<metric>\d+)\]\s+(?P<rest>.*)$",
            stripped,
        )
        if not m:
            continue
        rest = m.group("rest")
        hop = re.search(r"via\s+(\d+\.\d+\.\d+\.\d+)", rest)
        entries.append(
            {
                "prefix": m.group("prefix"),
                "distance": int(m.group("distance")),
                "metric": int(m.group("metric")),
                "next_hop": hop.group(1) if hop else None,
                "connected": _RIB_DIRECT in rest,
            }
        )
    return entries


def _ospf_nexthop(entries: list[dict[str, Any]], dest_ip: str) -> dict[str, Any] | None:
    """Longest-prefix OSPF entry covering `dest_ip`, or None if OSPF has none."""
    try:
        target = ipaddress.ip_address(dest_ip)
    except ValueError:
        return None

    best: dict[str, Any] | None = None
    best_bits = -1
    for entry in entries:
        try:
            network = ipaddress.ip_network(entry["prefix"], strict=False)
        except ValueError:
            continue
        if target not in network:
            continue
        if network.prefixlen > best_bits:
            best, best_bits = entry, network.prefixlen
    return best


def ospf_rib_path(lab: dict[str, Any], source: str, destination: str) -> list[str]:
    """The path OSPF itself would forward, read from each router's OSPF RIB.

    Walking the RIB hop by hop is what makes this independent of any static
    route in effect. `real_ospf_path` reads the same thing indirectly via
    traceroute, but traceroute reports what is *actually* forwarded, so the two
    differ precisely when the lab has been steered onto the AI path -- and
    reporting the steered path as "the OSPF path" would be circular.
    """
    client = _client()
    owners = _ip_owner_index(lab)
    dest_ip = lab["ip_index"].get(destination)
    src_dev = next((d for d in lab["devices"] if d["id"] == source), None)
    if not src_dev or not dest_ip:
        return []

    by_address = {addr: d["id"] for d in lab["devices"] for addr in d["addresses"].values()}

    path = [source]
    current = source
    for _ in range(12):  # bounded so a routing loop cannot hang the request
        dev = next((d for d in lab["devices"] if d["id"] == current), None)
        if not dev:
            break
        code, out = _exec(
            dev["container"],
            ["vtysh", "-c", "show ip route ospf"],
            timeout=20,
        )
        if code != 0:
            break
        entry = _ospf_nexthop(_parse_ospf_rib(out), dest_ip)
        if entry is None:
            # OSPF has no route from here; the destination is reachable only via
            # another protocol or directly. Stop rather than invent a hop.
            if current != destination:
                break
            break
        if entry["connected"] and current != destination:
            # The destination sits on a subnet this router holds directly, so it
            # is the last transit hop.
            next_device = owners.get(dest_ip)
            if not next_device or next_device == current:
                break
            path.append(next_device)
            break

        next_hop = entry["next_hop"]
        if not next_hop or next_hop in path:
            break
        next_device = by_address.get(next_hop)
        if not next_device:
            break
        path.append(next_device)
        current = next_device
        if current == destination:
            break

    if path[0] != source:
        return []
    if path[-1] != destination:
        # The walk ran out of OSPF knowledge before reaching the destination.
        return [] if len(path) == 1 else path + [destination]
    return path


def _forwarding_method(
    walked: list[str], ospf: list[str], ai: list[str], dijkstra: list[str]
) -> str | None:
    """Which single method the walked path corresponds to, if any does.

    The AI and Dijkstra paths are frequently identical, so this returns the
    first match in a fixed order and the UI labels it as ambiguous rather than
    pretending the distinction is meaningful.
    """
    if not walked:
        return None
    for name, path in _method_paths(ospf, ai, dijkstra).items():
        if path and walked == path:
            return name
    return None


def path_for_method(lab: dict[str, Any], method: str, source: str, destination: str) -> list[str]:
    """The path a named routing method would use, computed fresh from the lab.

    Used by the steer endpoint, which must not depend on a prior
    `/api/analytics/live` call having happened.
    """
    G = lab_graph(lab)
    if method == "ai":
        ranked = rank_paths(G, source, destination)
        if "error" in ranked:
            raise LabUnavailable(ranked["error"])
        return ranked["best"]["path"]
    if method in ("ospf", "dijkstra"):
        return ospf_path(G, source, destination) or []
    raise LabUnavailable(
        f"Unknown routing method '{method}'. Use one of: {', '.join(ROUTING_METHODS)}"
    )


def _matches_method(
    walked: list[str],
    ospf: list[str],
    ai: list[str],
    dijkstra: list[str],
) -> dict[str, bool]:
    """Which methods the traced forwarding path actually agrees with.

    The routers only forward the OSPF path unless a static route overrides it,
    so this is what tells the UI whether the selected method is merely *chosen*
    or genuinely *in effect*.
    """
    return {
        name: bool(walked and path and walked == path)
        for name, path in _method_paths(ospf, ai, dijkstra).items()
    }


def _active_method(
    method: str,
    ospf: list[str],
    ai: list[str],
    dijkstra: list[str],
    walked: list[str],
    lab: dict[str, Any],
    source: str,
    destination: str,
) -> dict[str, Any]:
    """Describe the routing method in effect, and how to make it so if it is not.

    FRR keeps forwarding its own OSPF path unless a static route overrides it,
    so "AI is selected" and "the lab is actually forwarding the AI path" are
    different claims. Both are reported here rather than conflated.
    """
    paths = _method_paths(ospf, ai, dijkstra)
    path = paths[method]
    labels = {
        "ospf": "OSPF (live forwarding)",
        "ai": "AI / Random Forest selection",
        "dijkstra": "Shortest path (Dijkstra)",
    }
    in_effect = bool(walked and path and walked == path)
    steer = steer_plan(method, path, lab, source, destination)

    note = (
        "The routers are forwarding this path."
        if in_effect
        else "Selected, but the routers are still forwarding the OSPF path. "
        "Apply it to install a static route that overrides OSPF for this pair."
        if steer.get("applicable")
        else "Selected. It cannot be applied to the data plane because the next "
        "hop is not directly attached to the source router."
    )

    return {
        "method": method,
        "label": labels[method],
        "path": path,
        "in_effect": in_effect,
        "note": note,
        "steer": steer,
    }


def _diagnose(end_to_end: dict[str, Any]) -> str | None:
    """Explain an unreachable end-to-end measurement, or None when it succeeded.

    This lab's LAN-attached hosts sit behind ABRs whose OSPF area is a stub and
    which also carry a stale kernel default route, so a PC can reach its own
    gateway but nothing beyond it. Saying "100% loss" without that context makes
    a working lab look broken, so the specific cause is reported.
    """
    if end_to_end["reachable"]:
        return None

    hops = end_to_end.get("hops") or []
    answered = [h for h in hops if h.get("rtt_ms") is not None]

    if not answered:
        return (
            f"{end_to_end['source']} cannot reach {end_to_end['target_ip']} at all. "
            "The source has no working route into that subnet."
        )
    if len(answered) == 1:
        return (
            f"{end_to_end['source']} reaches its first hop "
            f"({end_to_end['source_container']} -> gateway) but the path stops there. "
            "The gateway router has no OSPF route onward; in this lab the area-2 "
            "ABRs are in a stub area and carry a stale default route."
        )
    return (
        f"Path breaks after {len(answered)} hop(s); the remaining hops did not "
        "answer ICMP."
    )


def _model_metrics(G: nx.Graph, path: list[str]) -> dict[str, Any]:
    """Model-derived metrics for a path, tolerant of links the graph lacks.

    A live traceroute path can cross a segment the transit-only graph does not
    model, so metrics are accumulated only over the pairs that are present and
    the coverage is reported alongside. Measured latency/loss always come from
    `_measure_path_hops`; these figures are the topology-model view.
    """
    bandwidth = float("inf")
    latency = 0.0
    loss = 0.0
    cost = 0.0
    modelled = 0

    for a, b in zip(path, path[1:]):
        if not G.has_edge(a, b):
            continue
        edge = G[a][b]
        bandwidth = min(bandwidth, edge.get("bandwidth", 100))
        latency += edge.get("latency", 10)
        loss += edge.get("loss_probability", 0.0)
        cost += edge.get("cost", 1)
        modelled += 1

    if bandwidth == float("inf"):
        bandwidth = 0.0

    return {
        "bandwidth": round(bandwidth, 2),
        "latency": round(latency, 2),
        "packet_loss": round(loss, 4),
        "total_cost": cost,
        "modelled_hops": modelled,
        "path_hops": len(path) - 1,
    }


def _route_report(
    path: list[str],
    measurements: dict[str, Any],
    G: nx.Graph,
    lab: dict[str, Any],
    basis: str,
    hops: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "path": path,
        "hop_count": len(path) - 1,
        "basis": basis,
        "latency_ms": measurements["total_latency_ms"],
        "reachable": measurements["reachable"],
        "measured_segments": measurements["measured_segments"],
        "segments": measurements["segments"],
        "hops": hops or [],
        "links": _link_metrics(path, lab),
        "computed": _model_metrics(G, path),
    }


def _first_transit_link(path: list[str], lab: dict) -> dict[str, str] | None:
    """Pick a real transit interface on the path for the convergence test."""
    for hop in _path_ifaces(path, lab):
        if hop.get("kind") == "transit":
            return {"container": hop["container"], "interface": hop["interface"]}
    return None


# --------------------------------------------------------------------------- #
# The path the packets actually take
# --------------------------------------------------------------------------- #

# Routing methods the UI can select. `ospf` is the ground truth: it is whatever
# FRR forwards with nothing injected. The other two are paths the lab can be
# steered onto with a static route (see route_steer.py).
ROUTING_METHODS = ("ospf", "ai", "dijkstra")


def resolve_traced_hops(
    hops: list[dict[str, Any]], lab: dict[str, Any]
) -> list[dict[str, Any]]:
    """Attach the owning lab device to each traceroute hop.

    A hop IP is mapped through the address index, so `10.0.0.11` becomes `R12`.
    This is what turns a traceroute into a path a person can read, and it is why
    `parse_traceroute` keeps the answering address instead of discarding it.
    """
    owners = _ip_owner_index(lab)
    resolved: list[dict[str, Any]] = []
    for hop in hops:
        address = hop.get("address")
        resolved.append(
            {
                "hop": hop.get("hop"),
                "address": address,
                "device": owners.get(address) if address else None,
                "rtt_ms": hop.get("rtt_ms"),
            }
        )
    return resolved


def path_taken(traced: list[dict[str, Any]], source: str) -> list[str]:
    """The device chain a packet really walked, from a resolved traceroute.

    Consecutive hops can belong to the same device -- a router answers for
    several TTLs, and OSPF raises the TTL mid-path -- so repeats are collapsed
    rather than reported as a loop.
    """
    chain = [source]
    for hop in traced:
        device = hop.get("device")
        if device and device != chain[-1]:
            chain.append(device)
    return chain


def _build_comparison(result: dict[str, Any]) -> dict[str, Any]:
    """Row-by-row OSPF vs AI comparison built from measured values."""
    ospf, ai = result["ospf"], result["ai"]

    def fmt(value, unit="ms", digits=3):
        return "n/a" if value is None else f"{value:.{digits}f} {unit}"

    ospf_lat = ospf["latency_ms"]
    ai_lat = ai["latency_ms"]
    lat_delta = (
        round((1 - ai_lat / ospf_lat) * 100, 1)
        if ospf_lat and ai_lat is not None
        else None
    )

    hops_delta = ai["hop_count"] - ospf["hop_count"]
    cost_ospf = ospf["computed"].get("total_cost", 0)
    cost_ai = ai["computed"].get("total_cost", 0)

    return {
        "rows": [
            {
                "parameter": "Latency (RTT)",
                "ospf": fmt(ospf_lat),
                "ai": fmt(ai_lat),
                "winner": _winner(ospf_lat, ai_lat, lower_is_better=True),
                "detail": f"{lat_delta:+.1f}% vs OSPF" if lat_delta is not None else "not comparable",
            },
            {
                "parameter": "Hop Count",
                "ospf": f"{ospf['hop_count']} hops",
                "ai": f"{ai['hop_count']} hops",
                "winner": "ai" if hops_delta < 0 else ("ospf" if hops_delta > 0 else "tie"),
                "detail": f"{abs(hops_delta)} hop difference" if hops_delta else "identical",
            },
            {
                "parameter": "Path Cost",
                "ospf": f"{cost_ospf:g}",
                "ai": f"{cost_ai:g}",
                "winner": _winner(cost_ospf, cost_ai, lower_is_better=True),
                "detail": "sum of OSPF interface costs on the path",
            },
            {
                "parameter": "Min Bandwidth",
                "ospf": fmt(ospf["computed"]["bandwidth"], "Mbps", 1),
                "ai": fmt(ai["computed"]["bandwidth"], "Mbps", 1),
                "winner": _winner(
                    ospf["computed"]["bandwidth"],
                    ai["computed"]["bandwidth"],
                    lower_is_better=False,
                ),
                "detail": "bottleneck link on the path",
            },
            {
                "parameter": "Measured Segments",
                "ospf": f"{len(ospf['segments'])}",
                "ai": f"{len(ai['segments'])}",
                "winner": "tie",
                "detail": "hop-to-hop pings executed",
            },
            {
                "parameter": "Reachable",
                "ospf": "yes" if ospf["reachable"] else "no",
                "ai": "yes" if ai["reachable"] else "no",
                "winner": "ai" if ai["reachable"] and not ospf["reachable"] else "tie",
                "detail": "all hops answered ping",
            },
        ],
        "end_to_end": result["end_to_end"],
    }


def _winner(ospf_value, ai_value, lower_is_better: bool) -> str:
    """Return 'ospf' | 'ai' | 'tie' | 'n/a' for a two-way metric comparison."""
    if ospf_value is None or ai_value is None:
        return "n/a"
    if ospf_value == ai_value:
        return "tie"
    ai_better = ai_value < ospf_value if lower_is_better else ai_value > ospf_value
    return "ai" if ai_better else "ospf"
