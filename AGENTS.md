# AGENTS.md

## Project Layout

Multi-package monorepo — each subproject has its own dependency manifest:

| Directory | Purpose |
|-----------|---------|
| `frontend/` | React + Vite + TypeScript topology designer + live analytics UI |
| `backend/` | FastAPI backend — lab metrics collection, routing, analytics, Docker/FRR generation, RF training pipeline |
| `ai/` | DQN reinforcement-learning routing model (stable-baselines3, gymnasium) — **not** used by the analytics page |
| `network/` | Mininet topology scripts (`topologies/*.py`; `run.sh` is empty) |
| `enterprise-ospf-lab/` | Pre-built 12-router multi-area OSPF lab — the live measurement target |
| `ospf-lab/` | 8-router OSPF lab |
| `shortest-path-demo/` | 5-router shortest-path demo |
| `scripts/` | Maintenance utilities (`migrate_theme.py`, `audit_contrast.py`) |

Root `README.md` and `requirements.txt` are intentionally empty. `tests/`, `docs/`, and `database/` are empty placeholders.

## Commands

### Frontend (`frontend/`)

```bash
npm install
npm run dev        # port 3000
npm run lint       # tsc --noEmit (no test suite exists)
npm run build
```

### Backend (`backend/`)

```bash
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
python test_training.py   # verify training pipeline (no Docker needed)
```

### Live lab (required for the analytics page)

```bash
cd enterprise-ospf-lab && docker compose up -d
```

The backend discovers this lab dynamically; there is no hardcoded topology.

### AI (`ai/`)

```bash
pip install -r ai/requirements.txt
python -m ai.training.train_dqn   # trains and saves ai/models/dqn_router.zip
python ai/predict.py
```

`ai/train_model.py` is a standalone quick-training script (5000 timesteps); `ai/training/train_dqn.py` is the module equivalent.

### Other network labs

```bash
cd ospf-lab && docker compose up -d
cd shortest-path-demo && docker compose up -d
```

### Maintenance scripts

```bash
python3 scripts/audit_contrast.py   # WCAG check of every design-token pairing; non-zero exit on failure
```

## API Endpoints

### Live lab measurement (Docker/FRR)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/lab/status` | Discovered devices, links, OSPF cost histogram |
| POST | `/api/lab/measure` | `ping` + `traceroute` between two devices |
| POST | `/api/lab/bandwidth` | Achieved throughput from `/proc/net/dev` counter deltas |
| POST | `/api/lab/impair` | `tc` netem/tbf injection (delay, loss, jitter, corrupt, rate limit) |
| POST | `/api/lab/link` | `ip link set dev … down/up` for link failure |
| POST | `/api/lab/traffic` | Start/stop a detached `ping` loop so interface counters actually move |
| GET | `/api/lab/traffic` | Which devices are currently generating traffic |
| GET | `/api/lab/ospf/areas` | Per-interface OSPF area (from `show ip ospf interface`) + ABR roles |
| POST | `/api/lab/ospf/area` | Preview (required first) or apply an interface area change |
| POST | `/api/lab/convergence` | Timed link-failure recovery measurement |
| GET | `/api/lab/reachability` | Parallel reachability sweep across pairs |
| GET | `/api/lab/metrics` | Combined interface + resource snapshot |
| POST | `/api/analytics/live` | OSPF / AI / Dijkstra comparison + traced `path_taken` for one pair |
| POST | `/api/lab/route` | Put a routing method's path in effect (or revert to OSPF) |
| GET | `/api/lab/routes` | Static routes currently installed on a router |
| POST | `/api/dataset/collect` | Measure every pair under varied conditions, store real RF rows |
| GET | `/api/dataset` | Row counts, measured/synthetic split, class balance |

