"""
Real Network Metrics Collector for NetRouteAI.

Collects genuine network metrics from Docker containers running FRR (Free Range Routing).
Uses docker exec to run vtysh commands and ping inside containers, then parses the output
to extract OSPF neighbor status, interface statistics, routing tables, link state database,
ping latency/loss, and container resource usage.
"""

import json
import logging
import os
import re
import time
from datetime import datetime
from typing import Any, Optional

import docker

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("real_metrics_collector")

# ---------------------------------------------------------------------------
# Docker client (lazy singleton)
# ---------------------------------------------------------------------------
_docker_client: Optional[docker.DockerClient] = None


def get_docker_client() -> docker.DockerClient:
    """Return a cached Docker client, creating it on first use."""
    global _docker_client
    if _docker_client is None:
        _docker_client = docker.from_env()
    return _docker_client


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------

def _exec(container, cmd: str, timeout: int = 30) -> tuple[int, str]:
    """Execute a command inside a container, returning (exit_code, output)."""
    try:
        result = container.exec_run(cmd, timeout=timeout)
        exit_code = result.exit_code if result.exit_code is not None else -1
        output = result.output.decode("utf-8", errors="replace") if isinstance(result.output, bytes) else str(result.output)
        return exit_code, output
    except docker.errors.APIError as e:
        logger.error("Docker API error running '%s': %s", cmd, e)
        return -1, ""
    except Exception as e:
        logger.error("Unexpected error running '%s': %s", cmd, e)
        return -1, ""


def _get_container(container_name: str):
    """Get a container object by name, raising ContainerNotFound if missing."""
    client = get_docker_client()
    try:
        return client.containers.get(container_name)
    except docker.errors.NotFound:
        raise ContainerNotFound(f"Container '{container_name}' not found")
    except docker.errors.APIError as e:
        raise ContainerNotFound(f"Error accessing container '{container_name}': {e}")


class ContainerNotFound(Exception):
    """Raised when a Docker container cannot be found or accessed."""
    pass


# ---------------------------------------------------------------------------
# OSPF metrics
# ---------------------------------------------------------------------------

def collect_ospf_metrics(container_name: str) -> dict[str, Any]:
    """
    Collect OSPF metrics from a container via vtysh.

    Returns a dict with:
        - neighbors: list of {neighbor_id, priority, state, dead_time, address, interface, retransmit_q, area}
        - interface: {area, cost, state, type, bandwidth}
        - raw_neighbor_output: str
        - raw_interface_output: str
        - converged: bool
    """
    logger.info("Collecting OSPF metrics from container '%s'", container_name)
    container = _get_container(container_name)

    metrics: dict[str, Any] = {
        "container": container_name,
        "timestamp": datetime.now().isoformat(),
        "neighbors": [],
        "interface": {},
        "converged": False,
        "raw_neighbor_output": "",
        "raw_interface_output": "",
    }

    # --- Neighbors ---
    exit_code, output = _exec(container, "vtysh -c 'show ip ospf neighbor'")
    metrics["raw_neighbor_output"] = output

    if exit_code != 0:
        logger.warning("vtysh neighbor query failed on '%s' (exit %d)", container_name, exit_code)
        return metrics

    neighbors = _parse_ospf_neighbors(output)
    metrics["neighbors"] = neighbors

    # Consider converged if at least one neighbor is in Full state
    metrics["converged"] = any(n["state"] == "Full" for n in neighbors)

    # --- Interface ---
    exit_code, output = _exec(container, "vtysh -c 'show ip ospf interface'")
    metrics["raw_interface_output"] = output

    if exit_code == 0:
        metrics["interface"] = _parse_ospf_interface(output)

    logger.info(
        "OSPF metrics for '%s': %d neighbors, converged=%s",
        container_name, len(neighbors), metrics["converged"],
    )
    return metrics


def _parse_ospf_neighbors(output: str) -> list[dict[str, Any]]:
    """Parse 'show ip ospf neighbor' output into structured data."""
    neighbors = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("Neighbor ID") or line.startswith("%"):
            continue
        # Typical format:
        # Neighbor ID     Pri State      Dead Time  Address         Interface    LQ    MQ
        # 10.0.0.2          1 Full/DR      34         10.0.0.2        eth1          0     0
        parts = line.split()
        if len(parts) < 6:
            continue
        try:
            neighbor = {
                "neighbor_id": parts[0],
                "priority": int(parts[1]),
                "state": parts[2],
                "dead_time": parts[3],
                "address": parts[4],
                "interface": parts[5],
            }
            neighbors.append(neighbor)
        except (ValueError, IndexError):
            logger.debug("Skipping unparseable OSPF neighbor line: %s", line)
            continue
    return neighbors


