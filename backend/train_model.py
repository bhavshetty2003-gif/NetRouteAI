#!/usr/bin/env python3
"""
Train Random Forest model on real network data collected from Docker/FRR.

This script:
1. Loads topologies from generated_topologies/
2. For each topology, generates Docker Compose files
3. Starts FRR containers
4. Collects real metrics (latency, loss, bandwidth)
5. Trains Random Forest on collected data
6. Saves the trained model

Usage:
    python train_model.py --topologies-dir generated_topologies --model-path rf_model.pkl
"""

import argparse
import json
import logging
import os
import pickle
import sys
import time
from datetime import datetime
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from database import init_db, insert_network_metrics, get_db
from topology_generator import load_topologies
from docker_compose_generator import generate_topology, start_topology, stop_topology, collect_metrics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def collect_real_metrics(topologies, output_dir):
    """Collect real metrics from Docker containers for each topology."""
    all_metrics = []
    
    for i, topology in enumerate(topologies):
        topology_id = topology['id']
        logger.info(f"[{i+1}/{len(topologies)}] Processing topology {topology_id} (type: {topology.get('type', 'unknown')})")
        
        try:
            # Generate Docker files
            topology_dir = os.path.join(output_dir, topology_id)
            os.makedirs(topology_dir, exist_ok=True)
            generate_topology(topology, topology_dir)
            
            # Start containers
            logger.info(f"  Starting FRR containers...")
            start_topology(topology_id)
            
            # Wait for OSPF convergence
            logger.info(f"  Waiting for OSPF convergence (15s)...")
            time.sleep(15)
            
            # Collect metrics
            logger.info(f"  Collecting metrics...")
            metrics = collect_metrics(topology_id)
            
            if metrics:
                metrics['topology_id'] = topology_id
                metrics['topology_type'] = topology.get('type', 'unknown')
                all_metrics.append(metrics)
                
                # Save to database
                insert_network_metrics(
                    latency=metrics.get('latency_ms', 0),
                    packet_loss=metrics.get('packet_loss_percent', 0),
                    bandwidth=metrics.get('bandwidth_mbps', 0),
                    hop_count=metrics.get('hop_count', 0),
                    link_cost=metrics.get('link_cost', 0),
                    congestion=metrics.get('congestion_level', 0),
                    label=metrics.get('label', 'Medium')
                )
                
                logger.info(f"  ✓ Metrics: latency={metrics.get('latency_ms', 0):.1f}ms, "
                          f"loss={metrics.get('packet_loss_percent', 0):.2f}%, "
                          f"bw={metrics.get('bandwidth_mbps', 0):.0f}Mbps")
            else:
                logger.warning(f"  ✗ No metrics collected")
                
        except Exception as e:
            logger.error(f"  ✗ Error: {e}")
            
        finally:
            # Always stop containers
            try:
                stop_topology(topology_id)
            except Exception as e:
                logger.error(f"  ✗ Error stopping: {e}")
    
    return all_metrics


def train_random_forest(metrics_data):
    """Train Random Forest classifier on collected metrics."""
    if len(metrics_data) < 10:
        logger.warning(f"Only {len(metrics_data)} samples - need at least 10 for training")
        return None
    
    # Prepare features and labels
    X = []
    y = []
    
    for m in metrics_data:
        X.append([
            m.get('latency_ms', 0),
            m.get('packet_loss_percent', 0),
            m.get('bandwidth_mbps', 0),
            m.get('hop_count', 0),
            m.get('link_cost', 0),
            m.get('congestion_level', 0)
        ])
        y.append(m.get('label', 'Medium'))
    
    X = np.array(X)
    y = np.array(y)
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Train model
    logger.info(f"Training Random Forest on {len(X_train)} samples...")
    rf = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=10)
    rf.fit(X_train, y_train)
    
    # Evaluate
    y_pred = rf.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    
    logger.info(f"Model accuracy: {accuracy:.2%}")
    logger.info(f"Classification report:\n{classification_report(y_test, y_pred)}")
    logger.info(f"Feature importances:")
    feature_names = ['latency', 'packet_loss', 'bandwidth', 'hop_count', 'link_cost', 'congestion']
    for name, importance in zip(feature_names, rf.feature_importances_):
        logger.info(f"  {name}: {importance:.3f}")
    
    return rf


def main():
    parser = argparse.ArgumentParser(description='Train Random Forest on real network data')
    parser.add_argument('--topologies-dir', default='generated_topologies', help='Directory with topology JSON files')
    parser.add_argument('--output-dir', default='docker_training', help='Output directory for Docker files')
    parser.add_argument('--model-path', default='rf_model.pkl', help='Path to save trained model')
    parser.add_argument('--skip-docker', action='store_true', help='Skip Docker operations (use existing DB data)')
    
    args = parser.parse_args()
    
    # Initialize database
    logger.info("Initializing database...")
    init_db()
    
    # Load topologies
    topologies = load_topologies(args.topologies_dir)
    logger.info(f"Loaded {len(topologies)} topologies")
    
    if not args.skip_docker:
        # Create output directory
        os.makedirs(args.output_dir, exist_ok=True)
        
        # Collect real metrics
        logger.info("=" * 60)
        logger.info("COLLECTING REAL METRICS FROM DOCKER/FRR")
        logger.info("=" * 60)
        
        metrics_data = collect_real_metrics(topologies, args.output_dir)
        
        logger.info(f"\nCollected {len(metrics_data)} real metric samples")
        
        # Save metrics to JSON
        metrics_file = os.path.join(args.output_dir, 'collected_metrics.json')
        with open(metrics_file, 'w') as f:
            json.dump(metrics_data, f, indent=2)
        logger.info(f"Saved metrics to {metrics_file}")
    else:
        # Load from database
        logger.info("Loading metrics from database...")
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM network_metrics WHERE topology_id IS NOT NULL")
        rows = cursor.fetchall()
        conn.close()
        
        metrics_data = []
        for row in rows:
            metrics_data.append({
                'latency_ms': row['latency_ms'],
                'packet_loss_percent': row['packet_loss_percent'],
                'bandwidth_mbps': row['bandwidth_mbps'],
                'hop_count': row['hop_count'],
                'link_cost': row['link_cost'],
                'congestion_level': row['congestion_level'],
                'label': row['label'],
                'topology_id': row['topology_id'],
                'topology_type': row['topology_type']
            })
        
        logger.info(f"Loaded {len(metrics_data)} samples from database")
    
    # Train model
    logger.info("\n" + "=" * 60)
    logger.info("TRAINING RANDOM FOREST MODEL")
    logger.info("=" * 60)
    
    rf = train_random_forest(metrics_data)
    
    if rf:
        # Save model
        with open(args.model_path, 'wb') as f:
            pickle.dump(rf, f)
        logger.info(f"\n✓ Model saved to {args.model_path}")
        
        # Also save to backend/models directory
        models_dir = os.path.join(os.path.dirname(__file__), 'models')
        os.makedirs(models_dir, exist_ok=True)
        model_path = os.path.join(models_dir, 'rf_model.pkl')
        with open(model_path, 'wb') as f:
            pickle.dump(rf, f)
        logger.info(f"✓ Model also saved to {model_path}")
    else:
        logger.warning("\n✗ Model training failed - not enough data")


if __name__ == '__main__':
    main()
