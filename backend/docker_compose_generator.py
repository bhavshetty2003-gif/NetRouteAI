"""
Docker Compose Generator for FRR Routing Topologies

This module generates Docker Compose files, FRR (Free Range Routing)
configurations, and metrics collection scripts for running OSPF routing
daemons in containers.

Generated files are saved to backend/docker_topologies/<topology_id>/
"""

import json
import logging
import re
import shutil
import subprocess
import time
import uuid
from ipaddress import IPv4Network
from pathlib import Path
from typing import Any, Optional

import yaml

from models import Topology

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_DIR = BASE_DIR / "docker_topologies"

FRR_IMAGE = "frrouting/frr:latest"
FRR_CONFIG_DIR = "/etc/frr"
FRR_START_COMMAND = "/usr/lib/frr/docker-start"

OSPF_AREA = "0"
OSPF_ROUTER_ID_BASE = "1.1.1"

CONVERGENCE_TIMEOUT = 120
CONVERGENCE_POLL_INTERVAL = 3

PING_COUNT = 5
PING_TIMEOUT = 10

DOCKER_COMPOSE_TIMEOUT = 120
DOCKER_EXEC_TIMEOUT = 30

# Topology registry: topology_id -> {topology, output_dir, ip_map}
_topology_registry: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def _validate_topology(topology: dict) -> None:
    """Validate topology structure."""
    if not isinstance(topology, dict):
        raise ValueError("Topology must be a dictionary")

    devices = topology.get("devices")
    links = topology.get("links")

    if not devices:
        raise ValueError("Topology must contain at least one device")
    if not links:
        raise ValueError("Topology must contain at least one link")

    device_ids = {d["id"] for d in devices}
    for link in links:
        if link["source"] not in device_ids:
            raise ValueError(f"Link source '{link['source']}' not in devices")
        if link["target"] not in device_ids:
            raise ValueError(f"Link target '{link['target']}' not in devices")


# ---------------------------------------------------------------------------
# IP Assignment
# ---------------------------------------------------------------------------
def _assign_ips(topology: dict) -> dict[str, dict[str, str]]:
    """
    Assign IP addresses to all device interfaces.

    Uses /29 subnets (10.0.x.0/29) with the following layout:
        - 10.0.x.1: Docker gateway (reserved)
        - 10.0.x.2: Source device
        - 10.0.x.3: Target device

    Returns:
        {
            "router1": {"net1": "10.0.1.2/29"},
            "router2": {"net1": "10.0.1.3/29", "net2": "10.0.2.2/29"},
        }
    """
    ip_map: dict[str, dict[str, str]] = {}
    for device in topology["devices"]:
        ip_map[device["id"]] = {}

    for idx, link in enumerate(topology["links"], start=1):
        network_name = f"net{idx}"
        subnet = IPv4Network(f"10.0.{idx}.0/29")
        hosts = list(subnet.hosts())

        ip_map[link["source"]][network_name] = f"{hosts[1]}/29"
        ip_map[link["target"]][network_name] = f"{hosts[2]}/29"

    return ip_map