def _parse_ospf_interface(output: str) -> dict[str, Any]:
    """Parse 'show ip ospf interface' output for area, cost, state, bandwidth."""
    iface: dict[str, Any] = {}
    for line in output.splitlines():
        line = line.strip()
        if "Internet Address" in line:
            # e.g. "  Internet Address 10.0.0.1/24, Area 0.0.0.0, Attached via Interface"
            m = re.search(r"Area\s+([\d.]+)", line)
            if m:
                iface["area"] = m.group(1)
        elif "Cost" in line:
            # e.g. "  Cost: 10, State: DR, Priority: 1"
            m = re.search(r"Cost:\s*(\d+)", line)
            if m:
                iface["cost"] = int(m.group(1))
            m = re.search(r"State:\s*(\w+)", line)
            if m:
                iface["state"] = m.group(1)
        elif "Bandwidth" in line:
            # e.g. "  Bandwidth: 1000000 kbit"
            m = re.search(r"Bandwidth:\s*(\d+)\s*(\w+)", line)
            if m:
                value = int(m.group(1))
                unit = m.group(2).lower()
                if "mbit" in unit:
                    iface["bandwidth_mbps"] = value
                elif "kbit" in unit:
                    iface["bandwidth_mbps"] = value / 1000.0
                elif "gbit" in unit:
                    iface["bandwidth_mbps"] = value * 1000
                else:
                    iface["bandwidth_mbps"] = value
        elif "Network Type" in line:
            m = re.search(r"Network Type\s+(\w+)", line)
            if m:
                iface["type"] = m.group(1)
    return iface


# ---------------------------------------------------------------------------
# Interface metrics
# ---------------------------------------------------------------------------

def collect_interface_metrics(container_name: str) -> dict[str, Any]:
    """
    Collect interface statistics from a container.

    Returns a dict with:
        - interfaces: list of {name, rx_bytes, tx_bytes, rx_errors, tx_errors,
                                rx_dropped, tx_dropped, bandwidth_mbps, mtu, state}
        - raw_output: str
    """
    logger.info("Collecting interface metrics from container '%s'", container_name)
    container = _get_container(container_name)

    metrics: dict[str, Any] = {
        "container": container_name,
        "timestamp": datetime.now().isoformat(),
        "interfaces": [],
        "raw_output": "",
    }

    # Use 'ip -s link' for detailed stats
    exit_code, output = _exec(container, "ip -s link show")
    metrics["raw_output"] = output

    if exit_code != 0:
        logger.warning("'ip -s link' failed on '%s' (exit %d)", container_name, exit_code)
        return metrics

    interfaces = _parse_interface_stats(output)
    metrics["interfaces"] = interfaces

    logger.info("Interface metrics for '%s': %d interfaces", container_name, len(interfaces))
    return metrics


def _parse_interface_stats(output: str) -> list[dict[str, Any]]:
    """Parse 'ip -s link show' output into structured interface data."""
    interfaces = []
    current: Optional[dict[str, Any]] = None

    for line in output.splitlines():
        # Interface header line: "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ..."
        m = re.match(r"^\d+:\s+(\S+):\s+<([^>]+)>", line)
        if m:
            if current:
                interfaces.append(current)
            current = {
                "name": m.group(1).rstrip(":"),
                "flags": m.group(2).split(","),
                "state": "UP" if "UP" in m.group(2) else "DOWN",
            }
            mtu_m = re.search(r"mtu\s+(\d+)", line)
            if mtu_m:
                current["mtu"] = int(mtu_m.group(1))
            continue

        if current is None:
            continue

        line = line.strip()

        # RX line: "    RX: bytes  packets errors dropped missed  mcast"
        if line.startswith("RX:"):
            parts = line.split()
            if len(parts) >= 5:
                current["rx_bytes"] = int(parts[1])
                current["rx_packets"] = int(parts[2])
                current["rx_errors"] = int(parts[3])
                current["rx_dropped"] = int(parts[4])

        # TX line: "    TX: bytes  packets errors dropped carrier collsns"
        elif line.startswith("TX:"):
            parts = line.split()
            if len(parts) >= 5:
                current["tx_bytes"] = int(parts[1])
                current["tx_packets"] = int(parts[2])
                current["tx_errors"] = int(parts[3])
                current["tx_dropped"] = int(parts[4])

    if current:
        interfaces.append(current)

    return interfaces


