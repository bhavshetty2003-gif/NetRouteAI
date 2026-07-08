import csv
import os
import subprocess
import re
from datetime import datetime

CSV_FILE = "ai/data/network_metrics.csv"
os.makedirs("ai/data", exist_ok=True)


def get_ping_metrics(host="10.0.2.10"):
    result = subprocess.run(
        ["ping", "-c", "4", host],
        capture_output=True,
        text=True
    )

    output = result.stdout

    latency = None
    packet_loss = None

    loss = re.search(r'(\d+)% packet loss', output)
    if loss:
        packet_loss = float(loss.group(1))

    avg = re.search(r'=\s[\d.]+/([\d.]+)/', output)
    if avg:
        latency = float(avg.group(1))

    return latency, packet_loss


def log_metrics():
    latency, packet_loss = get_ping_metrics()

    row = {
        "timestamp": datetime.now(),
        "latency": latency,
        "packet_loss": packet_loss
    }

    file_exists = os.path.isfile(CSV_FILE)

    with open(CSV_FILE, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=row.keys())

        if not file_exists:
            writer.writeheader()

        writer.writerow(row)

    print(row)


if __name__ == "__main__":
    log_metrics()
    