def _ensure_output_dir(output_dir: Path) -> Path:
    """Ensure output directory exists."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _get_router_id(router: str, topology: dict) -> str:
    """Generate a unique OSPF router ID for a router."""
    routers = [d["id"] for d in topology["devices"] if d.get("type") == "router"]
    try:
        idx = routers.index(router) + 1
    except ValueError:
        idx = 1
    return f"{OSPF_ROUTER_ID_BASE}.{idx}"


# ---------------------------------------------------------------------------
# Compose File Generation
# ---------------------------------------------------------------------------
def generate_compose_file(topology: dict, output_dir: Path) -> Path:
    """
    Generate docker-compose.yml for the topology.

    Creates a Docker network per link, runs FRR in each router container,
    and connects all devices to their respective networks.

    Args:
        topology: Topology dictionary with 'devices' and 'links'.
        output_dir: Directory where the compose file will be saved.

    Returns:
        Path to the generated docker-compose.yml file.
    """
    _validate_topology(topology)
    output_dir = _ensure_output_dir(output_dir)
    ip_map = _assign_ips(topology)

    compose: dict[str, Any] = {
        "version": "3",
        "services": {},
        "networks": {},
    }

    # Create services for each device
    for device in topology["devices"]:
        device_id = device["id"]
        device_type = device.get("type", "router")

        if device_type == "router":
            compose["services"][device_id] = {
                "image": FRR_IMAGE,
                "container_name": device_id,
                "command": FRR_START_COMMAND,
                "volumes": [f"./{device_id}:{FRR_CONFIG_DIR}"],
                "networks": {},
                "cap_add": ["NET_ADMIN", "SYS_ADMIN"],
                "restart": "unless-stopped",
            }
        else:
            # Switches and other devices run as Alpine containers
            compose["services"][device_id] = {
                "image": "alpine:latest",
                "container_name": device_id,
                "command": "sleep infinity",
                "networks": {},
                "restart": "unless-stopped",
            }

    # Create networks and connect devices
    for idx, link in enumerate(topology["links"], start=1):
        network_name = f"net{idx}"
        source_ip = ip_map[link["source"]][network_name]
        target_ip = ip_map[link["target"]][network_name]

        subnet = str(IPv4Network(source_ip, strict=False))

        compose["networks"][network_name] = {
            "driver": "bridge",
            "ipam": {"config": [{"subnet": subnet}]},
        }

        compose["services"][link["source"]]["networks"][network_name] = {
            "ipv4_address": source_ip.split("/")[0],
        }
        compose["services"][link["target"]]["networks"][network_name] = {
            "ipv4_address": target_ip.split("/")[0],
        }

    # Write compose file
    compose_path = output_dir / "docker-compose.yml"
    with open(compose_path, "w") as f:
        yaml.dump(compose, f, sort_keys=False, default_flow_style=False)

    logger.info(f"Generated docker-compose.yml at {compose_path}")
    return compose_path


# ---------------------------------------------------------------------------
# FRR Configuration Generation
# ---------------------------------------------------------------------------
def generate_frr_config(router: str, topology: dict, output_dir: Path) -> Path:
    """
    Generate FRR configuration files for a router.

    Creates frr.conf (OSPF), daemons (enable zebra + ospfd), and vtysh.conf.

    Args:
        router: Router device ID.
        topology: Topology dictionary.
        output_dir: Base output directory (router subdirectory is created).

    Returns:
        Path to the router's configuration directory.
    """
    _validate_topology(topology)
    output_dir = _ensure_output_dir(output_dir)
    ip_map = _assign_ips(topology)

    if router not in ip_map:
        raise ValueError(f"Router '{router}' not found in topology")

    router_dir = output_dir / router
    router_dir.mkdir(parents=True, exist_ok=True)

    # Generate frr.conf
    frr_conf = _generate_frr_conf(router, topology, ip_map)
    (router_dir / "frr.conf").write_text(frr_conf)

    # Generate daemons file
    daemons = _generate_daemons()
    (router_dir / "daemons").write_text(daemons)

    # Generate vtysh.conf
    vtysh_conf = _generate_vtysh_conf()
    (router_dir / "vtysh.conf").write_text(vtysh_conf)

    logger.info(f"Generated FRR config for {router} at {router_dir}")
    return router_dir


def _generate_frr_conf(router: str, topology: dict, ip_map: dict) -> str:
    """Generate frr.conf content for a router."""
    lines = [
        "frr version 8.4",
        "frr defaults traditional",
        f"hostname {router}",
        "service integrated-vtysh-config",
        "!",
    ]

    # Interface configurations
    interfaces = ip_map.get(router, {})
    for iface_idx, (network, ip) in enumerate(interfaces.items()):
        lines.extend([
            f"interface eth{iface_idx}",
            f" ip address {ip}",
            f" ip ospf area {OSPF_AREA}",
            " ip ospf network point-to-point",
            "!",
        ])

    # OSPF configuration
    router_id = _get_router_id(router, topology)
    lines.extend([
        "router ospf",
        f" ospf router-id {router_id}",
    ])

    for ip in interfaces.values():
        lines.append(f" network {ip.split('/')[0]}/32 area {OSPF_AREA}")

    lines.extend([
        "!",
        "line vty",
        "!",
    ])

    return "\n".join(lines) + "\n"


def _generate_daemons() -> str:
    """Generate daemons file content."""
    return """\
