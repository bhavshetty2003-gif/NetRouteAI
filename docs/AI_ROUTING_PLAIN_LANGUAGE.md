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

---

# Part 2 — How the Random Forest itself works

Step 7 above, opened up. A Random Forest is a crowd of simple decision-makers, and
the crowd is the point.

```mermaid
flowchart TD
    A["1. Collect training examples<br/>each one is a route that was really measured:<br/>its six signs, plus the answer<br/>'how jammed was it?' Low / Medium / High"] --> B["2. Deal the examples out at random<br/>so no single tree sees the same set<br/>as any other"]
    B --> C["3. Grow the first tree<br/>it asks one yes/no question at a time:<br/>'delay over 50ms?'<br/>'more than 2% of packets lost?'<br/>and keeps going until it reaches an answer"]
    C --> D["4. Repeat until there are 100 trees<br/>each sees a different random sample<br/>of the examples, and questions itself<br/>about a different random mix of the signs"]
    D --> E["5. Every tree casts one vote:<br/>Low, Medium or High"]
    E --> F{"6. Count the votes<br/>into percentages"}
    F --> G["7. The answer is not one guess<br/>but a spread. For example:<br/>60% Low, 30% Medium, 10% High"]
    G --> H["8. Turn the spread into one number.<br/>Low earns full marks, Medium half, High none:<br/>0.60 x 1.0 + 0.30 x 0.5 + 0.10 x 0<br/>= 0.75 out of 1"]
    H --> I["9. That single number becomes the<br/>'traffic jam' reading for this route"]
    I --> J["10. It is one input out of six,<br/>worth 30% of the route's final score.<br/>The other five come from live measurements."]
    J --> K["11. More real training examples<br/>make the vote sharper,<br/>so the model keeps improving"]
    K -.->|"new measurements<br/>feed back in"| A

    style D fill:#eef7ee,stroke:#3d7a3d
    style H fill:#fdf0e6,stroke:#b5651d
```

## Why a crowd of trees instead of one smart model

A single tree trained on every example is brittle: it finds one set of rules that
fits the training data, and if those rules are slightly wrong it is confidently
wrong everywhere.

Each tree here sees a **different random sample** of the examples, so each one is
slightly wrong in a different way. Averaging 100 of them cancels most of those
mistakes out. The analogy that fits: one doctor reading one file is fallible; a panel
of 100 doctors each having seen a different subset of the file is much harder to
fool.

This is also why step 1 insists on measuring under calm *and* jammed conditions. A
forest trained only on healthy routes has never seen the thing it is being asked to
detect, so all 100 trees would vote the same wrong answer.

## What the model is and is not allowed to do

| | |
|---|---|
| **It contributes** | One number: how jammed this route looks, from 0 (clear) to 1 (bad) |
| **It is worth** | 30% of the final route score |
| **It never does** | Produce a latency, a speed, a loss figure or a hop count |

Every displayed measurement is read from a real router by a real command. The forest
only supplies an opinion about congestion — it does not get to invent a number that
ends up on the page.

**And if it has never been trained?** When the database holds no measured examples
yet, the code falls back to a plain heuristic and the page labels the model
**`heuristic`** rather than presenting it as a trained AI. The distinction is shown
in the UI, not hidden.

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