# ---------------------------------------------------------------------------
# Routing table metrics
# ---------------------------------------------------------------------------

def collect_routing_table(container_name: str) -> dict[str, Any]:
    """
    Collect routing table entries from a container via vtysh.

    Returns a dict with:
        - entries: list of {destination, prefix_len, protocol, next_hop, interface, metric, distance}
        - raw_output: str
    """
    logger.info("Collecting routing table from container '%s'", container_name)
    container = _get_container(container_name)

    metrics: dict[str, Any] = {
        "container": container_name,
        "timestamp": datetime.now().isoformat(),
        "entries": [],
        "raw_output": "",
    }

    exit_code, output = _exec(container, "vtysh -c 'show ip route'")
    metrics["raw_output"] = output

    if exit_code != 0:
        logger.warning("vtysh route query failed on '%s' (exit %d)", container_name, exit_code)
        return metrics

    entries = _parse_routing_table(output)
    metrics["entries"] = entries

    logger.info("Routing table for '%s': %d entries", container_name, len(entries))
    return metrics


def _parse_routing_table(output: str) -> list[dict[str, Any]]:
    """Parse 'show ip route' output into structured entries."""
    entries = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("Codes:") or line.startswith("Kernels:"):
            continue

        # Typical format:
        # O   10.0.0.0/24 [110/10] via 10.0.1.2, eth1, 00:00:15
        # C   10.0.1.0/24 is directly connected, eth1
        # S   0.0.0.0/0 [1/0] via 10.0.1.1, eth1
        m = re.match(r"^([A-Z]\*?)\s+(\S+)\s+(.*)", line)
        if not m:
            continue

        protocol_code = m.group(1).rstrip("*")
        destination = m.group(2)
        rest = m.group(3)

        entry: dict[str, Any] = {
            "protocol": protocol_code,
            "destination": destination,
        }

        # Extract metric [110/10]
        metric_m = re.search(r"\[(\d+)/(\d+)\]", rest)
        if metric_m:
            entry["distance"] = int(metric_m.group(1))
            entry["metric"] = int(metric_m.group(2))

        # Extract next-hop and interface
        via_m = re.search(r"via\s+(\S+),\s*(\S+)", rest)
        if via_m:
            entry["next_hop"] = via_m.group(1)
            entry["interface"] = via_m.group(2).rstrip(",")

        # Directly connected
        if "directly connected" in rest:
            entry["next_hop"] = "direct"
            iface_m = re.search(r"directly connected,\s*(\S+)", rest)
            if iface_m:
                entry["interface"] = iface_m.group(1).rstrip(",")

        entries.append(entry)

    return entries


# ---------------------------------------------------------------------------
# Link State Database
# ---------------------------------------------------------------------------

def collect_lsdb(container_name: str) -> dict[str, Any]:
    """
    Collect OSPF Link State Database from a container via vtysh.

    Returns a dict with:
        - lsas: list of {type, link_state_id, advertising_router, age, sequence, checksum, length}
        - raw_output: str
    """
    logger.info("Collecting LSDB from container '%s'", container_name)
    container = _get_container(container_name)

    metrics: dict[str, Any] = {
        "container": container_name,
        "timestamp": datetime.now().isoformat(),
        "lsas": [],
        "raw_output": "",
    }

    exit_code, output = _exec(container, "vtysh -c 'show ip ospf database'")
    metrics["raw_output"] = output

    if exit_code != 0:
        logger.warning("vtysh LSDB query failed on '%s' (exit %d)", container_name, exit_code)
        return metrics

    lsas = _parse_lsdb(output)
    metrics["lsas"] = lsas

    logger.info("LSDB for '%s': %d LSAs", container_name, len(lsas))
    return metrics


def _parse_lsdb(output: str) -> list[dict[str, Any]]:
    """Parse 'show ip ospf database' output into structured LSA entries."""
    lsas = []
    current: Optional[dict[str, Any]] = None

    for line in output.splitlines():
        line = line.strip()

        # LSA header: "  Router Link States (Area 0.0.0.0)"
        if line.startswith("  ") and "(Area" in line:
            continue

        # LSA entry line:
        #  Link ID         ADV Router      Age  Seq#       Checksum  Link count
        #  10.0.0.1        10.0.0.1        123  80000001   0x1234      2
        m = re.match(
            r"^(\S+)\s+(\S+)\s+(\d+)\s+(8x[0-9a-fA-F]+|\d+)\s+(0x[0-9a-fA-F]+)\s+(\d+)",
            line,
        )
        if m:
            if current:
                lsas.append(current)
            current = {
                "link_state_id": m.group(1),
                "advertising_router": m.group(2),
                "age": int(m.group(3)),
                "sequence": m.group(4),
                "checksum": m.group(5),
                "link_count": int(m.group(6)),
            }
            continue

        # Type line: "  Net Link States (Area 0.0.0.0)" or similar
        type_m = re.match(r"^\s+(\S+)\s+Link States", line)
        if type_m and current is None:
            # This is a section header; we'll use it for the next LSA
            pass

    if current:
        lsas.append(current)

    return lsas


