from typing import Any

from routing_service import dijkstra_route, random_forest_route
from real_routing_service import deploy_and_measure_ospf, train_random_forest_on_real_data


def compare_algorithms(topology: dict, source: str, destination: str) -> dict:
    """Compare Dijkstra (OSPF) vs Random Forest routing algorithms with real data."""
    # Get Dijkstra/OSPF results with real Docker/FRR metrics
    dijkstra_result = dijkstra_route(topology, source, destination)

    # Deploy and measure real OSPF metrics
    real_ospf_metrics = deploy_and_measure_ospf(topology, source, destination)

    # Update Dijkstra metrics with real measured data
    if "error" not in real_ospf_metrics:
        dijkstra_result["metrics"] = real_ospf_metrics

    # Get Random Forest results with AI-based metrics
    rf_result = random_forest_route(topology, source, destination)

    # Train on real data and get AI-based metrics
    ai_metrics = train_random_forest_on_real_data(topology, source, destination)
    rf_result["metrics"] = ai_metrics

    # Extract metrics
    dijkstra_metrics = dijkstra_result.get("metrics", {})
    rf_metrics = rf_result.get("metrics", {})

    # Determine winner based on composite score
    def calc_score(m: dict) -> float:
        if not m:
            return 0.0
        latency_score = max(0, 1 - m.get("latency", 100) / 200) * 0.30
        bandwidth_score = min(1, m.get("bandwidth", 100) / 1000) * 0.25
        throughput_score = min(1, m.get("throughput", 100) / 100) * 0.20
        loss_score = max(0, 1 - m.get("packet_loss", 0.1) / 0.1) * 0.15
        conv_score = max(0, 1 - m.get("convergence_time", 100) / 200) * 0.10
        return latency_score + bandwidth_score + throughput_score + loss_score + conv_score

    dijkstra_score = calc_score(dijkstra_metrics)
    rf_score = calc_score(rf_metrics)

    winner = "dijkstra" if dijkstra_score > rf_score else "random_forest"

    # Generate recommendation
    if winner == "random_forest":
        latency_diff = dijkstra_metrics.get("latency", 0) - rf_metrics.get("latency", 0)
        if latency_diff > 0:
            recommendation = f"Random Forest provides {round(latency_diff, 2)}ms lower latency"
        else:
            recommendation = "Random Forest provides better overall path quality"
    else:
        recommendation = "OSPF (Dijkstra) provides the optimal path for current topology"

    # Calculate differences
    differences = {}
    for key in ["bandwidth", "latency", "throughput", "convergence_time", "packet_loss"]:
        d_val = dijkstra_metrics.get(key, 0)
        rf_val = rf_metrics.get(key, 0)
        diff = rf_val - d_val
        if key == "packet_loss":
            differences[key] = f"{round(diff * 100, 2)}%"
        else:
            differences[key] = round(diff, 2)

    return {
        "comparison": {
            "dijkstra": {
                "path": dijkstra_result.get("path", []),
                "hop_count": dijkstra_result.get("hop_count", 0),
                "total_cost": dijkstra_result.get("total_cost", 0),
                "metrics": dijkstra_metrics,
            },
            "random_forest": {
                "path": rf_result.get("path", []),
                "hop_count": rf_result.get("hop_count", 0),
                "total_cost": rf_result.get("total_cost", 0),
                "metrics": rf_metrics,
                "path_probability": rf_result.get("path_probability", 0),
            },
            "winner": winner,
            "recommendation": recommendation,
            "differences": differences,
            "trade_offs": {
                "dijkstra": "optimal path, faster convergence",
                "random_forest": "considers link quality, better for dynamic networks",
            },
        }
    }