zebra=yes
bgpd=no
ospfd=yes
ospf6d=no
ripd=no
ripngd=no
isisd=no
pimd=no
ldpd=no
nhrpd=no
eigrpd=no
babeld=no
sharpd=no
staticd=yes
pbrd=no
bfdd=no
fabricd=no
vrrpd=no
pathd=no
"""


def _generate_vtysh_conf() -> str:
    """Generate vtysh.conf content."""
    return "service integrated-vtysh-config\n"


# ---------------------------------------------------------------------------
# Metrics Script Generation
# ---------------------------------------------------------------------------
def generate_metrics_script(topology: dict, output_dir: Path) -> Path:
    """
    Generate a shell script for metrics collection.

    The script starts containers, waits for OSPF convergence, runs ping
    tests between all router pairs, collects latency and packet loss
    metrics, saves results to JSON, and stops containers.

    Args:
        topology: Topology dictionary.
        output_dir: Directory where the script will be saved.

    Returns:
        Path to the generated metrics.sh script.
    """
    _validate_topology(topology)
    output_dir = _ensure_output_dir(output_dir)
    ip_map = _assign_ips(topology)

    routers = [d["id"] for d in topology["devices"] if d.get("type") == "router"]

    script_lines = [
        "#!/bin/bash",
        "# Auto-generated metrics collection script",
        "# Generated by docker_compose_generator.py",
        "",
        "set -euo pipefail",
        "",
        'OUTPUT_DIR="$(cd "$(dirname "$0")" && pwd)"',
        'METRICS_FILE="${OUTPUT_DIR}/metrics.json"',
        f"CONVERGENCE_TIMEOUT={CONVERGENCE_TIMEOUT}",
        f"PING_COUNT={PING_COUNT}",
        "",
        "echo '=== NetRouteAI Metrics Collection ==='",
        'echo "Started at: $(date -Iseconds)"',
        "",
        "# Start containers",
        "echo 'Starting containers...'",
        "docker compose -f ${OUTPUT_DIR}/docker-compose.yml up -d",
        "",
        "# Wait for OSPF convergence",
        "echo 'Waiting for OSPF convergence...'",
        "elapsed=0",
        "while [ $elapsed -lt $CONVERGENCE_TIMEOUT ]; do",
        "    all_converged=true",
    ]

    for router in routers:
        script_lines.append(
            f'    neighbors=$(docker exec {router} vtysh -c "show ip ospf neighbor" 2>/dev/null | grep -c "Full" || true)'
        )
        script_lines.append(
            f'    if [ "${{neighbors:-0}}" -lt 1 ]; then all_converged=false; fi'
        )

    script_lines.extend([
        '    if [ "$all_converged" = true ]; then',
        '        echo "OSPF converged after ${elapsed}s"',
        "        break",
        "    fi",
        "    sleep 2",
        "    elapsed=$((elapsed + 2))",
        "done",
        "",
        'if [ "$all_converged" != true ]; then',
        '    echo "WARNING: OSPF did not fully converge within timeout"',
        "fi",
        "",
        "# Collect metrics",
        "echo 'Collecting metrics...'",
        'echo "{" > "$METRICS_FILE"',
        'echo "  \\"timestamp\\": \\"$(date -Iseconds)\\\"," >> "$METRICS_FILE"',
        'echo "  \\"topology_id\\": \\"$(basename $OUTPUT_DIR)\\\"," >> "$METRICS_FILE"',
        "echo \"  \\\"routers\\\": [\" >> \"$METRICS_FILE\"",
    ])

    # Add router metrics
    for i, router in enumerate(routers):
        comma = "," if i < len(routers) - 1 else ""
        script_lines.append(
            f'    echo "    {{\\"router\\": \\"{router}\\", \\"ospf_neighbors\\": $(docker exec {router} vtysh -c "show ip ospf neighbor" 2>/dev/null | grep -c "Full" || echo 0), \\"ospf_routes\\": $(docker exec {router} vtysh -c "show ip route" 2>/dev/null | grep -c "^O" || echo 0)}}{comma}" >> "$METRICS_FILE"',
        )

    script_lines.extend([
        'echo "  ]," >> "$METRICS_FILE"',
        "echo \"  \\\"ping_tests\\\": [\" >> \"$METRICS_FILE\"",
    ])

    # Add ping tests between all router pairs
    ping_pairs = []
    for i, src in enumerate(routers):
        for dst in routers[i + 1:]:
            ping_pairs.append((src, dst))

    for i, (src, dst) in enumerate(ping_pairs):
        comma = "," if i < len(ping_pairs) - 1 else ""
        script_lines.extend([
            f"    # Ping from {src} to {dst}",
            f"    ping_output=$(docker exec {src} ping -c $PING_COUNT -W {PING_TIMEOUT} $(docker exec {dst} hostname -i | awk '{{print $NF}}') 2>/dev/null || true)",
            f'    packet_loss=$(echo "$ping_output" | grep -oP \'\\d+(?=% packet loss)\' || echo "100")',
            f'    avg_latency=$(echo "$ping_output" | grep -oP \'\\d+\\.\\d+(?=/\\d+\\.\\d+/\\d+\\.\\d+/)\' | head -1 || echo "0")',
            f'    echo "    {{\\"source\\": \\"{src}\\", \\"destination\\": \\"{dst}\\", \\"packet_loss_percent\\": $packet_loss, \\"avg_latency_ms\\": $avg_latency}}{comma}" >> "$METRICS_FILE"',
        ])

    script_lines.extend([
        'echo "  ]" >> "$METRICS_FILE"',
        'echo "}" >> "$METRICS_FILE"',
        "",
        'echo "Metrics saved to $METRICS_FILE"',
        "",
        "# Stop containers",
        "echo 'Stopping containers...'",
        "docker compose -f ${OUTPUT_DIR}/docker-compose.yml down",
        "",
        'echo "=== Done ==="',
    ])

    script_path = output_dir / "metrics.sh"
    script_path.write_text("\n".join(script_lines) + "\n")
    script_path.chmod(0o755)

    logger.info(f"Generated metrics script at {script_path}")
    return script_path


# ---------------------------------------------------------------------------
# Topology Lifecycle Management
# ---------------------------------------------------------------------------
def generate_topology(
    topology: dict, output_dir: Optional[Path] = None
) -> str:
    """
    Generate all files for a topology and register it.

    Generates docker-compose.yml, FRR configs for all routers, and the
    metrics collection script. Returns a topology_id that can be used with
    start_topology(), stop_topology(), and collect_metrics().

    Args:
        topology: Topology dictionary with 'devices' and 'links'.
        output_dir: Base output directory. If None, uses DEFAULT_OUTPUT_DIR.

    Returns:
        Topology ID string.
    """
    _validate_topology(topology)

    topology_id = f"topo_{uuid.uuid4().hex[:8]}"
    if output_dir is None:
        output_dir = DEFAULT_OUTPUT_DIR / topology_id
    else:
        output_dir = Path(output_dir) / topology_id

    output_dir = _ensure_output_dir(output_dir)
    ip_map = _assign_ips(topology)

    # Generate compose file
    generate_compose_file(topology, output_dir)

    # Generate FRR configs for all routers
    for device in topology["devices"]:
        if device.get("type") == "router":
            generate_frr_config(device["id"], topology, output_dir)

    # Generate metrics script
    generate_metrics_script(topology, output_dir)

    # Register topology
    _topology_registry[topology_id] = {
        "topology": topology,
        "output_dir": str(output_dir),
        "ip_map": ip_map,
    }

    logger.info(f"Generated topology {topology_id} at {output_dir}")
    return topology_id


def _get_topology_dir(topology_id: str) -> Path:
    """Get output directory for a topology."""
    if topology_id not in _topology_registry:
        raise ValueError(
            f"Topology '{topology_id}' not found. "
            "Generate it first with generate_topology()"
        )
    return Path(_topology_registry[topology_id]["output_dir"])


def _run_command(
    cmd: list[str],
    timeout: int = DOCKER_COMPOSE_TIMEOUT,
    cwd: Optional[Path] = None,
) -> subprocess.CompletedProcess:
    """Run a shell command with error handling."""
    logger.debug(f"Running command: {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(cwd) if cwd else None,
        )
        if result.returncode != 0:
            logger.error(f"Command failed: {' '.join(cmd)}")
            logger.error(f"stderr: {result.stderr}")
        return result
    except subprocess.TimeoutExpired:
        logger.error(f"Command timed out after {timeout}s: {' '.join(cmd)}")
        raise
    except FileNotFoundError:
        logger.error(f"Command not found: {cmd[0]}")
        raise


def start_topology(topology_id: str) -> dict:
    """
    Start Docker containers for a topology.

    Args:
        topology_id: Topology ID returned by generate_topology().

    Returns:
        Dictionary with topology_id, status, and output_dir.
    """
    topology_dir = _get_topology_dir(topology_id)
    compose_file = topology_dir / "docker-compose.yml"

    if not compose_file.exists():
        raise FileNotFoundError(f"Compose file not found: {compose_file}")

    logger.info(f"Starting topology {topology_id}...")

    result = _run_command(
        ["docker", "compose", "-f", str(compose_file), "up", "-d"],
        cwd=topology_dir,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Failed to start topology: {result.stderr}")

    logger.info(f"Topology {topology_id} started successfully")
    return {
        "topology_id": topology_id,
        "status": "started",
        "output_dir": str(topology_dir),
    }


def stop_topology(topology_id: str) -> dict:
    """
    Stop Docker containers for a topology.

    Args:
        topology_id: Topology ID returned by generate_topology().

    Returns:
        Dictionary with topology_id and status.
    """
    topology_dir = _get_topology_dir(topology_id)
    compose_file = topology_dir / "docker-compose.yml"

    if not compose_file.exists():
        raise FileNotFoundError(f"Compose file not found: {compose_file}")

    logger.info(f"Stopping topology {topology_id}...")

    result = _run_command(
        ["docker", "compose", "-f", str(compose_file), "down"],
        cwd=topology_dir,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Failed to stop topology: {result.stderr}")

    logger.info(f"Topology {topology_id} stopped successfully")
    return {
        "topology_id": topology_id,
        "status": "stopped",
    }


def collect_metrics(topology_id: str) -> dict:
    """
    Collect metrics from running containers.

    Collects OSPF neighbor counts, route counts, and runs ping tests
    between all router pairs. Saves results to metrics.json.

    Args:
        topology_id: Topology ID returned by generate_topology().

    Returns:
        Dictionary with collected metrics.
    """
    topology_dir = _get_topology_dir(topology_id)
    topology = _topology_registry[topology_id]["topology"]
    ip_map = _topology_registry[topology_id]["ip_map"]

    routers = [d["id"] for d in topology["devices"] if d.get("type") == "router"]

    logger.info(f"Collecting metrics for topology {topology_id}...")

    metrics: dict[str, Any] = {
        "topology_id": topology_id,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "routers": {},
        "ping_tests": [],
    }

    # Collect OSPF neighbor and route info
    for router in routers:
        try:
            result = _run_command(
                ["docker", "exec", router, "vtysh", "-c", "show ip ospf neighbor"],
                timeout=DOCKER_EXEC_TIMEOUT,
            )
            neighbor_count = (
                result.stdout.count("Full") if result.returncode == 0 else 0
            )
        except Exception as e:
            logger.warning(f"Failed to get OSPF neighbors for {router}: {e}")
            neighbor_count = 0

        try:
            result = _run_command(
                ["docker", "exec", router, "vtysh", "-c", "show ip route"],
                timeout=DOCKER_EXEC_TIMEOUT,
            )
            route_count = (
                result.stdout.count("\nO") if result.returncode == 0 else 0
            )
        except Exception as e:
            logger.warning(f"Failed to get routes for {router}: {e}")
            route_count = 0

        metrics["routers"][router] = {
            "ospf_neighbors": neighbor_count,
            "ospf_routes": route_count,
        }

    # Run ping tests between all router pairs
    for i, src in enumerate(routers):
        for dst in routers[i + 1:]:
            ping_result = _ping_routers(src, dst, ip_map)
            metrics["ping_tests"].append(ping_result)

    # Save metrics to file
    metrics_file = topology_dir / "metrics.json"
    with open(metrics_file, "w") as f:
        json.dump(metrics, f, indent=2)

    logger.info(f"Metrics saved to {metrics_file}")
    return metrics


def _ping_routers(src: str, dst: str, ip_map: dict) -> dict:
    """Ping between two routers and parse results."""
    # Find the IP of dst on a network shared with src
    dst_ip = None
    for network, ip in ip_map.get(dst, {}).items():
        if network in ip_map.get(src, {}):
            dst_ip = ip.split("/")[0]
            break

    if not dst_ip:
        # Fallback: use any IP from dst
        ips = list(ip_map.get(dst, {}).values())
        if ips:
            dst_ip = ips[0].split("/")[0]

    if not dst_ip:
        return {
            "source": src,
            "destination": dst,
            "error": "No shared network found",
            "packet_loss_percent": 100,
            "avg_latency_ms": 0,
        }

    try:
        result = _run_command(
            [
                "docker", "exec", src,
                "ping", "-c", str(PING_COUNT), "-W", str(PING_TIMEOUT),
                dst_ip,
            ],
            timeout=PING_TIMEOUT * PING_COUNT + 10,
        )

        output = result.stdout + result.stderr

        # Parse packet loss
        loss_match = re.search(r"(\d+)% packet loss", output)
        packet_loss = int(loss_match.group(1)) if loss_match else 100

        # Parse latency (min/avg/max/mdev)
        latency_match = re.search(
            r"(\d+\.\d+)/(\d+\.\d+)/(\d+\.\d+)/(\d+\.\d+)", output
        )
        avg_latency = float(latency_match.group(2)) if latency_match else 0

        return {
            "source": src,
            "destination": dst,
            "target_ip": dst_ip,
            "packet_loss_percent": packet_loss,
            "avg_latency_ms": round(avg_latency, 2),
        }
    except Exception as e:
        logger.warning(f"Ping from {src} to {dst} failed: {e}")
        return {
            "source": src,
            "destination": dst,
            "target_ip": dst_ip,
            "error": str(e),
            "packet_loss_percent": 100,
            "avg_latency_ms": 0,
        }


def wait_for_convergence(
    topology_id: str, timeout: int = CONVERGENCE_TIMEOUT
) -> bool:
    """
    Wait for OSPF convergence across all routers.

    Args:
        topology_id: Topology ID.
        timeout: Maximum time to wait in seconds.

    Returns:
        True if converged, False if timeout reached.
    """
    topology = _topology_registry[topology_id]["topology"]
    routers = [d["id"] for d in topology["devices"] if d.get("type") == "router"]

    logger.info(f"Waiting for OSPF convergence (timeout: {timeout}s)...")
    start_time = time.time()

    while time.time() - start_time < timeout:
        all_converged = True

        for router in routers:
            try:
                result = _run_command(
                    [
                        "docker", "exec", router,
                        "vtysh", "-c", "show ip ospf neighbor",
                    ],
                    timeout=DOCKER_EXEC_TIMEOUT,
                )
                if result.returncode != 0 or "Full" not in result.stdout:
                    all_converged = False
                    break
            except Exception:
                all_converged = False
                break

        if all_converged:
            elapsed = time.time() - start_time
            logger.info(f"OSPF converged in {elapsed:.1f}s")
            return True

        time.sleep(CONVERGENCE_POLL_INTERVAL)

    logger.warning(f"OSPF did not converge within {timeout}s")
    return False


def get_topology_status(topology_id: str) -> dict:
    """Get status of all containers in a topology."""
    topology_dir = _get_topology_dir(topology_id)
    compose_file = topology_dir / "docker-compose.yml"

    result = _run_command(
        ["docker", "compose", "-f", str(compose_file), "ps"],
        cwd=topology_dir,
    )

    return {
        "topology_id": topology_id,
        "status": "running" if result.returncode == 0 else "unknown",
        "containers": result.stdout if result.returncode == 0 else result.stderr,
    }


def list_topologies() -> list[str]:
    """List all registered topology IDs."""
    return list(_topology_registry.keys())


def cleanup(topology_id: Optional[str] = None) -> None:
    """
    Clean up generated files and optionally stop containers.

    Args:
        topology_id: Topology ID to clean up. If None, cleans up all.
    """
    if topology_id:
        if topology_id in _topology_registry:
            try:
                stop_topology(topology_id)
            except Exception as e:
                logger.warning(f"Failed to stop topology {topology_id}: {e}")

            topology_dir = Path(_topology_registry[topology_id]["output_dir"])
            if topology_dir.exists():
                shutil.rmtree(topology_dir)

            del _topology_registry[topology_id]
            logger.info(f"Cleaned up topology {topology_id}")
    else:
        # Clean up all
        for tid in list(_topology_registry.keys()):
            cleanup(tid)


def run_full_test(
    topology_id: str, keep_running: bool = False
) -> dict:
    """
    Run a full end-to-end test: start, converge, collect metrics, stop.

    Args:
        topology_id: Topology ID.
        keep_running: If True, don't stop containers after test.

    Returns:
        Dictionary with test results and metrics.
    """
    logger.info(f"Running full test for topology {topology_id}...")

    # Start containers
    start_result = start_topology(topology_id)

    # Wait for convergence
    converged = wait_for_convergence(topology_id)

    # Collect metrics
    metrics = collect_metrics(topology_id)

    # Stop containers (unless keep_running)
    stop_result = None
    if not keep_running:
        stop_result = stop_topology(topology_id)

    return {
        "topology_id": topology_id,
        "start": start_result,
        "converged": converged,
        "metrics": metrics,
        "stop": stop_result,
    }


# ---------------------------------------------------------------------------
# Main Block (Example Usage)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    example_topology = {
        "devices": [
            {"id": "router1", "type": "router"},
            {"id": "router2", "type": "router"},
            {"id": "router3", "type": "router"},
        ],
        "links": [
            {"source": "router1", "target": "router2"},
            {"source": "router2", "target": "router3"},
        ],
    }

    topology_id = generate_topology(example_topology)
    print(f"Generated topology: {topology_id}")
    print(f"Output directory: {DEFAULT_OUTPUT_DIR / topology_id}")
    print(f"Registered topologies: {list_topologies()}")
