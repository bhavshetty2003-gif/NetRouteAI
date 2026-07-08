import csv
import os
import subprocess
import re
import time
from datetime import datetime

CSV_FILE = "ai/data/network_metrics.csv"

os.makedirs("ai/data", exist_ok=True)


def ping_latency():
    cmd = [
        "docker",
        "exec",
        "mn.r1",
        "ping",
        "-c",
        "4",
        "10.0.2.10",
    ]

    output = subprocess.run(
        cmd,
        capture_output=True,
        text=True
    ).stdout

    latency = None
    loss = None

    m = re.search(r'=(.*?)/(.*?)/(.*?)/(.*?) ms', output)

    if m:
        latency = float(m.group(2))

    l = re.search(r'(\d+)% packet loss', output)

    if l:
        loss = float(l.group(1))

    return latency, loss


def bandwidth():
    cmd = [
        "docker",
        "exec",
        "mn.r1",
        "iperf3",
        "-c",
        "10.0.2.10",
        "-t",
        "2"
    ]

    output = subprocess.run(
        cmd,
        capture_output=True,
        text=True
    ).stdout

    bw = None

    m = re.search(r'([\d\.]+)\s+Mbits/sec', output)

    if m:
        bw = float(m.group(1))

    return bw


def save(metrics):

    file_exists = os.path.isfile(CSV_FILE)

    with open(CSV_FILE, "a", newline="") as f:

        writer = csv.DictWriter(
            f,
            fieldnames=metrics.keys()
        )

        if not file_exists:
            writer.writeheader()

        writer.writerow(metrics)


while True:

    latency, loss = ping_latency()

    bw = bandwidth()

    row = {
        "timestamp": datetime.now(),
        "latency": latency,
        "packet_loss": loss,
        "bandwidth": bw
    }

    save(row)

    print(row)

    time.sleep(5)
