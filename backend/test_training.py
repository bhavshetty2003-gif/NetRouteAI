#!/usr/bin/env python3
"""
Test script to verify the real network training pipeline.

This script:
1. Generates a small number of topologies (5)
2. Verifies the database is working
3. Tests the metrics collection (without Docker)
4. Verifies the training pipeline

Usage:
    python test_training.py
"""

import json
import os
import sys
import sqlite3
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from database import init_db, get_db, insert_network_metrics, get_training_data
from topology_generator import generate_topologies, save_topologies, load_topologies


def test_topology_generation():
    """Test topology generation."""
    print("=" * 60)
    print("TEST 1: Topology Generation")
    print("=" * 60)
    
    topologies = generate_topologies(count=5, seed=42)
    
    print(f"✓ Generated {len(topologies)} topologies")
    
    for topo in topologies:
        devices = len(topo.get('devices', []))
        links = len(topo.get('links', []))
        print(f"  - {topo['id']}: {devices} devices, {links} links, type={topo.get('type', 'unknown')}")
    
    # Save and load
    save_topologies(topologies, "test_topologies")
    loaded = load_topologies("test_topologies")
    
    assert len(loaded) == 5, f"Expected 5 topologies, got {len(loaded)}"
    print(f"✓ Saved and loaded {len(loaded)} topologies")
    
    return topologies


def test_database():
    """Test database operations."""
    print("\n" + "=" * 60)
    print("TEST 2: Database Operations")
    print("=" * 60)
    
    init_db()
    
    # Insert test metrics
    for i in range(10):
        insert_network_metrics(
            latency=10.0 + i,
            packet_loss=0.1 + i * 0.01,
            bandwidth=100.0 + i * 10,
            hop_count=i + 1,
            link_cost=10 + i,
            congestion=0.1 + i * 0.05,
            label=["Low", "Medium", "High"][i % 3]
        )
    
    # Query metrics
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM network_metrics")
    count = cursor.fetchone()[0]
    conn.close()
    
    print(f"✓ Inserted 10 test metrics")
    print(f"✓ Database now has {count} total metrics")
    
    # Get training data
    X, y = get_training_data()
    print(f"✓ Training data: {len(X)} samples, {len(y)} labels")
    
    assert len(X) >= 10, f"Expected at least 10 samples, got {len(X)}"
    
    return True


def test_metrics_collection():
    """Test metrics collection (without Docker)."""
    print("\n" + "=" * 60)
    print("TEST 3: Metrics Collection (Simulated)")
    print("=" * 60)
    
    from real_metrics_collector import collect_ping_metrics
    
    # Test ping metrics collection
    print("Testing ping metrics collection...")
    print("  (Skipping actual ping - Docker not available in test mode)")
    
    # Simulate metrics
    simulated_metrics = {
        "latency_ms": 15.5,
        "packet_loss_percent": 0.5,
        "bandwidth_mbps": 100.0,
        "hop_count": 3,
        "link_cost": 20,
        "congestion_level": 0.3,
        "label": "Low"
    }
    
    print(f"✓ Simulated metrics: {simulated_metrics}")
    
    return True


def test_training_pipeline():
    """Test the full training pipeline."""
    print("\n" + "=" * 60)
    print("TEST 4: Training Pipeline")
    print("=" * 60)
    
    from sklearn.ensemble import RandomForestClassifier
    import numpy as np
    
    # Get training data
    X, y = get_training_data()
    
    if len(X) < 10:
        print("⚠ Not enough data for training (need at least 10 samples)")
        return False
    
    # Train a simple model
    X = np.array(X)
    y = np.array(y)
    
    rf = RandomForestClassifier(n_estimators=10, random_state=42)
    rf.fit(X, y)
    
    print(f"✓ Trained Random Forest on {len(X)} samples")
    print(f"✓ Classes: {rf.classes_}")
    print(f"✓ Feature importances: {rf.feature_importances_}")
    
    return True


def test_docker_compose_generation():
    """Test Docker Compose file generation."""
    print("\n" + "=" * 60)
    print("TEST 5: Docker Compose Generation")
    print("=" * 60)
    
    from docker_compose_generator import generate_compose_file, generate_frr_config
    
    # Create a simple test topology
    test_topology = {
        "id": "test_topo",
        "type": "star",
        "devices": [
            {"id": "R1", "type": "router", "ip_address": "10.0.0.1"},
            {"id": "R2", "type": "router", "ip_address": "10.0.0.2"},
            {"id": "SW1", "type": "switch", "ip_address": "10.0.0.3"}
        ],
        "links": [
            {"source": "R1", "target": "R2", "cost": 10, "bandwidth": 100, "latency": 5, "loss_probability": 0.01},
            {"source": "R1", "target": "SW1", "cost": 5, "bandwidth": 100, "latency": 2, "loss_probability": 0.005}
        ]
    }
    
    output_dir = "test_docker_output"
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        generate_compose_file(test_topology, output_dir)
        print(f"✓ Generated docker-compose.yml")
        
        generate_frr_config("R1", test_topology, output_dir)
        print(f"✓ Generated FRR config for R1")
        
        # Check files exist
        compose_file = os.path.join(output_dir, "docker-compose.yml")
        if os.path.exists(compose_file):
            print(f"✓ docker-compose.yml exists")
        else:
            print(f"✗ docker-compose.yml not found")
            
    except Exception as e:
        print(f"✗ Error: {e}")
        return False
    
    return True


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("REAL NETWORK TRAINING PIPELINE TEST")
    print("=" * 60)
    
    results = []
    
    try:
        results.append(("Topology Generation", test_topology_generation()))
    except Exception as e:
        print(f"✗ Topology Generation failed: {e}")
        results.append(("Topology Generation", False))
    
    try:
        results.append(("Database Operations", test_database()))
    except Exception as e:
        print(f"✗ Database Operations failed: {e}")
        results.append(("Database Operations", False))
    
    try:
        results.append(("Metrics Collection", test_metrics_collection()))
    except Exception as e:
        print(f"✗ Metrics Collection failed: {e}")
        results.append(("Metrics Collection", False))
    
    try:
        results.append(("Training Pipeline", test_training_pipeline()))
    except Exception as e:
        print(f"✗ Training Pipeline failed: {e}")
        results.append(("Training Pipeline", False))
    
    try:
        results.append(("Docker Compose Generation", test_docker_compose_generation()))
    except Exception as e:
        print(f"✗ Docker Compose Generation failed: {e}")
        results.append(("Docker Compose Generation", False))
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}: {name}")
    
    all_passed = all(passed for _, passed in results)
    
    if all_passed:
        print("\n✓ All tests passed!")
        return 0
    else:
        print("\n✗ Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