# ---------------------------------------------------------------------------
# Ping metrics
# ---------------------------------------------------------------------------

def collect_ping_metrics(
    source: str,
    target: str,
    count: int = 10,
    timeout: int = 5,
) -> dict[str, Any]:
    """
    Run ping from source container to target IP/hostname and parse results.

    Returns a dict with:
        - packets_transmitted, packets_received
        - packet_loss_percent
        - rtt_min_ms, rtt_avg_ms, rtt_max_ms, rtt_mdev_ms (jitter)
        - reachable: bool
        - raw_output: str
    """
    logger.info("Collecting ping metrics: %s -> %s (%d packets)", source, target, count)
    container = _get_container(source)

    metrics: dict[str, Any] = {
        "source": source,
        "target": target,
        "timestamp": datetime.now().isoformat(),
        "packets_transmitted": count,
        "packets_received": 0,
        "packet_loss_percent": 100.0,
        "rtt_min_ms": None,
        "rtt_avg_ms": None,
        "rtt_max_ms": None,
        "rtt_mdev_ms": None,
        "reachable": False,
        "raw_output": "",
    }

    # Resolve target to IP if it's a container name
    target_ip = _resolve_target_ip(target)
    if target_ip is None:
        logger.warning("Could not resolve target '%s' to an IP address", target)
        return metrics

    cmd = f"ping -c {count} -W {timeout} {target_ip}"
    exit_code, output = _exec(container, cmd, timeout=count * timeout + 10)
    metrics["raw_output"] = output

    if exit_code != 0:
        logger.warning("Ping from '%s' to '%s' failed (exit %d)", source, target_ip, exit_code)
        return metrics

    parsed = _parse_ping_output(output)
    metrics.update(parsed)
    metrics["reachable"] = parsed["packets_received"] > 0

    logger.info(
        "Ping %s -> %s: loss=%.1f%%, avg_rtt=%.2fms",
        source, target_ip, metrics["packet_loss_percent"], metrics["rtt_avg_ms"] or -1,
    )
    return metrics


def _resolve_target_ip(target: str) -> Optional[str]:
    """Resolve a target (container name or IP) to an IP address."""
    # If it's already an IP, return as-is
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", target):
        return target

    # Try to resolve via Docker network
    try:
        client = get_docker_client()
        container = client.containers.get(target)
        networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
        for net_cfg in networks.values():
            ip = net_cfg.get("IPAddress")
            if ip:
                return ip
    except Exception:
        pass

    return None


def _parse_ping_output(output: str) -> dict[str, Any]:
    """Parse ping output to extract packet loss and RTT statistics."""
    result: dict[str, Any] = {
        "packets_transmitted": 0,
        "packets_received": 0,
        "packet_loss_percent": 100.0,
        "rtt_min_ms": None,
        "rtt_avg_ms": None,
        "rtt_max_ms": None,
        "rtt_mdev_ms": None,
    }

    # Packet loss line:
    # 10 packets transmitted, 8 received, 20% packet loss, time 9012ms
    loss_m = re.search(
        r"(\d+) packets transmitted,\s+(\d+) received,\s+([\d.]+)% packet loss",
        output,
    )
    if loss_m:
        result["packets_transmitted"] = int(loss_m.group(1))
        result["packets_received"] = int(loss_m.group(2))
        result["packet_loss_percent"] = float(loss_m.group(3))

    # RTT line:
    # rtt min/avg/max/mdev = 0.123/0.456/0.789/0.123 ms
    rtt_m = re.search(
        r"rtt\s+min/avg/max/mdev\s*=\s*([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)\s*ms",
        output,
    )
    if rtt_m:
        result["rtt_min_ms"] = float(rtt_m.group(1))
        result["rtt_avg_ms"] = float(rtt_m.group(2))
        result["rtt_max_ms"] = float(rtt_m.group(3))
        result["rtt_mdev_ms"] = float(rtt_m.group(4))

    return result


