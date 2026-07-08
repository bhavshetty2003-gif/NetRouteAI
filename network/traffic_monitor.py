#!/usr/bin/env python3

import csv
import os
import time
from datetime import datetime


class TrafficMonitor:

    def __init__(self, net):
        self.net = net
        self.csv_file = "ai/data/network_metrics.csv"

        os.makedirs("ai/data", exist_ok=True)

    def get_latency(self):
        h1 = self.net.get("h1")

        out = h1.cmd("ping -c 4 10.0.2.10")

        print("\n===== PING OUTPUT =====")
        print(out)

        latency = None
        packet_loss = 100.0

        for line in out.splitlines():

            if "packet loss" in line:
                try:
                    packet_loss = float(
                        line.split("%")[0].split()[-1]
                    )
                except:
                    packet_loss = 100.0

            if "min/avg/max" in line:
                try:
                    latency = float(
                        line.split("=")[1].split("/")[1]
                    )
                except:
                    latency = None

        return latency, packet_loss

    def get_bandwidth(self):
        h1 = self.net.get("h1")
        h2 = self.net.get("h2")

        # Kill old server
        h2.cmd("pkill -9 iperf3")

        # Start fresh server
        h2.cmd("iperf3 -s -D")

        # Give server time to start
        time.sleep(2)

        out = h1.cmd("iperf3 -c 10.0.2.10 -t 3")

        print("\n===== IPERF OUTPUT =====")
        print(out)

        bandwidth = None

        for line in out.splitlines():

            print("LINE:", line)

            if "sender" in line:

                parts = line.split()

                for i, item in enumerate(parts):

                    if item.endswith("bits/sec"):
                        try:
                            bandwidth = float(parts[i - 1])
                            break
                        except:
                            pass

        return bandwidth

    def save_metrics(self):

        latency, loss = self.get_latency()
        bandwidth = self.get_bandwidth()

        data = {
            "timestamp": datetime.now(),
            "latency": latency,
            "packet_loss": loss,
            "bandwidth": bandwidth,
        }

        file_exists = os.path.isfile(self.csv_file)

        with open(self.csv_file, "a", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=data.keys()
            )

            if not file_exists:
                writer.writeheader()

            writer.writerow(data)

        print("\n===== SAVED METRICS =====")
        print(data)

    def run(self):

        print("*** Waiting 30 seconds for routing convergence...")
        time.sleep(30)

        while True:
            self.save_metrics()
            time.sleep(10)
            