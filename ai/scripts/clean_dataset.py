import pandas as pd

df = pd.read_csv("ai/data/network_metrics.csv")

print("Original rows:", len(df))

df = df.dropna()

df = df[
    (df["latency_ms"] > 0) &
    (df["bandwidth_mbps"] > 0)
]

print("Remaining rows:", len(df))

df.to_csv("ai/data/network_metrics_clean.csv", index=False)

print("Saved cleaned dataset.")