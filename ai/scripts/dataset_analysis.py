import pandas as pd

df = pd.read_csv("ai/data/network_metrics.csv")

print("=" * 50)
print("First 5 rows")
print(df.head())

print("\nDataset Shape")
print(df.shape)

print("\nColumns")
print(df.columns)

print("\nMissing Values")
print(df.isnull().sum())

print("\nStatistics")
print(df.describe())

print("\nData Types")
print(df.dtypes)