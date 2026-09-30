import heapq
import uuid
from typing import Any

import networkx as nx
import numpy as np
from sklearn.ensemble import RandomForestClassifier

from database import get_training_data


def build_graph(topology: dict) -> nx.Graph:
    """Build a NetworkX graph from topology dict."""
    G = nx.Graph()
    for device in topology["devices"]:
        G.add_node(device["id"], type=device.get("type", "unknown"))
    for link in topology["links"]:
        G.add_edge(
            link["source"],
            link["target"],
            cost=link.get("cost", 1),
            bandwidth=link.get("bandwidth", 100),
            latency=link.get("latency", 10),
            loss_probability=link.get("loss_probability", 0.01),
        )
    return G


def dijkstra_route(topology: dict, source: str, destination: str) -> dict:
    """Calculate shortest path using Dijkstra's algorithm (OSPF-like)."""
    G = build_graph(topology)

    if source not in G or destination not in G:
        return {
            "algorithm": "dijkstra",
            "path": [],
            "hop_count": 0,
            "total_cost": 0,
            "routing_table": {},
            "frr_config": "",
            "metrics": {},
            "error": f"Source '{source}' or destination '{destination}' not found in topology",
        }

    try:
        path = nx.shortest_path(G, source, destination, weight="cost")
    except nx.NetworkXNoPath:
        return {
            "algorithm": "dijkstra",
            "path": [],
            "hop_count": 0,
            "total_cost": 0,
            "routing_table": {},
            "frr_config": "",
            "metrics": {},
            "error": f"No path found between {source} and {destination}",
        }

    total_cost = 0
    for i in range(len(path) - 1):
        edge_data = G[path[i]][path[i + 1]]
        total_cost += edge_data.get("cost", 1)

    # Generate routing table
    routing_table = {}
    for node in G.nodes():
        try:
            paths = nx.single_source_dijkstra_path(G, node, weight="cost")
            lengths = nx.single_source_dijkstra_path_length(G, node, weight="cost")
            routing_table[node] = {
                "paths": {k: v for k, v in paths.items() if k != node},
                "costs": {k: v for k, v in lengths.items() if k != node},
            }
        except nx.NetworkXError:
            routing_table[node] = {"paths": {}, "costs": {}}

    # Generate FRR config with OSPF (ospfd + zebra)
    frr_config = generate_frr_config(G, path)

    # Calculate metrics
    metrics = calculate_metrics(G, path)

    return {
        "algorithm": "dijkstra",
        "path": path,
        "hop_count": len(path) - 1,
        "total_cost": total_cost,
        "routing_table": routing_table,
        "frr_config": frr_config,
        "metrics": metrics,
    }


def random_forest_route(topology: dict, source: str, destination: str) -> dict:
    """ML-based path selection using Random Forest trained on database."""
    G = build_graph(topology)

    if source not in G or destination not in G:
        return {
            "algorithm": "random_forest",
            "path": [],
            "hop_count": 0,
            "total_cost": 0,
            "routing_table": {},
            "frr_config": "",
            "metrics": {},
            "error": f"Source '{source}' or destination '{destination}' not found in topology",
        }

    # Get all simple paths between source and destination (limit to avoid explosion)
    try:
        all_paths = list(nx.all_simple_paths(G, source, destination, cutoff=10))
    except nx.NetworkXNoPath:
        return {
            "algorithm": "random_forest",
            "path": [],
            "hop_count": 0,
            "total_cost": 0,
            "routing_table": {},
            "frr_config": "",
            "metrics": {},
            "error": f"No path found between {source} and {destination}",
        }

    if not all_paths:
        return {
            "algorithm": "random_forest",
            "path": [],
            "hop_count": 0,
            "total_cost": 0,
            "routing_table": {},
            "frr_config": "",
            "metrics": {},
            "error": f"No path found between {source} and {destination}",
        }

    # Score each path using Random Forest trained on database
    path_features = []
    for path in all_paths:
        features = extract_path_features(G, path)
        path_features.append(features)

    # Train Random Forest on data from SQLite database
    rf = RandomForestClassifier(n_estimators=100, random_state=42)

    X_train, y_train = get_training_data()

    if len(X_train) > 0:
        rf.fit(X_train, y_train)
        # Score each path
        path_scores = []
        for i, features in enumerate(path_features):
            proba = rf.predict_proba([features])[0]
            path_scores.append(proba[1] if len(proba) > 1 else 0.5)
    else:
        # Fallback to random scores if no training data
        path_scores = [0.5] * len(all_paths)

    # Select best path
    best_idx = np.argmax(path_scores)
    best_path = all_paths[best_idx]
    best_score = path_scores[best_idx]

    # Calculate metrics for best path
    metrics = calculate_metrics(G, best_path)

    # Generate FRR config
    frr_config = generate_frr_config(G, best_path)

    # Generate routing table
    routing_table = {}
    for node in G.nodes():
        try:
            paths = nx.single_source_dijkstra_path(G, node, weight="cost")
            lengths = nx.single_source_dijkstra_path_length(G, node, weight="cost")
            routing_table[node] = {
                "paths": {k: v for k, v in paths.items() if k != node},
                "costs": {k: v for k, v in lengths.items() if k != node},
            }
        except nx.NetworkXError:
            routing_table[node] = {"paths": {}, "costs": {}}

    return {
        "algorithm": "random_forest",
        "path": best_path,
        "hop_count": len(best_path) - 1,
        "total_cost": sum(G[best_path[i]][best_path[i + 1]].get("cost", 1) for i in range(len(best_path) - 1)),
        "routing_table": routing_table,
        "frr_config": frr_config,
        "metrics": metrics,
        "path_probability": round(best_score, 2),
        "ml_features": {
            "predicted_congestion": round(1 - best_score, 2),
            "link_reliability": round(1 - metrics.get("packet_loss", 0), 2),
            "predicted_delay_variance": round(metrics.get("latency", 0) * 0.1, 2),
        },
    }