### Topology and routing

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/upload-topology` | Upload a designed topology (used by the frontend) |
| POST | `/api/topology/create` | Create and store a topology |
| POST | `/api/routing/recommend` | AI path ranking with `path_ranking` + confidence |
| POST | `/api/routing/dijkstra` | Shortest path via Dijkstra's algorithm (OSPF) |
| POST | `/api/routing/random-forest` | ML-based path selection (Random Forest) |
| POST | `/api/simulation/send-packets` | Packet-level simulation |
| POST | `/api/analytics/compare` | Compare Dijkstra vs Random Forest |
| GET | `/api/train/samples` | Recent routing samples recorded by the designer's routing endpoints |

## Frontend Architecture

The designer canvas (route discovery, packet animation) still runs client-side via BFS graph traversal in `src/utils/networkRouting.ts`, and the topology persists to localStorage key `netrouteai_topology_v1`.

**The Analytics view is fully backend-driven.** `components/views/AnalyticsView.tsx` takes no props and reads everything over `src/utils/api.ts` from `/api/lab/status`, `/api/analytics/live`, `/api/lab/reachability`, `/api/lab/route`, `/api/dataset`, and `/api/lab/bandwidth`. It shows loading, lab-offline, error, and unreachable-diagnosis states. Every displayed number is measured; the "How these numbers were produced" panel prints the actual commands. It carries a routing-method selector (OSPF / AI / Dijkstra) with an "Apply to lab" action that installs static routes, a hop-by-hop table of the traced packet path, and a reachability hint under each source/destination select.

**Dead code — do not build on it:** `ai/` DQN model is not referenced by any backend endpoint; `backend/generated/` is generator output only.

## Non-Obvious Facts

- **The analytics page must never show a hardcoded value.** Every figure traces back to a command run inside a lab container. `scripts/audit_contrast.py` guards the colour side; measurement provenance is printed in the UI itself.
- **The routing-method selector changes the data plane, it does not relabel a column.** `POST /api/lab/route` installs a static route **per hop** (not just on the source) and static routes beat OSPF, so FRR really forwards the chosen path. Pinning only the source was tried and is insufficient: R1→R2 gave `R1→R2→R3→R12→R11` because R2's own OSPF still chose its own way onward.
- **The "OSPF path" is read from each router's OSPF RIB** (`show ip route ospf`, longest-prefix walk), not from traceroute. Reading it from traceroute is circular once the lab is steered, because a static route makes traceroute report the AI path back as "the OSPF path". Traceroute is kept separately as `path_taken` — the ground truth for what is actually being forwarded.
- **`vtysh -c "configure terminal" -c "ip route ..."` does not work.** Each `-c` runs as a separate command in exec mode, so the second never enters config mode ("Unknown command"). Config lines go in via a `sh -c "printf ... | vtysh"` pipe. Docker SDK 7.2 also has no `exec_run(input=...)`, so stdin has to be piped inside the container.
- **`revert_steer` must pass prefix + next hop + interface exactly.** FRR answers "Command incomplete" without all three. `show ip route static` prints `S>* <prefix> [1/0] via <hop>, <iface>, weight 1`, and the interface capture must not swallow the trailing comma.
- `parse_traceroute` keeps each hop's **answering address**, not just its RTT. The address is the only thing that identifies which router forwarded the packet (R1 is 10.0.0.10, R12 is 10.0.0.11, same /29), and dropping it is what previously left the analytics page with no way to show the packet path.
- **"Unreachable" on the analytics page is usually correct, not a bug.** Area-2 stub routers (R4, R5, R6, R10) have no route to `10.0.0.0/8`, so PC1/SW1 pairs genuinely have no path onward. `/api/lab/reachability` is the ground truth for which pairs can work; it probes the **full** 171-pair matrix (a 60-pair cap silently left later pairs untested) and takes ~28s.
- Queue length / qdisc drops are legitimately `0` on a clean link. Verified they move under real impairment: 80 ms netem on R1/eth0 gave 80.285 ms latency and 3 qdisc drops.
- **Area 0 is the backbone and is not assignable.** `backend/ospf_area.py` refuses it as a target *and* refuses moving an area-0 interface into a non-zero area, because non-backbone areas only learn about each other through area 0 — renumbering a backbone interface strands the router. The rules live in the backend, not the UI, so they hold for any caller.
- **`ip ospf area <n>` does not overwrite an existing area.** FRR answers `Must remove previous area config before changing ospf area` and **still exits 0**, so a change needs `no ip ospf area` first and has to be confirmed by reading `show ip ospf interface` back, not by exit status. The same applies to any other rejected `vtysh` line.
- Area state is read from `show ip ospf interface`, not from `frr.conf`: an interface only appears there once OSPF is operational, so a configured-but-down interface is correctly reported as absent instead of as being in area 0. ABR status is derived from actually holding interfaces in >1 area, not asserted.
- Changing an interface's area is a routing change: OSPF only forms adjacencies between interfaces in the **same** area, so moving one side leaves the far side routing to nothing until it follows. `/api/lab/ospf/area` requires a `preview: true` call first, which reports the currently-reachable pairs that pass through the router; an un-previewed apply is refused. Neighbours take one dead-timer interval (40s) to re-form.
- **Interface counters only move when packets flow**, which is why the live matrices looked broken on an idle lab. `backend/traffic.py` starts a `ping` loop backgrounded *inside* the container with `&` and echoes `$!` for the PID. `exec_run(detach=True)` is **not** usable here: it returns `None` for `exit_code`, so there is nothing to confirm the start and no PID to stop — an early attempt using it leaked pings that kept inflating counters long after the API reported failure. A partially-started generator now kills what it did start rather than leaving the lab half-loaded.
- Throughput requires an **adjacent** peer — `/api/lab/bandwidth` pings source→destination and samples counters around it, so a remote pair measures nothing. It also requires `destination` in the body; omitting it returns 422.
- **Token values in `frontend/src/index.css` are hex, not oklch()**, so contrast is auditable by `scripts/audit_contrast.py` with exact sRGB math and no colour-space conversion. Re-run that script after any token change.
- `scripts/migrate_theme.py` is the one-off class migration that moved the UI from the broken light/dark mix onto the tokens. It is idempotent-by-exhaustion (the patterns are gone), kept for reference.
- `backend/ospf_ai_service.py` reads the OSPF path from the **live network**, never from a hand-rolled SPF. The modelled undirected Dijkstra picks a different path than the routers actually forward, because OSPF charges cost on each router's own outgoing interface, so it is retained only as a labelled fallback. Two live sources are used: `ospf_rib_path()` (authoritative) and `real_ospf_path()` (traceroute, fallback + `path_taken` ground truth).
- Hop identity is resolved by **subnet membership**, not exact IP equality, and routing graphs are **transit-only** (LANs are stub edges to the single router on each segment) because r1's OSPF table lists only `10.0.0.0/8`.
- OSPF costs come from a single `vtysh -c "show running-config"` per router, split into interface stanzas. `vtysh` has no per-interface config subcommand.
- `backend/dataset_collector.py` measures each pair under four **real** conditions (clean, mild, heavy, loaded) because a clean lab classifies 100% of rows as "Low" and teaches the Random Forest nothing. It runs strictly **serially** — impairment lands on the first hop's egress interface, which several pairs share, so parallel workers would install competing `tc qdisc add root` rules and starve each other.
- `apply_impairment` chains tbf and netem (tbf as root, netem as a child) rather than installing both as `root`. An interface has one root qdisc, so the second `add` was silently rejected and the rate limit never applied.
- Congestion is derived from real `tc -s qdisc` / `ip -s link` counter **deltas** taken around the measurement, not from a loss/jitter formula.
- Unreachable pairs are skipped by the collector and reported with a `diagnosis` string plus `/api/lab/reachability`; they are not shown as "100% loss".
- In `enterprise-ospf-lab`, area-2 stub routers (R4, R5, R6) have no route to `10.0.0.0/8` and a stale kernel default route, so router-to-router measurement works on `10.0.0.0/8` but not to those. `frr.conf` files are root-owned and bind-mounted, so `vtysh -c "write memory"` fails with "Resource busy".
- `iperf3` and `ethtool` are absent from all lab images (alpine and frr); throughput is derived from `/proc/net/dev` deltas.
- `backend/generated/` holds committed FRR configs per router + docker-compose.yml (written by `generator.py` / `docker_compose_generator.py` relative to backend CWD). These files are **committed to git** — don't edit them by hand; modify the generators.
- Backend venv is Python 3.14 at `backend/venv/` (also the default interpreter in `.vscode/settings.json`).
- Frontend has no test suite; `npm run lint` is `tsc --noEmit`.
- `DISABLE_HMR=true` disables Vite HMR and file watching (used in AI Studio to prevent flickering during agent edits). Configured in `vite.config.ts` — do not remove.
- `backend/training_data.db` has an `origin` column (`measured` vs `synthetic`); `network_metrics` also holds the balanced synthetic seed.
- `frontend/src/utils/api.ts` sets `API_BASE = "http://127.0.0.1:8000"` and surfaces the real FastAPI `detail` via `describeFailure()` rather than a generic "failed".
