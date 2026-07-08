export const predictions = [
  {
    id: 1,
    router: "Router R1",
    confidence: 96,
    currentRoute: "R1 → R2 → PC1",
    aiRoute: "R1 → R3 → PC1",
    latencyReduction: "18%",
    status: "Recommended",
  },
  {
    id: 2,
    router: "Router R2",
    confidence: 91,
    currentRoute: "R2 → R1 → PC1",
    aiRoute: "R2 → R3 → PC1",
    latencyReduction: "12%",
    status: "Monitoring",
  },
  {
    id: 3,
    router: "Router R3",
    confidence: 98,
    currentRoute: "R3 → PC1",
    aiRoute: "R3 → PC1",
    latencyReduction: "0%",
    status: "Optimal",
  },
];