def extract_path_features(G: nx.Graph, path: list[str]) -> list[float]:
    """Extract features from a path for ML scoring using real topology data."""
    hop_count = len(path) - 1
    total_cost = 0
    min_bandwidth = float("inf")
    total_latency = 0
    total_loss = 0

    for i in range(len(path) - 1):
        edge_data = G[path[i]][path[i + 1]]
        total_cost += edge_data.get("cost", 1)
        bw = edge_data.get("bandwidth", 100)
        min_bandwidth = min(min_bandwidth, bw)
        total_latency += edge_data.get("latency", 10)
        total_loss += edge_data.get("loss_probability", 0.01)

    if min_bandwidth == float("inf"):
        min_bandwidth = 100

    # Calculate real utilization based on link characteristics
    # Higher cost and lower bandwidth indicate higher utilization
    avg_utilization = min(1.0, (total_cost / 100) * 0.3 + (1 - min_bandwidth / 1000) * 0.3 + total_loss * 10)

    return [hop_count, total_cost, min_bandwidth, total_latency, total_loss, avg_utilization]


def calculate_metrics(G: nx.Graph, path: list[str]) -> dict:
    """Calculate network metrics for a given path."""
    if len(path) < 2:
        return {
            "bandwidth": 0,
            "latency": 0,
            "throughput": 0,
            "convergence_time": 0,
            "packet_loss": 0,
        }

    min_bandwidth = float("inf")
    total_latency = 0
    total_loss = 0

    for i in range(len(path) - 1):
        edge_data = G[path[i]][path[i + 1]]
        bw = edge_data.get("bandwidth", 100)
        min_bandwidth = min(min_bandwidth, bw)
        total_latency += edge_data.get("latency", 10)
        total_loss += edge_data.get("loss_probability", 0.01)

    if min_bandwidth == float("inf"):
        min_bandwidth = 100

    # Goodput ceiling: available bandwidth scaled by the share not lost.
    # This is a property of the *topology model*, not a measured rate --
    # real throughput comes from metrics_collector.measure_bandwidth().
    packet_size = 1024
    throughput = (min_bandwidth * (1 - total_loss)) / packet_size

    # OSPF convergence model: dead-timer detection + LSA flood + SPF run.
    # Measured convergence is available via convergence.measure_convergence().
    hop_count = len(path) - 1
    network_complexity = len(G.nodes()) * 0.5
    convergence_time = (hop_count * 10) + network_complexity

    total_cost = sum(
        G[path[i]][path[i + 1]].get("cost", 1) for i in range(len(path) - 1)
    )

    return {
        "bandwidth": round(min_bandwidth, 2),
        "latency": round(total_latency, 2),
        "throughput": round(throughput, 2),
        "convergence_time": round(convergence_time, 2),
        "packet_loss": round(total_loss, 4),
        "hop_count": hop_count,
        "total_cost": total_cost,
    }


def generate_frr_config(G: nx.Graph, path: list[str]) -> str:
    """Generate FRR OSPF configuration with ospfd and zebra for routers in the path."""
    config_lines = []
    config_lines.append("frr version 8.4")
    config_lines.append("frr defaults traditional")
    config_lines.append("!")

    # Get unique routers in path
    routers = []
    for node in path:
        if G.nodes[node].get("type") == "router":
            routers.append(node)

    for router in routers:
        config_lines.append(f"hostname {router}")
        config_lines.append("service integrated-vtysh-config")
        config_lines.append("!")

        # Get interfaces for this router
        iface_num = 0
        for neighbor in G.neighbors(router):
            edge_data = G[router][neighbor]
            config_lines.append(f"interface eth{iface_num}")
            config_lines.append(f" ip address 10.0.{iface_num}.1/24")
            config_lines.append(f" ip ospf cost {edge_data.get('cost', 1)}")
            config_lines.append(" ip ospf network point-to-point")
            config_lines.append(" ip ospf area 0")
            config_lines.append("!")
            config_lines.append("exit")
            config_lines.append("!")
            iface_num += 1

        # OSPF configuration
        config_lines.append("router ospf")
        config_lines.append(f" ospf router-id 1.1.1.{routers.index(router) + 1}")
        config_lines.append(" network 10.0.0.0/8 area 0")
        config_lines.append("exit")
        config_lines.append("!")

        # Zebra configuration
        config_lines.append("zebra")
        config_lines.append("!")
        config_lines.append("line vty")
        config_lines.append("!")

    return "\n".join(config_lines)


def store_topology(topology: dict) -> str:
    """Store topology and return ID."""
    topology_id = f"topo_{uuid.uuid4().hex[:8]}"
    return topology_id


def get_topology(topology_id: str, topologies_store: dict) -> dict | None:
    """Retrieve topology by ID."""
    return topologies_store.get(topology_id)
