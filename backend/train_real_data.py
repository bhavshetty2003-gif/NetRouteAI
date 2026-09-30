#!/usr/bin/env python3
"""
Real Network Training Data Generator

This script:
1. Generates 150 diverse network topologies
2. Creates Docker Compose files for FRR routing
3. Starts each topology in Docker
4. Collects real network metrics (latency, loss, bandwidth)
5. Trains the Random Forest model on real data
6. Saves everything to the database

Usage:
    python train_real_data.py --count 150 --output-dir generated_topologies
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from database import init_db, insert_network_metrics, get_db
from topology_generator import generate_topologies, save_topologies, load_topologies
from docker_compose_generator import generate_topology, start_topology, stop_topology, collect_metrics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def collect_metrics_for_topology(topology, topology_dir):
    """Collect real metrics from a running topology."""
    topology_id = topology['id']
    
    try:
        # Start the topology
        logger.info(f"Starting topology {topology_id}...")
        start_topology(topology_id)
        
        # Wait for OSPF convergence
        logger.info(f"Waiting for OSPF convergence in {topology_id}...")
        time.sleep(15)  # Give OSPF time to converge
        
        # Collect metrics
        logger.info(f"Collecting metrics from {topology_id}...")
        metrics = collect_metrics(topology_id)
        
        if metrics:
            logger.info(f"Collected metrics from {topology_id}: {metrics}")
            return metrics
        else:
            logger.warning(f"No metrics collected from {topology_id}")
            return None
            
    except Exception as e:
        logger.error(f"Error collecting metrics from {topology_id}: {e}")
        return None
        
    finally:
        # Always stop the topology
        try:
            stop_topology(topology_id)
        except Exception as e:
            logger.error(f"Error stopping topology {topology_id}: {e}")


def train_on_real_data(topologies, output_dir):
    """Train the Random Forest model on real network data."""
    from sklearn.ensemble import RandomForestClassifier
    import numpy as np
    
    # Collect all metrics
    all_metrics = []
    
    for i, topology in enumerate(topologies):
        logger.info(f"Processing topology {i+1}/{len(topologies)}: {topology['id']}")
        
        # Generate Docker files
        topology_dir = os.path.join(output_dir, topology['id'])
        os.makedirs(topology_dir, exist_ok=True)
        
        generate_topology(topology, topology_dir)
        
        # Collect real metrics
        metrics = collect_metrics_for_topology(topology, topology_dir)
        
        if metrics:
            all_metrics.append({
                'topology_id': topology['id'],
                'topology_type': topology.get('type', 'unknown'),
                'metrics': metrics
            })
            
            # Insert into database
            insert_network_metrics(
                latency=metrics.get('latency_ms', 0),
                packet_loss=metrics.get('packet_loss_percent', 0),
                bandwidth=metrics.get('bandwidth_mbps', 0),
                hop_count=metrics.get('hop_count', 0),
                link_cost=metrics.get('link_cost', 0),
                congestion=metrics.get('congestion_level', 0),
                label=metrics.get('label', 'Medium')
            )
    
    logger.info(f"Collected {len(all_metrics)} real metric samples")
    
    # Train Random Forest on real data
    if len(all_metrics) >= 10:
        logger.info("Training Random Forest on real data...")
        
        X = []
        y = []
        for sample in all_metrics:
            m = sample['metrics']
            X.append([
                m.get('latency_ms', 0),
                m.get('packet_loss_percent', 0),
                m.get('bandwidth_mbps', 0),
                m.get('hop_count', 0),
                m.get('link_cost', 0),
                m.get('congestion_level', 0)
            ])
            y.append(m.get('label', 'Medium'))
        
        rf = RandomForestClassifier(n_estimators=100, random_state=42)
        rf.fit(X, y)
        
        logger.info(f"Random Forest trained on {len(X)} samples")
        logger.info(f"Classes: {rf.classes_}")
        logger.info(f"Feature importances: {rf.feature_importances_}")
        
        return rf
    else:
        logger.warning("Not enough data to train Random Forest")
        return None


def main():
    parser = argparse.ArgumentParser(description='Generate real network training data')
    parser.add_argument('--count', type=int, default=150, help='Number of topologies to generate')
    parser.add_argument('--output-dir', default='generated_topologies', help='Output directory')
    parser.add_argument('--seed', type=int, default=42, help='Random seed')
    parser.add_argument('--skip-docker', action='store_true', help='Skip Docker operations (for testing)')
    
    args = parser.parse_args()
    
    # Initialize database
    logger.info("Initializing database...")
    init_db()
    
    # Generate topologies
    logger.info(f"Generating {args.count} topologies...")
    topologies = generate_topologies(count=args.count, seed=args.seed)
    
    # Save topologies
    save_topologies(topologies, args.output_dir)
    logger.info(f"Saved {len(topologies)} topologies to {args.output_dir}")
    
    if args.skip_docker:
        logger.info("Skipping Docker operations (--skip-docker flag)")
        return
    
    # Create output directory for Docker files
    docker_output_dir = os.path.join(args.output_dir, 'docker')
    os.makedirs(docker_output_dir, exist_ok=True)
    
    # Collect real metrics and train
    logger.info("Starting real metrics collection...")
    rf = train_on_real_data(topologies, docker_output_dir)
    
    if rf:
        logger.info("Training complete! Random Forest model is ready.")
    else:
        logger.warning("Training incomplete - not enough data collected.")


if __name__ == '__main__':
    main()
