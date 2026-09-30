#!/bin/bash
# Real Network Training Data Generator
# This script generates 150 topologies, deploys them with FRR/Docker,
# collects real metrics, and trains the Random Forest model.

set -e

echo "=========================================="
echo "Real Network Training Data Generator"
echo "=========================================="

# Step 1: Generate topologies
echo ""
echo "Step 1: Generating 150 network topologies..."
python topology_generator.py --count 150 --output-dir generated_topologies --seed 42

# Step 2: Initialize database
echo ""
echo "Step 2: Initializing database..."
python -c "from database import init_db; init_db()"

# Step 3: Collect real metrics from Docker/FRR
echo ""
echo "Step 3: Collecting real metrics from Docker/FRR..."
echo "This will start FRR containers, measure latency/loss, and collect metrics."
echo "This may take 30-60 minutes depending on your system."
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not running."
    echo "Please install Docker and try again."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "ERROR: Docker daemon is not running."
    echo "Please start Docker and try again."
    exit 1
fi

# Run training
python train_model.py --topologies-dir generated_topologies --output-dir docker_training --model-path models/rf_model.pkl

echo ""
echo "=========================================="
echo "Training Complete!"
echo "=========================================="
echo ""
echo "You can now use the trained model for routing."
echo "The model is saved at: models/rf_model.pkl"
echo ""
echo "To verify the training data:"
echo "  sqlite3 training_data.db 'SELECT COUNT(*) FROM network_metrics;'"
echo "  sqlite3 training_data.db 'SELECT * FROM network_metrics LIMIT 5;'"