# ---------------------------------------------------------------------------
# Container resource metrics
# ---------------------------------------------------------------------------

def collect_container_resources(container_name: str) -> dict[str, Any]:
    """
    Collect CPU and memory usage from a Docker container.

    Returns a dict with:
        - cpu_percent, memory_usage_bytes, memory_limit_bytes, memory_percent
        - raw_stats: dict
    """
    logger.info("Collecting resource metrics for container '%s'", container_name)
    container = _get_container(container_name)

    metrics: dict[str, Any] = {
        "container": container_name,
        "timestamp": datetime.now().isoformat(),
        "cpu_percent": 0.0,
        "memory_usage_bytes": 0,
        "memory_limit_bytes": 0,
        "memory_percent": 0.0,
        "raw_stats": {},
    }

    try:
        stats = container.stats(stream=False)
        metrics["raw_stats"] = stats

        # CPU calculation
        cpu_stats = stats.get("cpu_stats", {})
        precpu_stats = stats.get("precpu_stats", {})

        cpu_delta = (
            cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
            - precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        )
        system_delta = (
            cpu_stats.get("system_cpu_usage", 0)
            - precpu_stats.get("system_cpu_usage", 0)
        )

        if system_delta > 0 and cpu_delta > 0:
            cpu_count = cpu_stats.get("online_cpus", 1)
            metrics["cpu_percent"] = (cpu_delta / system_delta) * cpu_count * 100.0

        # Memory
        mem_stats = stats.get("memory_stats", {})
        metrics["memory_usage_bytes"] = mem_stats.get("usage", 0)
        metrics["memory_limit_bytes"] = mem_stats.get("limit", 0)

        if metrics["memory_limit_bytes"] > 0:
            metrics["memory_percent"] = (
                metrics["memory_usage_bytes"] / metrics["memory_limit_bytes"]
            ) * 100.0

    except Exception as e:
        logger.error("Failed to collect resource stats for '%s': %s", container_name, e)

    logger.info(
        "Resources for '%s': CPU=%.1f%%, Memory=%.1f%%",
        container_name, metrics["cpu_percent"], metrics["memory_percent"],
    )
    return metrics


# ---------------------------------------------------------------------------
# Derived metrics
# ---------------------------------------------------------------------------

def calculate_derived_metrics(
    ping_metrics: dict[str, Any],
    ospf_metrics: dict[str, Any],
    interface_metrics: dict[str, Any],
) -> dict[str, Any]:
    """
    Calculate end-to-end derived metrics from raw collected data.

    Returns a dict with:
        - latency_ms, packet_loss_percent, bandwidth_mbps, hop_count,
          link_cost, congestion_level, path_quality_score, label
    """
    # Latency from ping
    latency_ms = ping_metrics.get("rtt_avg_ms") or 0.0

    # Packet loss from ping
    packet_loss_percent = ping_metrics.get("packet_loss_percent", 100.0)

    # Bandwidth from OSPF interface or default
    bandwidth_mbps = ospf_metrics.get("interface", {}).get("bandwidth_mbps", 100.0)

    # Link cost from OSPF
    link_cost = ospf_metrics.get("interface", {}).get("cost", 10)

    # Hop count: number of OSPF neighbors in Full state as a proxy
    neighbors = ospf_metrics.get("neighbors", [])
    hop_count = len([n for n in neighbors if n.get("state") == "Full"])

    # Congestion level: derived from packet loss and interface errors
    interfaces = interface_metrics.get("interfaces", [])
    total_errors = sum(
        iface.get("rx_errors", 0) + iface.get("tx_errors", 0) for iface in interfaces
    )
    total_dropped = sum(
        iface.get("rx_dropped", 0) + iface.get("tx_dropped", 0) for iface in interfaces
    )

    # Congestion heuristic: weighted combination of loss and errors
    loss_factor = min(packet_loss_percent / 10.0, 1.0)  # 10% loss = max
    error_factor = min((total_errors + total_dropped) / 1000.0, 1.0)
    congestion_level = round(0.6 * loss_factor + 0.4 * error_factor, 4)

    # Path quality score: 0-100, higher is better
    # Penalize high latency, high loss, high congestion
    latency_score = max(0, 100 - latency_ms)  # 0ms = 100, 100ms+ = 0
    loss_score = max(0, 100 - packet_loss_percent * 10)  # 0% = 100, 10%+ = 0
    congestion_score = max(0, 100 - congestion_level * 100)

    path_quality_score = round(
        0.4 * latency_score + 0.4 * loss_score + 0.2 * congestion_score, 2
    )

    # Label
    if packet_loss_percent > 5 or latency_ms > 100:
        label = "High"
    elif packet_loss_percent > 2 or latency_ms > 50 or congestion_level > 0.7:
        label = "Medium"
    else:
        label = "Low"

    return {
        "latency_ms": round(latency_ms, 2),
        "packet_loss_percent": round(packet_loss_percent, 2),
        "bandwidth_mbps": round(bandwidth_mbps, 2),
        "hop_count": hop_count,
        "link_cost": link_cost,
        "congestion_level": round(congestion_level, 4),
        "path_quality_score": path_quality_score,
        "label": label,
    }


