import pandas as pd

df = pd.read_csv("ai/data/network_metrics_clean.csv")

def classify(row):
    if row["packet_loss_percent"] > 0:
        return "High"

    elif row["latency_ms"] > 15:
        return "Medium"

    elif row["bandwidth_mbps"] < 100:
        return "Medium"

    else:
        return "Low"

df["network_condition"] = df.apply(classify, axis=1)

df.to_csv(
    "ai/data/network_metrics_labeled.csv",
    index=False
)

print(df.head())

print("\nClass Distribution")
print(df["network_condition"].value_counts())