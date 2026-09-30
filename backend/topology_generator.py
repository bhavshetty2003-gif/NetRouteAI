"""
Network Topology Generator for Random Forest Training Data.

Generates diverse, realistic network topologies with routers, switches, and PCs.
Each topology includes devices with IP addresses, subnet masks, and links with
realistic cost, bandwidth, latency, and loss probability parameters.

Topology types: star, mesh, ring, tree, bus, hybrid, enterprise, data_center, campus.
"""

import ipaddress
import json
import logging
import os
import random
from typing import Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# =====================================================
# Constants
# =====================================================

TOPOLOGY_TYPES = [
    "star",
    "mesh",
    "ring",
    "tree",
    "bus",
    "hybrid",
    "enterprise",
    "data_center",
    "campus",
]

DEVICE_TYPES = ["router", "switch", "pc"]

# Private IP ranges
PRIVATE_RANGES = [
    ("10.0.0.0", "10.255.255.255"),
    ("172.16.0.0", "172.31.255.255"),
    ("192.168.0.0", "192.168.255.255"),
]

# Subnet masks for different device types
SUBNET_MASKS = {
    "router": "255.255.255.0",
    "switch": "255.255.255.0",
    "pc": "255.255.255.0",
}

# Link parameter ranges
COST_RANGE = (1, 100)
BANDWIDTH_RANGE = (10, 1000)  # Mbps
LATENCY_RANGE = (1, 50)  # ms
LOSS_PROBABILITY_RANGE = (0.001, 0.05)


# =====================================================
# Helper Functions
# =====================================================


def _random_ip_in_range(start_ip: str, end_ip: str) -> str:
    """Generate a random IP address within a given range."""
    start = int(ipaddress.IPv4Address(start_ip))
    end = int(ipaddress.IPv4Address(end_ip))
    return str(ipaddress.IPv4Address(random.randint(start, end)))


def _generate_device_ip(device_type: str, used_ips: set[str]) -> str:
    """Generate a unique IP address for a device."""
    max_attempts = 1000
    for _ in range(max_attempts):
        range_start, range_end = random.choice(PRIVATE_RANGES)
        ip = _random_ip_in_range(range_start, range_end)
        if ip not in used_ips:
            used_ips.add(ip)
            return ip
    raise RuntimeError(f"Could not generate unique IP after {max_attempts} attempts")


def _generate_link_params() -> dict[str, Any]:
    """Generate realistic link parameters."""
    return {
        "cost": random.randint(*COST_RANGE),
        "bandwidth": random.randint(*BANDWIDTH_RANGE),
        "latency": random.randint(*LATENCY_RANGE),
        "loss_probability": round(random.uniform(*LOSS_PROBABILITY_RANGE), 4),
    }