# ---------------------------------------------------------------------------
# Collect all metrics for a topology
# ---------------------------------------------------------------------------

def collect_all_metrics(topology_id: str) -> dict[str, Any]:
    """
    Collect all metrics for a given topology.

    Discovers containers associated with the topology, collects OSPF, interface,
    routing, LSDB, ping, and resource metrics, then computes derived metrics.

    Returns a structured dict ready for saving.
    """
    logger.info("=" * 60)
    logger.info("Starting full metrics collection for topology '%s'", topology_id)
    logger.info("=" * 60)

    timestamp = datetime.now().isoformat()

    # Discover containers for this topology
    container_names = _discover_topology_containers(topology_id)
    if not container_names:
        logger.warning("No containers found for topology '%s'", topology_id)
        return {
            "topology_id": topology_id,
            "timestamp": timestamp,
            "metrics": {},
            "error": "No containers found for topology",
        }

    logger.info("Discovered %d containers: %s", len(container_names), container_names)

    all_ospf = []
    all_interfaces = []
    all_routes = []
    all_lsdb = []
    all_resources = []
    all_pings = []

    for name in container_names:
        # OSPF
        try:
            ospf = collect_ospf_metrics(name)
            all_ospf.append(ospf)
        except ContainerNotFound as e:
            logger.warning("Skipping OSPF for '%s': %s", name, e)

        # Interfaces
        try:
            iface = collect_interface_metrics(name)
            all_interfaces.append(iface)
        except ContainerNotFound as e:
            logger.warning("Skipping interfaces for '%s': %s", name, e)

        # Routing table
        try:
            routes = collect_routing_table(name)
            all_routes.append(routes)
        except ContainerNotFound as e:
            logger.warning("Skipping routing table for '%s': %s", name, e)

        # LSDB
        try:
            lsdb = collect_lsdb(name)
            all_lsdb.append(lsdb)
        except ContainerNotFound as e:
            logger.warning("Skipping LSDB for '%s': %s", name, e)

        # Resources
        try:
            resources = collect_container_resources(name)
            all_resources.append(resources)
        except ContainerNotFound as e:
            logger.warning("Skipping resources for '%s': %s", name, e)

    # Ping between all pairs of containers
    for i, src in enumerate(container_names):
        for dst in container_names[i + 1:]:
            try:
                ping = collect_ping_metrics(src, dst, count=5)
                all_pings.append(ping)
            except ContainerNotFound as e:
                logger.warning("Skipping ping %s -> %s: %s", src, dst, e)

    # Aggregate derived metrics
    # Use the first container's OSPF/interface data as representative
    representative_ospf = all_ospf[0] if all_ospf else {"neighbors": [], "interface": {}}
    representative_iface = all_interfaces[0] if all_interfaces else {"interfaces": []}

    # Average ping metrics across all pairs
    if all_pings:
        avg_ping = {
            "rtt_avg_ms": sum(p.get("rtt_avg_ms") or 0 for p in all_pings) / len(all_pings),
            "packet_loss_percent": sum(p.get("packet_loss_percent", 100) for p in all_pings) / len(all_pings),
        }
    else:
        avg_ping = {"rtt_avg_ms": 0.0, "packet_loss_percent": 100.0}

    derived = calculate_derived_metrics(avg_ping, representative_ospf, representative_iface)

    result = {
        "topology_id": topology_id,
        "timestamp": timestamp,
        "metrics": derived,
        "details": {
            "ospf": all_ospf,
            "interfaces": all_interfaces,
            "routing_tables": all_routes,
            "lsdb": all_lsdb,
            "resources": all_resources,
            "pings": all_pings,
        },
    }

    logger.info("Metrics collection complete for topology '%s'", topology_id)
    logger.info("Derived metrics: %s", derived)
    return result


