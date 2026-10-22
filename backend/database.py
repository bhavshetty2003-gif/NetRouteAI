"""SQLite persistence for training data and measured observations.

The `network_metrics` table is the Random Forest training set. Its `origin`
column distinguishes rows that came from real measurements in the Docker/FRR lab
(`origin='measured'`) from the synthetic bootstrap rows (`origin='synthetic'`),
so the API can report how much of the training set is grounded in real data.
"""

import os
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "training_data.db")

# Congestion classes the Random Forest predicts.
LABELS = ("Low", "Medium", "High")


def get_db():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables and seed the synthetic bootstrap set when empty."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS network_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            latency_ms REAL NOT NULL,
            packet_loss_percent REAL NOT NULL,
            bandwidth_mbps REAL NOT NULL,
            hop_count INTEGER NOT NULL,
            link_cost INTEGER NOT NULL,
            congestion_level REAL NOT NULL,
            label TEXT NOT NULL,
            topology_id TEXT,
            topology_type TEXT,
            origin TEXT NOT NULL DEFAULT 'synthetic'
        )
    """)

    # Migrations for databases created before these columns existed
    existing = {r["name"] for r in cursor.execute("PRAGMA table_info(network_metrics)")}
    for column, ddl in (
        ("origin", "ALTER TABLE network_metrics ADD COLUMN origin TEXT NOT NULL DEFAULT 'synthetic'"),
        ("topology_type", "ALTER TABLE network_metrics ADD COLUMN topology_type TEXT"),
        ("topology_id", "ALTER TABLE network_metrics ADD COLUMN topology_id TEXT"),
    ):
        if column not in existing:
            cursor.execute(ddl)

    # The routing_samples table held one row per modelled route the designer
    # asked for. Those routes were computed on the canvas, not measured, and
    # the endpoint that read them was never called by the UI, so the table was
    # written and never read. It goes with the endpoints.
    cursor.execute("DROP TABLE IF EXISTS training_samples")

    cursor.execute("SELECT COUNT(*) FROM network_metrics")
    if cursor.fetchone()[0] == 0:
        seed_training_data(cursor)

    conn.commit()
    conn.close()


def classify(latency_ms: float, packet_loss: float, congestion: float) -> str:
    """Assign the congestion class used as the Random Forest target."""
    if packet_loss > 5 or latency_ms > 100:
        return "High"
    if packet_loss > 2 or latency_ms > 50 or congestion > 0.7:
        return "Medium"
    return "Low"


def seed_training_data(cursor):
    """Seed a synthetic bootstrap set so the model is trainable from t=0."""
    import random

    # The class is chosen first, then features are sampled *conditionally* on
    # it. Sampling features first and labelling them afterwards produced 75%
    # "High" rows, which taught the model that any realistic link is congested
    # and made the Random Forest's congestion term useless for route ranking.
    # Ranges are log-scaled at the low end because a real LAN hop in the lab
    # measures ~0.1 ms with 0% loss, not the 1-200 ms an earlier revision used.
    bands = {
        "Low":    {"latency": (0.05, 5.0),  "loss": (0.0, 0.5),  "congestion": (0.0, 0.3)},
        "Medium": {"latency": (20.0, 60.0), "loss": (2.0, 3.5),  "congestion": (0.5, 0.8)},
        "High":   {"latency": (100.0, 200.0), "loss": (5.0, 10.0), "congestion": (0.85, 1.0)},
    }

    samples = []
    for label, band in bands.items():
        for _ in range(200):
            latency = round(random.uniform(*band["latency"]), 4)
            packet_loss = round(random.uniform(*band["loss"]), 4)
            congestion = round(random.uniform(*band["congestion"]), 4)
            samples.append(
                (
                    datetime.now().isoformat(),
                    latency,
                    packet_loss,
                    random.uniform(10, 1000),
                    random.randint(1, 10),
                    random.randint(1, 100),
                    congestion,
                    label,
                )
            )

    cursor.executemany("""
        INSERT INTO network_metrics
        (timestamp, latency_ms, packet_loss_percent, bandwidth_mbps, hop_count,
         link_cost, congestion_level, label, origin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synthetic')
    """, samples)


def get_training_data(origin: str | None = None):
    """Get the Random Forest training set.

    Returns (X, y) where each X row is
    [latency_ms, packet_loss_percent, bandwidth_mbps, hop_count, link_cost,
    congestion_level] -- the column order extract_path_features() must produce.
    """
    conn = get_db()
    query = """
        SELECT latency_ms, packet_loss_percent, bandwidth_mbps, hop_count,
               link_cost, congestion_level, label
        FROM network_metrics
    """
    params: tuple = ()
    if origin:
        query += " WHERE origin = ?"
        params = (origin,)
    rows = conn.execute(query, params).fetchall()
    conn.close()

    return [list(r[:6]) for r in rows], [r[6] for r in rows]


def insert_network_metrics(
    latency, packet_loss, bandwidth, hop_count, link_cost, congestion, label,
    topology_id=None, topology_type=None, origin="measured",
):
    """Insert a single metrics record (measured or synthetic)."""
    conn = get_db()
    conn.execute("""
        INSERT INTO network_metrics
        (timestamp, latency_ms, packet_loss_percent, bandwidth_mbps, hop_count,
         link_cost, congestion_level, label, topology_id, topology_type, origin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now().isoformat(),
        latency, packet_loss, bandwidth, hop_count, link_cost, congestion, label,
        topology_id, topology_type, origin,
    ))
    conn.commit()
    conn.close()


def record_measurement(measurement: dict, topology_type: str = "lab") -> None:
    """Store one real measurement from the running lab as a training row.

    A row without a throughput number is refused rather than written with a
    placeholder. The Random Forest is handed two constant columns and learns
    nothing from them, so a "measured" row carrying 1000 Mbps on every line is
    worse than no row at all.
    """
    bandwidth = measurement.get("bandwidth_mbps")
    if bandwidth is None:
        return
    insert_network_metrics(
        latency=measurement["latency_ms"],
        packet_loss=measurement["packet_loss_percent"],
        bandwidth=bandwidth,
        hop_count=measurement.get("hop_count") or 1,
        link_cost=int(measurement.get("total_cost", 1)),
        congestion=measurement.get("congestion_level", 0.0),
        label=classify(
            measurement["latency_ms"],
            measurement["packet_loss_percent"],
            measurement.get("congestion_level", 0.0),
        ),
        topology_id=measurement.get("topology_id"),
        topology_type=topology_type,
        origin="measured",
    )


def dataset_stats() -> dict:
    """Summarise the training set for the UI."""
    conn = get_db()
    row = conn.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN origin = 'measured' THEN 1 ELSE 0 END) AS measured,
            SUM(CASE WHEN origin = 'synthetic' THEN 1 ELSE 0 END) AS synthetic
        FROM network_metrics
    """).fetchone()
    labels = conn.execute(
        "SELECT label, COUNT(*) AS n FROM network_metrics GROUP BY label"
    ).fetchall()
    conn.close()

    total = row["total"] or 0
    return {
        "total": total,
        "measured": row["measured"] or 0,
        "synthetic": row["synthetic"] or 0,
        "measured_ratio": round((row["measured"] or 0) / total, 4) if total else 0.0,
        "labels": {r["label"]: r["n"] for r in labels},
        "ready_for_training": total >= 100,
    }
