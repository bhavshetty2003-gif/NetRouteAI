import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("ai/data/network_metrics.csv")

# Rename columns to simpler names
df.rename(columns={
    "latency_ms": "latency",
    "packet_loss_percent": "packet_loss",
    "bandwidth_mbps": "bandwidth"
}, inplace=True)

print(df.columns)

plt.figure(figsize=(10,5))
plt.plot(df["latency"])
plt.title("Latency")
plt.xlabel("Samples")
plt.ylabel("Latency (ms)")
plt.grid()

plt.savefig("ai/output/latency.png")
plt.show()

plt.figure(figsize=(10,5))
plt.plot(df["bandwidth"])
plt.title("Bandwidth")
plt.xlabel("Samples")
plt.ylabel("Mbps")
plt.grid()

plt.savefig("ai/output/bandwidth.png")
plt.show()

plt.figure(figsize=(10,5))
plt.plot(df["packet_loss"])
plt.title("Packet Loss")
plt.xlabel("Samples")
plt.ylabel("%")
plt.grid()

plt.savefig("ai/output/packet_loss.png")
plt.show()