def _discover_topology_containers(topology_id: str) -> list[str]:
    """
    Discover container names associated with a topology.

    Looks for containers whose names contain the topology_id or match
    common naming patterns (e.g., 'r1', 'r2', 'router1', etc.).
    """
    client = get_docker_client()
    containers = client.containers.list()

    # Strategy 1: containers with topology_id in the name
    matching = [c.name for c in containers if topology_id in c.name]
    if matching:
        return matching

    # Strategy 2: all running containers (fallback for single-topology setups)
    running = [c.name for c in containers if c.status == "running"]
    if running:
        logger.debug("Using all running containers for topology '%s'", topology_id)
        return running

    return []


# ---------------------------------------------------------------------------
# Save / Load
# ---------------------------------------------------------------------------

def save_metrics(metrics: dict[str, Any], output_file: str) -> None:
    """
    Save collected metrics to a JSON file.

    Args:
        metrics: The metrics dict returned by collect_all_metrics()
        output_file: Path to the output JSON file
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)

    with open(output_file, "w") as f:
        json.dump(metrics, f, indent=2, default=str)

    logger.info("Metrics saved to '%s'", output_file)


def load_metrics(input_file: str) -> dict[str, Any]:
    """
    Load metrics from a JSON file.

    Args:
        input_file: Path to the JSON file

    Returns:
        The loaded metrics dict
    """
    with open(input_file, "r") as f:
        metrics = json.load(f)

    logger.info("Metrics loaded from '%s'", input_file)
    return metrics


# ---------------------------------------------------------------------------
# Train on real data
# ---------------------------------------------------------------------------

def train_on_real_data(topologies_dir: str, output_db: str) -> int:
    """
    Iterate over all topologies in a directory, start each in Docker,
    collect metrics, stop the topology, and save metrics to a database.

    Args:
        topologies_dir: Directory containing topology JSON files
        output_db: Path to the output SQLite database (or JSON file)

    Returns:
        Number of samples collected
    """
    logger.info("=" * 60)
    logger.info("Starting training data collection")
    logger.info("Topologies dir: %s", topologies_dir)
    logger.info("Output DB: %s", output_db)
    logger.info("=" * 60)

    if not os.path.isdir(topologies_dir):
        logger.error("Topologies directory '%s' does not exist", topologies_dir)
        return 0

    # Find all topology files
    topology_files = [
        f for f in os.listdir(topologies_dir)
        if f.endswith(".json") and not f.startswith(".")
    ]

    if not topology_files:
        logger.warning("No topology files found in '%s'", topologies_dir)
        return 0

    logger.info("Found %d topology files", len(topology_files))

    samples_collected = 0
    all_metrics = []

    for i, filename in enumerate(topology_files, 1):
        filepath = os.path.join(topologies_dir, filename)
        logger.info("-" * 40)
        logger.info("Processing topology %d/%d: %s", i, len(topology_files), filename)

        # Load topology definition
        try:
            with open(filepath, "r") as f:
                topology = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.error("Failed to load topology file '%s': %s", filename, e)
            continue

        topology_id = topology.get("id", filename.replace(".json", ""))

        # Start topology in Docker
        logger.info("Starting topology '%s' in Docker...", topology_id)
        started = _start_topology(topology)
        if not started:
            logger.error("Failed to start topology '%s', skipping", topology_id)
            continue

        # Wait for OSPF convergence
        logger.info("Waiting for OSPF convergence (max 60s)...")
        converged = _wait_for_convergence(topology_id, timeout=60)
        if not converged:
            logger.warning("OSPF did not converge for topology '%s', collecting anyway", topology_id)

        # Collect metrics
        try:
            metrics = collect_all_metrics(topology_id)
            all_metrics.append(metrics)
            samples_collected += 1
            logger.info("Collected metrics for topology '%s'", topology_id)
        except Exception as e:
            logger.error("Failed to collect metrics for '%s': %s", topology_id, e)

        # Stop topology
        logger.info("Stopping topology '%s'...", topology_id)
        _stop_topology(topology_id)

    # Save all metrics
    if all_metrics:
        if output_db.endswith(".db"):
            _save_to_sqlite(all_metrics, output_db)
        else:
            save_metrics({"samples": all_metrics, "count": len(all_metrics)}, output_db)

    logger.info("=" * 60)
    logger.info("Training data collection complete: %d samples", samples_collected)
    logger.info("=" * 60)

    return samples_collected


def _start_topology(topology: dict[str, Any]) -> bool:
    """Start a topology in Docker using docker compose."""
    import subprocess
    import tempfile

    try:
        # Generate compose file in a temp directory
        with tempfile.TemporaryDirectory() as tmpdir:
            # Write topology file
            topo_file = os.path.join(tmpdir, "topology.json")
            with open(topo_file, "w") as f:
                json.dump(topology, f)

            # Generate compose file
            from generator import generate_docker_compose
            from ip_generator import generate_ip_addresses
            from frr_generator import generate_frr_configs

            ip_map = generate_ip_addresses(topology)
            generate_frr_configs(topology, ip_map)
            generate_docker_compose(topology, ip_map)

            # Copy generated files to tmpdir and run docker compose
            import shutil
            generated_dir = os.path.join(os.getcwd(), "generated")
            if os.path.isdir(generated_dir):
                for item in os.listdir(generated_dir):
                    src = os.path.join(generated_dir, item)
                    dst = os.path.join(tmpdir, item)
                    if os.path.isfile(src):
                        shutil.copy2(src, dst)

            result = subprocess.run(
                ["docker", "compose", "-f", os.path.join(tmpdir, "docker-compose.yml"), "up", "-d"],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                logger.error("docker compose up failed: %s", result.stderr)
                return False
            return True

    except Exception as e:
        logger.error("Failed to start topology: %s", e)
        return False


def _stop_topology(topology_id: str) -> bool:
    """Stop a topology in Docker."""
    import subprocess

    try:
        # Find and stop containers matching this topology
        client = get_docker_client()
        containers = client.containers.list(all=True)

        for container in containers:
            if topology_id in container.name:
                logger.info("Stopping container '%s'", container.name)
                container.stop(timeout=10)
                container.remove(force=True)

        return True

    except Exception as e:
        logger.error("Failed to stop topology '%s': %s", topology_id, e)
        return False


def _wait_for_convergence(topology_id: str, timeout: int = 60) -> bool:
    """Wait for OSPF to converge by checking neighbor states."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            container_names = _discover_topology_containers(topology_id)
            if not container_names:
                time.sleep(2)
                continue

            # Check first container for Full neighbors
            container = _get_container(container_names[0])
            exit_code, output = _exec(container, "vtysh -c 'show ip ospf neighbor'")
            if exit_code == 0 and "Full" in output:
                logger.info("OSPF converged for topology '%s'", topology_id)
                return True

        except Exception:
            pass

        time.sleep(2)

    return False


