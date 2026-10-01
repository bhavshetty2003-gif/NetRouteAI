# How the AI Chooses a Better Route

The plain-language version of diagram 9 and diagram 13 in
[`ALGORITHM_FLOWCHARTS.md`](./ALGORITHM_FLOWCHARTS.md), written for a reader who
does not work with networks. The technical terms are kept where they are useful.

```mermaid
flowchart TD
    A["1. You draw a network<br/>routers + cables"] --> B["2. It is built for real<br/>actual routers in Docker containers,<br/>not a simulation"]
    B --> C["3. The system measures the real network<br/>it sends 12 real ping packets and reads<br/>real delay, loss and speed"]
    C --> D["4. The AI is trained on that reality<br/>the same routes are tested under calm conditions,<br/>and again under deliberately jammed ones.<br/>Without seeing both, it could never spot a jam."]
    D --> E["5. It lists every possible route<br/>from Source to Destination<br/>for example 4 different ways across the lab"]
    E --> F["6. For each route it reads six signs<br/>Delay, Speed, Dropped data, Cost,<br/>Number of hops, Traffic jam"]
    F --> G["7. The Random Forest scores each route<br/>using everything it learned in step 4"]
    G --> H["8. Each route gets a quality score 0 to 100<br/>a weighted mix of all six signs"]
    H --> I{"9. Highest score<br/>wins?"}
    I --> J["10. That path is installed on every router<br/>along the way, using Static Routes<br/>Static Routes override OSPF,<br/>so the routers genuinely forward it"]
    J --> K["11. The result is measured and traced<br/>hop by hop, to prove it was really used"]
    K --> L["12. These fresh measurements are saved<br/>as training data, so the model improves"]
    L -.->|"next comparison,<br/>the model is slightly wiser"| E

    style D fill:#eef7ee,stroke:#3d7a3d
    style J fill:#fdf0e6,stroke:#b5651d
```

## Why this makes routing better

OSPF always picks the **shortest** path — fewest hops, lowest cost. The AI picks the
**fastest and least jammed** path.

Those are often different routes. The gap only opens when traffic is heavy or a link
is faulty, which is exactly when a fixed rule has no way to react. Think of it as the
difference between following the shortest road on a map and asking someone who has
just driven the traffic.

## The three things that make it honest

**It works on measurements, not guesses.** Every number in the chain comes from a
command run inside a real router. The Random Forest contributes exactly one input —
how jammed a route is — and never invents a latency or a speed.

**It is installed on every router, not just the first one.** Pushing the route onto
the source router alone does not work: the second router then makes its own choice
for the rest of the journey. Every hop is pinned.

**It refuses to claim an improvement that is not there.** The AI can only change the
route when there is a genuine choice. On a simple network the two paths are often
identical, and the page says so rather than inventing a win. For the same reason, a
latency difference smaller than the measurement's own wobble is reported as a tie,
not as a percentage.

## Vocabulary

| Term | Plain meaning |
|------|---------------|
| **Router** | A machine that decides which path traffic takes |
| **OSPF** | The standard rule every network uses: always take the shortest path |
| **Random Forest** | A learner that averages many simple decisions into one judgement |
| **Static Route** | A route typed in by hand, which beats what OSPF would choose |
| **Latency** | How long data takes to arrive |
| **Bandwidth** | How much data can flow at once |
| **Packet loss** | Data that never arrived |
| **Congestion** | A queue of traffic backed up, like cars at a jam |
| **Hop** | One step from one router to the next |