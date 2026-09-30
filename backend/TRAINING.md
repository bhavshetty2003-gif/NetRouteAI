# Real Network Training Data Generator

This system generates real network training data by deploying FRR (Free Range Routing) in Docker containers and collecting genuine network metrics.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Training Pipeline                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Topology   │───▶│    Docker    │───▶│    Real      │      │
│  │  Generator   │    │   Compose    │    │   Metrics    │      │
│  │  (150 tops)  │    │  (FRR/OSPF)  │    │  Collector   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  generated_  │    │   docker_    │    │  training_   │      │
│  │  topologies/ │    │  topologies/ │    │  data.db     │      │
│  │  (JSON)      │    │  (FRR configs)│   │  (SQLite)    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                 │               │
│                                                 ▼               │
│                                        ┌──────────────┐        │
│                                        │   Random     │        │
│                                        │   Forest     │        │
│                                        │   Model      │        │
│                                        │  (rf_model   │        │
│                                        │   .pkl)      │        │
│                                        └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Topology Generator (`topology_generator.py`)

Generates 150 diverse network topologies:

| Topology Type | Count | Description |
|---------------|-------|-------------|
| Star | ~15 | Central router with spoke connections |
| Mesh | ~14 | Full or partial mesh connectivity |
| Ring | ~22 | Circular topology |
| Tree | ~13 | Hierarchical tree structure |
| Bus | ~14 | Shared backbone |
| Hybrid | ~9 | Mixed topology types |
| Enterprise | ~24 | Multi-area enterprise networks |
| Data Center | ~19 | Spine-leaf architectures |
| Campus | ~20 | Campus network designs |

Each topology includes:
- 3-15 routers
- 5-30 switches
- 10-50 PCs
- Realistic link parameters (cost, bandwidth, latency, loss)
- Private IP addressing (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)

### 2. Docker Compose Generator (`docker_compose_generator.py`)

Generates Docker Compose files for each topology:
- FRR containers for each router
- OSPF configuration
- Network isolation per topology
- Metrics collection scripts

### 3. Real Metrics Collector (`real_metrics_collector.py`)

Collects genuine network metrics from running containers:
- OSPF neighbor status
- Interface statistics
- Ping latency (min/avg/max/mdev)
- Packet loss percentage
- CPU and memory usage
- Routing table entries
- Link state database

### 4. Training Script (`train_model.py`)

Orchestrates the full training pipeline:
1. Loads topologies
2. Deploys each in Docker
3. Collects real metrics
4. Trains Random Forest classifier
5. Saves the trained model

## Usage

### Quick Start

```bash
cd backend

# Run the full training pipeline
./run_training.sh
```

### Step-by-Step

```bash
# 1. Generate topologies
python topology_generator.py --count 150 --output-dir generated_topologies --seed 42

# 2. Initialize database
python -c "from database import init_db; init_db()"

# 3. Train on real data (requires Docker)
python train_model.py --topologies-dir generated_topologies --output-dir docker_training

# 4. Check training status
sqlite3 training_data.db "SELECT COUNT(*) FROM network_metrics;"
sqlite3 training_data.db "SELECT * FROM network_metrics LIMIT 5;"
```

### API Endpoints

Once the backend is running:

```bash
# Start training (generates topologies and collects metrics)
curl -X POST http://localhost:8000/api/train/generate \
  -H "Content-Type: application/json" \
  -d '{"count": 150, "output_dir": "generated_topologies"}'

# Check training status
curl http://localhost:8000/api/train/status

# Get training samples
curl http://localhost:8000/api/train/samples
```

## Database Schema

### `network_metrics` table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| timestamp | TEXT | Collection time |
| latency_ms | REAL | Measured latency |
| packet_loss_percent | REAL | Measured packet loss |
| bandwidth_mbps | REAL | Link bandwidth |
| hop_count | INTEGER | Number of hops |
| link_cost | INTEGER | OSPF cost |
| congestion_level | REAL | Calculated congestion |
| label | TEXT | Low/Medium/High |
| topology_id | TEXT | Source topology |
| topology_type | TEXT | Topology type |

### `training_samples` table
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| topology_id | TEXT | Source topology |
| source | TEXT | Source device |
| destination | TEXT | Destination device |
| path | TEXT | Computed path |
| algorithm | TEXT | dijkstra/random_forest |
| latency_ms | REAL | Path latency |
| bandwidth_mbps | REAL | Path bandwidth |
| packet_loss_percent | REAL | Path packet loss |
| hop_count | INTEGER | Path hops |
| convergence_time_ms | REAL | Convergence time |
| throughput_mbps | REAL | Throughput |
| timestamp | TEXT | Creation time |

## Requirements

- Python 3.9+
- Docker
- Docker Compose
- Python packages: `docker`, `scikit-learn`, `networkx`, `numpy`

## Output

After training completes:
- `generated_topologies/` - 150 topology JSON files
- `docker_training/` - Docker Compose files and collected metrics
- `training_data.db` - SQLite database with real metrics
- `models/rf_model.pkl` - Trained Random Forest model

## Troubleshooting

### Docker not running
```bash
sudo systemctl start docker
```

### FRR containers not converging
- Check OSPF configuration
- Verify network connectivity between containers
- Increase wait time in `train_model.py`

### Not enough training data
- Increase topology count: `--count 200`
- Check Docker logs: `docker logs <container_name>`
- Verify metrics collection: `cat docker_training/*/metrics.json`