def _save_to_sqlite(metrics_list: list[dict[str, Any]], db_path: str) -> None:
    """Save collected metrics to a SQLite database."""
    import sqlite3

    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS real_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topology_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            latency_ms REAL,
            packet_loss_percent REAL,
            bandwidth_mbps REAL,
            hop_count INTEGER,
            link_cost INTEGER,
            congestion_level REAL,
            path_quality_score REAL,
            label TEXT
        )
    """)

    for metrics in metrics_list:
        m = metrics.get("metrics", {})
        cursor.execute("""
            INSERT INTO real_metrics
            (topology_id, timestamp, latency_ms, packet_loss_percent, bandwidth_mbps,
             hop_count, link_cost, congestion_level, path_quality_score, label)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            metrics.get("topology_id", "unknown"),
            metrics.get("timestamp", datetime.now().isoformat()),
            m.get("latency_ms"),
            m.get("packet_loss_percent"),
            m.get("bandwidth_mbps"),
            m.get("hop_count"),
            m.get("link_cost"),
            m.get("congestion_level"),
            m.get("path_quality_score"),
            m.get("label"),
        ))

    conn.commit()
    conn.close()
    logger.info("Saved %d samples to SQLite database '%s'", len(metrics_list), db_path)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="NetRouteAI Real Metrics Collector")
    subparsers = parser.add_subparsers(dest="command")

    # Collect command
    collect_parser = subparsers.add_parser("collect", help="Collect metrics for a topology")
    collect_parser.add_argument("topology_id", help="Topology ID")
    collect_parser.add_argument("-o", "--output", default="metrics_output.json", help="Output file")

    # Train command
    train_parser = subparsers.add_parser("train", help="Collect training data from all topologies")
    train_parser.add_argument("topologies_dir", help="Directory containing topology JSON files")
    train_parser.add_argument("-o", "--output", default="real_training_data.db", help="Output database")

    args = parser.parse_args()

    if args.command == "collect":
        metrics = collect_all_metrics(args.topology_id)
        save_metrics(metrics, args.output)
        print(json.dumps(metrics, indent=2, default=str))

    elif args.command == "train":
        count = train_on_real_data(args.topologies_dir, args.output)
        print(f"Collected {count} training samples")

    else:
        parser.print_help()