def _ensure_connected(
    devices: list[dict[str, Any]], links: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    Ensure all devices are connected by adding links for isolated devices.
    Uses a union-find approach to connect disconnected components.
    """
    if not devices:
        return links

    # Build adjacency and find connected components
    parent: dict[str, str] = {d["id"]: d["id"] for d in devices}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for link in links:
        union(link["source"], link["target"])

    # Group devices by component
    components: dict[str, list[str]] = {}
    for d in devices:
        root = find(d["id"])
        components.setdefault(root, []).append(d["id"])

    if len(components) <= 1:
        return links

    # Connect components by adding links between them
    component_roots = list(components.keys())
    for i in range(len(component_roots) - 1):
        comp_a = components[component_roots[i]]
        comp_b = components[component_roots[i + 1]]
        # Pick a random device from each component
        dev_a = random.choice(comp_a)
        dev_b = random.choice(comp_b)
        link_params = _generate_link_params()
        links.append({"source": dev_a, "target": dev_b, **link_params})
        union(dev_a, dev_b)

    return links


def _create_device(device_id: str, device_type: str, used_ips: set[str]) -> dict[str, Any]:
    """Create a device dict with realistic attributes."""
    return {
        "id": device_id,
        "type": device_type,
        "ip_address": _generate_device_ip(device_type, used_ips),
        "subnet_mask": SUBNET_MASKS[device_type],
    }


def _create_link(source: str, target: str) -> dict[str, Any]:
    """Create a link dict with realistic parameters."""
    link_params = _generate_link_params()
    return {"source": source, "target": target, **link_params}


# =====================================================
# Topology Generators
# =====================================================


def _generate_star_topology(
    num_routers: int,
    num_switches: int,
    num_pcs: int,
    used_ips: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Star topology: One central router connected to all switches,
    and each switch connected to multiple PCs.
    """
    devices: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    # Central router
    central_router = _create_device("R1", "router", used_ips)
    devices.append(central_router)

    # Switches connected to central router
    switch_ids: list[str] = []
    for i in range(1, num_switches + 1):
        sw_id = f"SW{i}"
        switch_ids.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        links.append(_create_link("R1", sw_id))

    # PCs distributed across switches
    pcs_per_switch = num_pcs // max(num_switches, 1)
    extra_pcs = num_pcs % max(num_switches, 1)
    pc_counter = 1
    for i, sw_id in enumerate(switch_ids):
        count = pcs_per_switch + (1 if i < extra_pcs else 0)
        for _ in range(count):
            pc_id = f"PC{pc_counter}"
            devices.append(_create_device(pc_id, "pc", used_ips))
            links.append(_create_link(sw_id, pc_id))
            pc_counter += 1

    # Additional routers if specified (connected to central)
    for i in range(2, num_routers + 1):
        r_id = f"R{i}"
        devices.append(_create_device(r_id, "router", used_ips))
        links.append(_create_link("R1", r_id))

    return devices, links


def _generate_mesh_topology(
    num_routers: int,
    num_switches: int,
    num_pcs: int,
    used_ips: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Mesh topology: Routers are fully interconnected, switches connect
    to multiple routers, PCs connect to switches.
    """
    devices: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    # Create routers
    router_ids: list[str] = []
    for i in range(1, num_routers + 1):
        r_id = f"R{i}"
        router_ids.append(r_id)
        devices.append(_create_device(r_id, "router", used_ips))

    # Full mesh between routers
    for i in range(len(router_ids)):
        for j in range(i + 1, len(router_ids)):
            links.append(_create_link(router_ids[i], router_ids[j]))

    # Create switches, each connected to 2-3 routers
    switch_ids: list[str] = []
    for i in range(1, num_switches + 1):
        sw_id = f"SW{i}"
        switch_ids.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        # Connect to 2-3 random routers
        num_connections = min(random.randint(2, 3), len(router_ids))
        connected_routers = random.sample(router_ids, num_connections)
        for r_id in connected_routers:
            links.append(_create_link(r_id, sw_id))

    # PCs connected to switches
    pcs_per_switch = num_pcs // max(num_switches, 1)
    extra_pcs = num_pcs % max(num_switches, 1)
    pc_counter = 1
    for i, sw_id in enumerate(switch_ids):
        count = pcs_per_switch + (1 if i < extra_pcs else 0)
        for _ in range(count):
            pc_id = f"PC{pc_counter}"
            devices.append(_create_device(pc_id, "pc", used_ips))
            links.append(_create_link(sw_id, pc_id))
            pc_counter += 1

    return devices, links


def _generate_ring_topology(
    num_routers: int,
    num_switches: int,
    num_pcs: int,
    used_ips: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Ring topology: Routers form a ring, switches attach to routers,
    PCs attach to switches.
    """
    devices: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    # Create routers in a ring
    router_ids: list[str] = []
    for i in range(1, num_routers + 1):
        r_id = f"R{i}"
        router_ids.append(r_id)
        devices.append(_create_device(r_id, "router", used_ips))

    # Connect routers in a ring
    for i in range(len(router_ids)):
        next_i = (i + 1) % len(router_ids)
        links.append(_create_link(router_ids[i], router_ids[next_i]))

    # Create switches, each connected to one router
    switch_ids: list[str] = []
    for i in range(1, num_switches + 1):
        sw_id = f"SW{i}"
        switch_ids.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        # Connect to a router (distribute evenly)
        r_idx = (i - 1) % len(router_ids)
        links.append(_create_link(router_ids[r_idx], sw_id))

    # PCs connected to switches
    pcs_per_switch = num_pcs // max(num_switches, 1)
    extra_pcs = num_pcs % max(num_switches, 1)
    pc_counter = 1
    for i, sw_id in enumerate(switch_ids):
        count = pcs_per_switch + (1 if i < extra_pcs else 0)
        for _ in range(count):
            pc_id = f"PC{pc_counter}"
            devices.append(_create_device(pc_id, "pc", used_ips))
            links.append(_create_link(sw_id, pc_id))
            pc_counter += 1

    return devices, links


def _generate_tree_topology(
    num_routers: int,
    num_switches: int,
    num_pcs: int,
    used_ips: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Tree topology: Hierarchical structure with root router, intermediate
    routers/switches, and PCs at the leaves.
    """
    devices: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    # Root router
    root_router = _create_device("R1", "router", used_ips)
    devices.append(root_router)

    # Build tree level by level
    current_level: list[str] = ["R1"]
    router_counter = 2
    switch_counter = 1
    pc_counter = 1

    # Level 1: Routers
    level1_routers: list[str] = []
    for i in range(min(num_routers - 1, random.randint(1, 3))):
        r_id = f"R{router_counter}"
        router_counter += 1
        level1_routers.append(r_id)
        devices.append(_create_device(r_id, "router", used_ips))
        parent = random.choice(current_level)
        links.append(_create_link(parent, r_id))

    if level1_routers:
        current_level = level1_routers

    # Level 2: Switches
    level2_switches: list[str] = []
    for i in range(num_switches):
        sw_id = f"SW{switch_counter}"
        switch_counter += 1
        level2_switches.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        parent = random.choice(current_level)
        links.append(_create_link(parent, sw_id))

    if level2_switches:
        current_level = level2_switches

    # Level 3: PCs
    for i in range(num_pcs):
        pc_id = f"PC{pc_counter}"
        pc_counter += 1
        devices.append(_create_device(pc_id, "pc", used_ips))
        parent = random.choice(current_level)
        links.append(_create_link(parent, pc_id))

    # Remaining routers if any
    while router_counter <= num_routers:
        r_id = f"R{router_counter}"
        router_counter += 1
        devices.append(_create_device(r_id, "router", used_ips))
        parent = random.choice(current_level)
        links.append(_create_link(parent, r_id))

    return devices, links


def _generate_bus_topology(
    num_routers: int,
    num_switches: int,
    num_pcs: int,
    used_ips: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Bus topology: All devices connected to a single backbone (chain).
    """
    devices: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    # Create a backbone chain of routers
    router_ids: list[str] = []
    for i in range(1, num_routers + 1):
        r_id = f"R{i}"
        router_ids.append(r_id)
        devices.append(_create_device(r_id, "router", used_ips))

    # Chain routers together (backbone)
    for i in range(len(router_ids) - 1):
        links.append(_create_link(router_ids[i], router_ids[i + 1]))

    # Attach switches to routers along the backbone
    switch_ids: list[str] = []
    for i in range(1, num_switches + 1):
        sw_id = f"SW{i}"
        switch_ids.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        # Attach to a router on the backbone
        r_idx = (i - 1) % len(router_ids)
        links.append(_create_link(router_ids[r_idx], sw_id))

    # PCs connected to switches
    pcs_per_switch = num_pcs // max(num_switches, 1)
    extra_pcs = num_pcs % max(num_switches, 1)
    pc_counter = 1
    for i, sw_id in enumerate(switch_ids):
        count = pcs_per_switch + (1 if i < extra_pcs else 0)
        for _ in range(count):
            pc_id = f"PC{pc_counter}"
            devices.append(_create_device(pc_id, "pc", used_ips))
            links.append(_create_link(sw_id, pc_id))
            pc_counter += 1

    return devices, links


def _generate_hybrid_topology(
    num_routers: int,
    num_switches: int,
    num_pcs: int,
    used_ips: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Hybrid topology: Combines multiple topology types.
    Core routers in a mesh, distribution switches in a star, access switches
    with PCs.
    """
    devices: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    # Core routers in a mesh
    core_routers: list[str] = []
    num_core = min(3, num_routers)
    for i in range(1, num_core + 1):
        r_id = f"R{i}"
        core_routers.append(r_id)
        devices.append(_create_device(r_id, "router", used_ips))

    # Mesh between core routers
    for i in range(len(core_routers)):
        for j in range(i + 1, len(core_routers)):
            links.append(_create_link(core_routers[i], core_routers[j]))

    # Distribution switches connected to core routers
    dist_switches: list[str] = []
    num_dist = min(num_switches // 2, 4)
    for i in range(1, num_dist + 1):
        sw_id = f"SW{i}"
        dist_switches.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        # Connect to 2 core routers
        for r_id in random.sample(core_routers, min(2, len(core_routers))):
            links.append(_create_link(r_id, sw_id))

    # Access switches connected to distribution switches
    access_switches: list[str] = []
    switch_counter = num_dist + 1
    for i in range(num_switches - num_dist):
        sw_id = f"SW{switch_counter}"
        switch_counter += 1
        access_switches.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        parent = random.choice(dist_switches) if dist_switches else random.choice(core_routers)
        links.append(_create_link(parent, sw_id))

    # Remaining routers
    router_counter = num_core + 1
    while router_counter <= num_routers:
        r_id = f"R{router_counter}"
        router_counter += 1
        devices.append(_create_device(r_id, "router", used_ips))
        parent = random.choice(core_routers)
        links.append(_create_link(parent, r_id))

    # PCs connected to access switches
    all_switches = dist_switches + access_switches
    pcs_per_switch = num_pcs // max(len(all_switches), 1)
    extra_pcs = num_pcs % max(len(all_switches), 1)
    pc_counter = 1
    for i, sw_id in enumerate(all_switches):
        count = pcs_per_switch + (1 if i < extra_pcs else 0)
        for _ in range(count):
            pc_id = f"PC{pc_counter}"
            devices.append(_create_device(pc_id, "pc", used_ips))
            links.append(_create_link(sw_id, pc_id))
            pc_counter += 1

    return devices, links


def _generate_enterprise_topology(
    num_routers: int,
    num_switches: int,
    num_pcs: int,
    used_ips: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Enterprise topology: Multiple areas with core, distribution, and access layers.
    Simulates a multi-site enterprise network.
    """
    devices: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    # Core layer: 2-3 core routers in a mesh
    core_routers: list[str] = []
    num_core = min(random.randint(2, 3), num_routers)
    for i in range(1, num_core + 1):
        r_id = f"R{i}"
        core_routers.append(r_id)
        devices.append(_create_device(r_id, "router", used_ips))

    # Full mesh between core routers
    for i in range(len(core_routers)):
        for j in range(i + 1, len(core_routers)):
            links.append(_create_link(core_routers[i], core_routers[j]))

    # Distribution layer: switches connected to core
    dist_switches: list[str] = []
    num_dist = min(num_switches // 3, 6)
    for i in range(1, num_dist + 1):
        sw_id = f"SW{i}"
        dist_switches.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        # Connect to 2 core routers
        for r_id in random.sample(core_routers, min(2, len(core_routers))):
            links.append(_create_link(r_id, sw_id))

    # Access layer: switches connected to distribution
    access_switches: list[str] = []
    switch_counter = num_dist + 1
    num_access = num_switches - num_dist
    for i in range(num_access):
        sw_id = f"SW{switch_counter}"
        switch_counter += 1
        access_switches.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        parent = random.choice(dist_switches) if dist_switches else random.choice(core_routers)
        links.append(_create_link(parent, sw_id))

    # Remaining routers (branch routers)
    router_counter = num_core + 1
    while router_counter <= num_routers:
        r_id = f"R{router_counter}"
        router_counter += 1
        devices.append(_create_device(r_id, "router", used_ips))
        parent = random.choice(core_routers + dist_switches)
        links.append(_create_link(parent, r_id))

    # PCs connected to access switches
    all_switches = dist_switches + access_switches
    pcs_per_switch = num_pcs // max(len(all_switches), 1)
    extra_pcs = num_pcs % max(len(all_switches), 1)
    pc_counter = 1
    for i, sw_id in enumerate(all_switches):
        count = pcs_per_switch + (1 if i < extra_pcs else 0)
        for _ in range(count):
            pc_id = f"PC{pc_counter}"
            devices.append(_create_device(pc_id, "pc", used_ips))
            links.append(_create_link(sw_id, pc_id))
            pc_counter += 1

    return devices, links


def _generate_data_center_topology(
    num_routers: int,
    num_switches: int,
    num_pcs: int,
    used_ips: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Data center topology: Spine-leaf architecture.
    Spine routers fully connected to leaf switches, servers (PCs) connected to leaves.
    """
    devices: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    # Spine layer (routers)
    spine_routers: list[str] = []
    num_spine = min(random.randint(2, 4), num_routers)
    for i in range(1, num_spine + 1):
        r_id = f"R{i}"
        spine_routers.append(r_id)
        devices.append(_create_device(r_id, "router", used_ips))

    # Leaf layer (switches)
    leaf_switches: list[str] = []
    num_leaf = min(num_switches, 8)
    for i in range(1, num_leaf + 1):
        sw_id = f"SW{i}"
        leaf_switches.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))

    # Full mesh: every spine connected to every leaf
    for r_id in spine_routers:
        for sw_id in leaf_switches:
            links.append(_create_link(r_id, sw_id))

    # Remaining switches (aggregation)
    agg_switches: list[str] = []
    switch_counter = num_leaf + 1
    for i in range(num_switches - num_leaf):
        sw_id = f"SW{switch_counter}"
        switch_counter += 1
        agg_switches.append(sw_id)
        devices.append(_create_device(sw_id, "switch", used_ips))
        # Connect to 2 leaf switches
        for leaf_id in random.sample(leaf_switches, min(2, len(leaf_switches))):
            links.append(_create_link(leaf_id, sw_id))

    # Remaining routers
    router_counter = num_spine + 1
    while router_counter <= num_routers:
        r_id = f"R{router_counter}"
        router_counter += 1
        devices.append(_create_device(r_id, "router", used_ips))
        # Connect to all spine routers
        for spine_id in spine_routers:
            links.append(_create_link(spine_id, r_id))

    # Servers (PCs) connected to leaf switches
    all_switches = leaf_switches + agg_switches
    pcs_per_switch = num_pcs // max(len(all_switches), 1)
    extra_pcs = num_pcs % max(len(all_switches), 1)
    pc_counter = 1
    for i, sw_id in enumerate(all_switches):
        count = pcs_per_switch + (1 if i < extra_pcs else 0)
        for _ in range(count):
            pc_id = f"PC{pc_counter}"
            devices.append(_create_device(pc_id, "pc", used_ips))
            links.append(_create_link(sw_id, pc_id))
            pc_counter += 1

    return devices, links


def _generate_campus_topology(
    num_routers: int,
    num_switches: int,
    num_pcs: int,
    used_ips: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Campus topology: Multiple buildings, each with its own distribution
    switches, connected to a core router. PCs in each building.
    """
    devices: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []

    # Core router
    core_router = _create_device("R1", "router", used_ips)
    devices.append(core_router)

    # Determine number of buildings
    num_buildings = min(random.randint(2, 4), num_switches)
    switches_per_building = num_switches // num_buildings
    extra_switches = num_switches % num_buildings

    switch_counter = 1
    pc_counter = 1
    router_counter = 2

    for b in range(num_buildings):
        # Building distribution switch
        dist_sw_id = f"SW{switch_counter}"
        switch_counter += 1
        devices.append(_create_device(dist_sw_id, "switch", used_ips))
        links.append(_create_link("R1", dist_sw_id))

        # Building router (if available)
        if router_counter <= num_routers:
            r_id = f"R{router_counter}"
            router_counter += 1
            devices.append(_create_device(r_id, "router", used_ips))
            links.append(_create_link(dist_sw_id, r_id))

        # Access switches in this building
        num_access = switches_per_building + (1 if b < extra_switches else 0)
        building_switches = [dist_sw_id]
        for _ in range(num_access - 1):
            if switch_counter > num_switches:
                break
            sw_id = f"SW{switch_counter}"
            switch_counter += 1
            devices.append(_create_device(sw_id, "switch", used_ips))
            links.append(_create_link(dist_sw_id, sw_id))
            building_switches.append(sw_id)

        # PCs in this building
        pcs_per_building = num_pcs // num_buildings
        extra_pcs = num_pcs % num_buildings if b == 0 else 0
        num_pcs_building = pcs_per_building + extra_pcs
        for _ in range(num_pcs_building):
            pc_id = f"PC{pc_counter}"
            pc_counter += 1
            devices.append(_create_device(pc_id, "pc", used_ips))
            parent = random.choice(building_switches)
            links.append(_create_link(parent, pc_id))

    # Remaining routers
    while router_counter <= num_routers:
        r_id = f"R{router_counter}"
        router_counter += 1
        devices.append(_create_device(r_id, "router", used_ips))
        links.append(_create_link("R1", r_id))

    return devices, links


# =====================================================
# Main Generator
# =====================================================


# Map topology types to their generator functions
TOPOLOGY_GENERATORS = {
    "star": _generate_star_topology,
    "mesh": _generate_mesh_topology,
    "ring": _generate_ring_topology,
    "tree": _generate_tree_topology,
    "bus": _generate_bus_topology,
    "hybrid": _generate_hybrid_topology,
    "enterprise": _generate_enterprise_topology,
    "data_center": _generate_data_center_topology,
    "campus": _generate_campus_topology,
}


def generate_single_topology(
    topology_id: str,
    topology_type: str | None = None,
) -> dict[str, Any]:
    """
    Generate a single network topology.

    Args:
        topology_id: Unique identifier for the topology.
        topology_type: Type of topology to generate. If None, randomly chosen.

    Returns:
        A topology dict with devices and links.
    """
    if topology_type is None:
        topology_type = random.choice(TOPOLOGY_TYPES)

    if topology_type not in TOPOLOGY_GENERATORS:
        raise ValueError(
            f"Unknown topology type: {topology_type}. "
            f"Valid types: {list(TOPOLOGY_GENERATORS.keys())}"
        )

    # Random device counts within specified ranges
    num_routers = random.randint(3, 15)
    num_switches = random.randint(5, 30)
    num_pcs = random.randint(10, 50)

    used_ips: set[str] = set()

    # Generate devices and links using the appropriate generator
    generator_func = TOPOLOGY_GENERATORS[topology_type]
    devices, links = generator_func(num_routers, num_switches, num_pcs, used_ips)

    # Ensure all devices are connected
    links = _ensure_connected(devices, links)

    # Remove duplicate links
    seen_links: set[tuple[str, str]] = set()
    unique_links: list[dict[str, Any]] = []
    for link in links:
        key = tuple(sorted([link["source"], link["target"]]))
        if key not in seen_links:
            seen_links.add(key)
            unique_links.append(link)

    topology = {
        "id": topology_id,
        "type": topology_type,
        "devices": devices,
        "links": unique_links,
    }

    return topology


def generate_topologies(count: int = 150, seed: int = 42) -> list[dict[str, Any]]:
    """
    Generate a list of diverse network topologies.

    Args:
        count: Number of topologies to generate (default: 150).
        seed: Random seed for reproducibility (default: 42).

    Returns:
        A list of topology dicts.
    """
    random.seed(seed)
    if count < 1:
        raise ValueError(f"Count must be at least 1, got {count}")

    logger.info("Starting generation of %d topologies...", count)

    topologies: list[dict[str, Any]] = []

    for i in range(1, count + 1):
        topology_id = f"topo_{i:03d}"

        # Distribute topology types evenly
        if i <= len(TOPOLOGY_TYPES):
            # First pass: one of each type
            topology_type = TOPOLOGY_TYPES[(i - 1) % len(TOPOLOGY_TYPES)]
        else:
            # Subsequent passes: random type
            topology_type = None  # Random

        try:
            topology = generate_single_topology(topology_id, topology_type)
            topologies.append(topology)

            if i % 10 == 0 or i == count:
                logger.info("Generated %d / %d topologies", i, count)

        except Exception as e:
            logger.error("Failed to generate topology %s: %s", topology_id, e)
            raise

    logger.info("Successfully generated %d topologies", len(topologies))
    return topologies


def save_topologies(
    topologies: list[dict[str, Any]],
    output_dir: str = "generated_topologies",
) -> list[str]:
    """
    Save topologies to JSON files in the specified directory.

    Args:
        topologies: List of topology dicts to save.
        output_dir: Directory to save the JSON files.

    Returns:
        List of file paths that were saved.
    """
    if not topologies:
        raise ValueError("No topologies to save")

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    logger.info("Saving %d topologies to %s/", len(topologies), output_dir)

    saved_files: list[str] = []

    for topology in topologies:
        filename = f"{topology['id']}.json"
        filepath = os.path.join(output_dir, filename)

        try:
            with open(filepath, "w") as f:
                json.dump(topology, f, indent=2)
            saved_files.append(filepath)
        except OSError as e:
            logger.error("Failed to save topology %s: %s", topology["id"], e)
            raise

    logger.info("Saved %d topology files to %s/", len(saved_files), output_dir)
    return saved_files


def load_topologies(input_dir: str = "generated_topologies") -> list[dict[str, Any]]:
    """
    Load topologies from JSON files in the specified directory.

    Args:
        input_dir: Directory containing the JSON files.

    Returns:
        List of topology dicts loaded from files.
    """
    if not os.path.isdir(input_dir):
        raise FileNotFoundError(f"Directory not found: {input_dir}")

    logger.info("Loading topologies from %s/", input_dir)

    topologies: list[dict[str, Any]] = []

    # Get all JSON files sorted by name
    json_files = sorted(
        [f for f in os.listdir(input_dir) if f.endswith(".json")]
    )

    if not json_files:
        logger.warning("No JSON files found in %s", input_dir)
        return topologies

    for filename in json_files:
        filepath = os.path.join(input_dir, filename)
        try:
            with open(filepath, "r") as f:
                topology = json.load(f)

            # Validate required fields
            if "id" not in topology or "devices" not in topology or "links" not in topology:
                logger.warning("Skipping %s: missing required fields", filename)
                continue

            topologies.append(topology)

        except (json.JSONDecodeError, OSError) as e:
            logger.error("Failed to load %s: %s", filename, e)
            continue

    logger.info("Loaded %d topologies from %s/", len(topologies), input_dir)
    return topologies


# =====================================================
# CLI Entry Point
# =====================================================


def main() -> None:
    """CLI entry point for generating topologies."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate diverse network topologies for Random Forest training."
    )
    parser.add_argument(
        "--count",
        type=int,
        default=150,
        help="Number of topologies to generate (default: 150)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="generated_topologies",
        help="Output directory for JSON files (default: generated_topologies)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )

    args = parser.parse_args()

    # Set random seed for reproducibility
    random.seed(args.seed)
    logger.info("Using random seed: %d", args.seed)

    # Generate topologies
    topologies = generate_topologies(count=args.count)

    # Save to files
    save_topologies(topologies, output_dir=args.output_dir)

    # Print summary
    total_devices = sum(len(t["devices"]) for t in topologies)
    total_links = sum(len(t["links"]) for t in topologies)
    logger.info("=== Generation Summary ===")
    logger.info("Topologies: %d", len(topologies))
    logger.info("Total devices: %d", total_devices)
    logger.info("Total links: %d", total_links)
    logger.info("Avg devices per topology: %.1f", total_devices / len(topologies))
    logger.info("Avg links per topology: %.1f", total_links / len(topologies))


if __name__ == "__main__":
    main()
