import uuid
from typing import Any

import networkx as nx
import numpy as np

from routing_service import build_graph, calculate_metrics


def simulate_packets(
    topology: dict,
    source: str,
    destination: str,
    packet_count: int = 100,
    packet_size: int = 1024,
    algorithm: str = "dijkstra",
) -> dict:
    """Simulate packet journey through the network."""
    G = build_graph(topology)

    if source not in G or destination not in G:
        return {
            "simulation_id": f"sim_{uuid.uuid4().hex[:8]}",
            "packets_sent": packet_count,
            "packets_received": 0,
            "packet_loss_count": packet_count,
            "simulation_trace": [],
            "error": f"Source '{source}' or destination '{destination}' not found",
        }

    # Find path
    try:
        if algorithm == "dijkstra":
            path = nx.shortest_path(G, source, destination, weight="cost")
        else:
            # For random forest, use the same path finding but with different weights
            # In production, this would use the ML model's path
            path = nx.shortest_path(G, source, destination, weight="cost")
    except nx.NetworkXNoPath:
        return {
            "simulation_id": f"sim_{uuid.uuid4().hex[:8]}",
            "packets_sent": packet_count,
            "packets_received": 0,
            "packet_loss_count": packet_count,
            "simulation_trace": [],
            "error": f"No path found between {source} and {destination}",
        }

    # Calculate per-hop metrics
    hop_latencies = []
    for i in range(len(path) - 1):
        edge_data = G[path[i]][path[i + 1]]
        hop_latencies.append(edge_data.get("latency", 10))

    # Simulate each packet
    simulation_trace = []
    packets_received = 0
    packet_loss_count = 0

    for packet_id in range(1, packet_count + 1):
        # Determine if packet is lost (based on total loss probability)
        total_loss_prob = sum(
            G[path[i]][path[i + 1]].get("loss_probability", 0.01)
            for i in range(len(path) - 1)
        )

        if np.random.random() < total_loss_prob:
            # Packet lost
            packet_loss_count += 1
            simulation_trace.append({
                "packet_id": packet_id,
                "timestamp": 0.0,
                "path": path,
                "hop_times": [],
                "total_latency": 0,
                "status": "lost",
            })
            continue

        # Packet delivered - calculate hop times with some randomness
        hop_times = [0.0]
        current_time = 0.0

        for i, latency in enumerate(hop_latencies):
            # Add processing delay at each router (except source)
            if i > 0:
                current_time += np.random.uniform(0.5, 2.0)  # Processing delay

            # Add link latency with jitter
            jitter = np.random.uniform(-1.0, 1.0)
            current_time += max(0.1, latency + jitter)
            hop_times.append(round(current_time, 2))

        packets_received += 1
        simulation_trace.append({
            "packet_id": packet_id,
            "timestamp": 0.0,
            "path": path,
            "hop_times": hop_times,
            "total_latency": round(current_time, 2),
            "status": "delivered",
        })

    return {
        "simulation_id": f"sim_{uuid.uuid4().hex[:8]}",
        "packets_sent": packet_count,
        "packets_received": packets_received,
        "packet_loss_count": packet_loss_count,
        "simulation_trace": simulation_trace,
    }
