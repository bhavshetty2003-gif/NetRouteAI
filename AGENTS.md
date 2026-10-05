# AGENTS.md

## Project Layout

Multi-package monorepo — each subproject has its own dependency manifest:

| Directory | Purpose |
|-----------|---------|
| `frontend/` | React + Vite + TypeScript topology designer + live analytics UI |
| `backend/` | FastAPI backend — lab metrics collection, routing, analytics, Docker/FRR generation, RF training pipeline |
| `ai/` | DQN reinforcement-learning routing model (stable-baselines3, gymnasium) — **not** used by the analytics page |
| `network/` | Mininet topology scripts (`topologies/*.py`; `run.sh` is empty) |
| `enterprise-ospf-lab/` | Pre-built 12-router multi-area OSPF lab — an explicit **fallback** measurement target, not the default |
| `ospf-lab/` | 8-router OSPF lab |
| `shortest-path-demo/` | 5-router shortest-path demo |
| `scripts/` | Maintenance utilities (`migrate_theme.py`, `audit_contrast.py`) |

Root `README.md` and `requirements.txt` are intentionally empty. `tests/` and `database/` are empty placeholders. `docs/` holds `ALGORITHM_FLOWCHARTS.md` — 20 Mermaid flowcharts transcribed from the running code, with a source reference per diagram; update it when an algorithm changes.

## Commands

### Frontend (`frontend/`)

```bash
npm install
npm run dev        # port 3000
npm run lint       # tsc --noEmit
npm run build

# Verification (the auth ones need the backend running on :8000 first)
npm run test:auth        # register / validate / edit profile / sign out
npm run test:gate        # the whole App: signed out vs signed in
npm run test:google-ui   # Google button visibility rule
npm run test:home        # home page: no backend reads, identical for every topology
npm run test:canvas      # per-account canvas: blank on fresh login, restored after, never shared
```

`npm run lint` is the only static check — there is no unit-test suite. The five
scripts under `frontend/.harness/` are jsdom harnesses that mount the real
components against the running backend rather than mocking either side; see
`.harness/README.md`.

### Backend (`backend/`)

```bash
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
python test_training.py   # verify training pipeline (no Docker needed)
```

`bcrypt` and `cryptography` are new runtime requirements (account hashing and
Google token signature verification). The frontend test scripts additionally
need the `jsdom` devDependency, already declared.

### Live lab (required for the analytics page)

The lab is normally **built from the topology you drew in the designer**, via
`POST /api/lab/deploy` (the "Deploy" button on `LabDeployBar`). That is the
point of the design: what the canvas shows is what gets measured.

```bash
# Or, as an explicit fallback, the pre-built lab:
curl -X POST http://127.0.0.1:8000/api/lab/deploy/enterprise
# equivalently:
cd enterprise-ospf-lab && docker compose up -d
```

Generated labs land in `backend/labs/current/` (compose file + per-router FRR
config + `plan.json`), which is **gitignored** — it is output, not source.
The backend discovers whatever is running dynamically; there is no hardcoded
topology, and the generated lab is the one it finds first.

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

`backend/auth_db.py` / `auth.py` / `auth_routes.py` and
`frontend/src/utils/auth.ts`, `components/auth/*`, `components/ProfileMenu.tsx`
and `components/GoogleSignInButton.tsx` implement accounts and sign-in.

## API Endpoints

### Deploying the drawn topology, then measuring it

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/lab/plan` | Resolve addresses, costs and areas **without touching Docker** |
| POST | `/api/lab/deploy` | Make the drawn topology the running lab (the current lab) |
| GET | `/api/lab/deploy` | What is deployed, and whether the lab has drifted from the canvas |
| POST | `/api/lab/deploy/enterprise` | Bring up `enterprise-ospf-lab` as an explicit fallback |
| POST | `/api/lab/deploy/teardown` | Stop and remove the generated lab |

### Live lab measurement (Docker/FRR)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/lab/status` | Discovered devices, links, OSPF cost histogram |
| POST | `/api/lab/ping` | `ping` a **literal IP** from one router's container (the CLI's path) |
| POST | `/api/lab/measure` | `ping` + `traceroute` between two devices |
| POST | `/api/lab/bandwidth` | Achieved throughput from `/proc/net/dev` counter deltas |
| POST | `/api/lab/impair` | `tc` netem/tbf injection; `{"clear": true}` to remove it |
| POST | `/api/lab/link` | `ip link set dev … down/up` for link failure |
| POST | `/api/lab/traffic` | Start/stop a detached `ping` loop so interface counters actually move |
| GET | `/api/lab/traffic` | Which devices are currently generating traffic |
| GET | `/api/lab/ospf/areas` | Per-interface OSPF area (from `show ip ospf interface`) + ABR roles |
| POST | `/api/lab/ospf/area` | Preview (required first) or apply an interface area change |
| POST | `/api/lab/convergence` | Timed link-failure recovery measurement |
| GET | `/api/lab/reachability` | Parallel reachability sweep across pairs |
| GET | `/api/lab/metrics` | Combined interface + resource snapshot |
| POST | `/api/analytics/live` | OSPF vs AI (Random Forest) comparison + traced `path_taken` for one pair |
| POST | `/api/lab/route` | Put a routing method's path in effect (or revert to OSPF) |
| GET | `/api/lab/routes` | Static routes currently installed on a router |
| POST | `/api/dataset/collect` | Measure every pair under varied conditions, store real RF rows |
| GET | `/api/dataset` | Row counts, measured/synthetic split, class balance |

### Accounts (session-gated frontend, added after the fake login was removed)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/config` | Whether Google sign-in is configured, and the client id to render with |
| POST | `/api/auth/register` | Create an account from name, age, email, password, confirm, mobile |
| POST | `/api/auth/login` | Email + password → session token |
| POST | `/api/auth/logout` | Delete this session |
| GET | `/api/auth/me` | The signed-in user |
| PATCH | `/api/auth/me` | Update **name, age, mobile only** |
| POST | `/api/auth/google` | Exchange a Google ID token for a session, or a pending registration |
| POST | `/api/auth/google/complete` | Create the account for a verified Google identity |
| POST | `/api/auth/forgot-password` | Issue a single-use reset code |
| POST | `/api/auth/reset-password` | Set a new password; revokes every session for the account |

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

The designer canvas (route discovery, packet animation) still runs client-side via BFS graph traversal in `src/utils/networkRouting.ts`. The drawn topology persists to localStorage, **keyed per account** as `netrouteai_topology_v1:u<id>` via `frontend/src/utils/topologyStore.ts`; a fresh sign-in gets a blank workspace, and the toolbar's `Topologies` menu is the only thing that seeds devices now.

**The Analytics view is backend-driven and scoped to the drawn topology.** `components/views/AnalyticsView.tsx` takes the designer's `devices` as a prop and filters the discovered lab down to the routers that appear in **both** the topology and the running lab: those are the only source/destination options, and the OSPF area table is filtered the same way. With no routers on the canvas the page shows a "no topology to analyse" state and fetches nothing. Everything measured still comes over `src/utils/api.ts` from `/api/lab/status`, `/api/analytics/live`, `/api/lab/reachability`, `/api/lab/route`, `/api/dataset`, and `/api/lab/bandwidth`. It shows loading, lab-offline, error, and unreachable-diagnosis states. Every displayed number is measured; the "How these numbers were produced" panel prints the actual commands. It carries a routing-method selector (**OSPF / AI (Random Forest) only**) with an "Apply to lab" action that installs static routes, a hop-by-hop table of the traced packet path, and a reachability hint under each source/destination select.

**Dead code — do not build on it:** `ai/` DQN model is not referenced by any backend endpoint; `backend/generated/` is generator output only; `computeMetrics` and `SimulationMetricsPanel` were removed, and `MonitoringView` is now backed by real `/api/lab/metrics` counters with `POST /api/lab/link` doing the toggling.

**`MonitoringView` describes the canvas ∩ lab like Analytics does.** It is passed the canvas `devices` and filters the lab sweep down to routers present in both, because a canvas-only router has no container to read and a lab-only router is not part of the topology being monitored. With no lab it says so rather than showing zeroes, which would be indistinguishable from a healthy idle network.

## Accounts and Sessions

`backend/auth_db.py` holds the schema, `backend/auth.py` the logic, and `backend/auth_routes.py` the HTTP surface. Accounts live in **`backend/auth.db`**, deliberately separate from `training_data.db`: one is personal data with different retention and backup needs than the other. `*.db` is gitignored, so accounts are not committed.

**The Google Client ID is set in one place only.** Paste it into `GOOGLE_CLIENT_ID` in `backend/auth.py` (or set the `GOOGLE_CLIENT_ID` environment variable, which wins). The frontend does **not** keep a copy — it reads it from `GET /api/auth/config`, so a client id cannot drift between browser and server, which is what produces baffling `invalid audience` errors. With no id set, `/api/auth/config` reports `google_enabled: false`, the button is never rendered, and `/api/auth/google` returns a clean 503 rather than a broken control.

- **Passwords are bcrypt hashes only.** `public_user()` never includes `password_hash` or `google_sub`, by construction rather than by filtering, so a future field cannot leak by being forgotten.
- **The email address cannot be changed because no code path can write it.** `ProfileUpdateRequest` has no `email` field and `update_profile()` never reads one. The UI shows the field `readOnly` with a "cannot be changed" note rather than hiding it — hiding it makes the restriction look like a missing feature.
- **The session token is in `localStorage`, not an httpOnly cookie,** because the API is on `:8000` and the UI on `:3000`, so a cross-site cookie would need `SameSite=None` plus CSRF protection. The consequence is that any XSS bug on the page could read the token; nothing builds HTML from user input to avoid giving it one.
- **`sqlite3.Row` is read by key, not by attribute.** `getattr(row, "email")` returns `None` because there is no such Python attribute — this once serialised whole accounts as all-nulls. Use `row["email"]`.
- **A JWK's `n` is a raw modulus, not a DER key.** Build the key with `rsa.RSAPublicNumbers(e=..., n=...)`; calling `load_der_public_key` on `n` raises for every real Google key, and a bare `except` then swallows it so sign-in fails for *any* token. The positive control in the harness exists because of this.
- **Only `RS256` is accepted,** which is what blocks `alg: none` and HMAC-confusion tokens. The signature is verified *before* `aud`, so an unsigned token cannot probe which client ids the server accepts. `email_verified` must be true, or an unverified address could claim an existing account.
- **A Google identity with no account is verified, then held as a short-lived HMAC token** rather than creating a half-populated account — Google supplies no age or mobile number. The token authorises creating that one account and expires in 15 minutes. The identity has to be threaded from the login panel into the register panel or the user is asked for an email they just verified.
- **`/api/auth/forgot-password` answers identically for registered and unregistered addresses** so it cannot enumerate accounts. It returns the reset code in the response because no SMTP is configured; the UI says so explicitly rather than telling the user to check an inbox that will stay empty. Codes are single-use, 10-minute, and a new one retires the previous.
- **A password reset revokes every session for the account,** because the usual reason to reset is that someone else has yours.
- Auth failures use `detail: {message, field}` (not a bare string) so the form can mark the offending input; "passwords do not match" without saying which field is only half an answer.

Verified with `frontend/.harness/` (`npm run test:auth`, `test:gate`, `test:google-ui`) and `/tmp/opencode/google_verify.py`. These mount the real components against the running backend rather than mocking either side — see `.harness/README.md` for the bugs that arrangement caught.

## Non-Obvious Facts

- **The addresses on the canvas and in the lab are the same addresses.** The canvas does not invent an IP: `POST /api/lab/plan` and `POST /api/lab/deploy` both run the same `resolve_plan`, and the designer adopts the returned plan onto its own state. Anything already set on a link is sent through and honoured; only blanks are filled. That is the whole guarantee — an IP the UI shows is the IP the routers get because it *is* the backend's allocation, not a second derivation that could disagree.
- **Addressing is classful and the mask is derived, never typed.** A link's `address_class` (A/B/C) fixes the mask: A → `/8`, B → `/16`, C → `/24`. Each class draws from a **disjoint** block — A from first octet 10+, B from 172.16/18+, C from 192.168.x — so a Class A link can never collide with a Class C one.
- **The allocator is stateless, which is what makes deletion free.** A subnet is "taken" only by the topology currently being planned, and each class scans its candidates from the start. There is no pool to drain and nothing to release, so deleting a link or a router hands its address straight back to the next link that needs one. Verified: deleting link l5 (R11–R12, `192.168.3.0/24`) gives `192.168.3.0/24` to the next link, deleting router R12 releases both its subnets, and drawing R12 back returns both.
- **A link with no area of its own inherits its source router's area**, and each router gets one headline `ip` (its lowest interface address) which no two routers may present at once.
- **Deploy never restarts the lab.** Config is pushed into the running `vtysh` and read back from `show ip ospf interface`; the verification is a read-back, not an exit status, because FRR rejects some lines and still exits 0.
- **The analytics page must never show a hardcoded value.** Every figure traces back to a command run inside a lab container. `scripts/audit_contrast.py` guards the colour side; measurement provenance is printed in the UI itself.
- **End-to-end measurement sends 12 ICMP requests, not 6**, and reports `loss_resolution_percent` (1/N) — 6 packets cannot express a loss below 17%, so one drop read as a sixth of the traffic lost.
- **The routing-method selector changes the data plane, it does not relabel a column.** `POST /api/lab/route` installs a static route **per hop** (not just on the source) and static routes beat OSPF, so FRR really forwards the chosen path. Pinning only the source was tried and is insufficient: R1→R2 gave `R1→R2→R3→R12→R11` because R2's own OSPF still chose its own way onward.
- **Analytics is gated on the topology, and its endpoints are the topology ∩ lab.** `AnalyticsView` is passed the canvas `devices`; source/destination and the OSPF area table list only routers present in **both**, because a canvas-only router has nothing to measure and a lab-only router is not part of the network being analysed. Clearing the canvas (`setDevices([])`) removes them and shows the empty state instead of lab-wide figures, and the ~28s full-matrix `/api/lab/reachability` sweep is not fired at all in that state. **A fresh account now has an empty canvas rather than a seeded R1/R2 pair**, so Analytics and Monitoring open in their empty state for a new user and offer no source/destination pair at all until something is drawn. That is the correct behaviour, not a regression — see the next entry.
- **Dijkstra is no longer a selectable routing method.** The textbook SPF path was removed from the analytics selector *and* from `ROUTING_METHODS`/`compare_ospf_vs_ai`: it is a modelled baseline the routers cannot be asked to run (OSPF charges cost on each router's own outgoing interface, so it differs from what FRR forwards) and it usually duplicated the AI path, making it an unhelpful third column. `ospf_path()` survives only as a labelled fallback when the OSPF RIB and traceroute both fail to identify the live path — and the OSPF route's basis string now says "modelled shortest path" so the word Dijkstra cannot reappear in the UI. `POST /api/lab/route` rejects `dijkstra` with a clean 503 (`path_for_method` raises `LabUnavailable`, which the handler converts rather than leaking a 500).
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
- **Throughput does not require an adjacent peer, and the requested destination is the one measured.** `/api/lab/bandwidth` used to ignore `destination` entirely and ping every adjacent peer, and the analytics page substituted the source's nearest transit neighbour — so the figure sat beside a latency/loss/hop count for a *different* pair. Adjacency was never actually necessary: the counters being sampled are the source container's own, and they move for a remote destination exactly as for a neighbour (R1→R9 across three hops and two areas moved 822 KB in the same 2 s sample that R1→R2 did). The "a remote pair measures nothing" belief was describing the bug.
- **Throughput needs a heavy stimulus or it measures the packet rate.** `ping -i 0.05` on default 84-byte echo requests offers only ~0.03 Mbps of load. `measure_bandwidth` now sends `ping -s 4000 -i 0.01` (~6.6 Mbps of real bytes) and falls back to the plain form if the container refuses it, so a reported zero means nothing was forwarded rather than that a flag was too fast. rx+tx are also taken from the **busiest single interface** (`measured_interface`, with `per_interface` alongside) rather than summed across every interface, since a probe is one flow crossing one egress link and anything else moving is unrelated traffic. Verified responsive to shaping: R12→R5 reads 6.576 Mbps, 3.411 Mbps under `tc tbf rate 2mbit` on R12/eth0, 6.576 Mbps cleared.
- **The training data used to contain two fabricated columns.** `POST /api/lab/measure` and `dataset_collector` both wrote `bandwidth_mbps` as a constant (the impairment profile's configured tbf rate, or a flat 1000 when there was none) and set `total_cost` to the hop count. A Random Forest handed two constant columns learns nothing from them, so any confidence derived from them was noise. Both are read for real now: throughput from the counter deltas around the measurement, cost from the live `ip ospf cost` of each interface on the traced path (`_training_row` in `main.py` shares `dataset_collector`'s `_path_cost` / `_congestion_from` / `_path_queue_state`). A row that cannot produce a throughput number is **skipped**, not written with a placeholder.
- **"Select OSPF" and "revert to OSPF" are the same operation.** `POST /api/lab/route` used to short-circuit on `method: "ospf"` and report "OSPF is what the routers already forward with nothing injected" *without checking whether anything was injected*. The pinning static routes stayed on every hop and the routers kept forwarding the deselected AI path while the response claimed no change was needed. `apply: false` and `method: "ospf"` now share the removal path. Correspondingly the UI enables "Revert to OSPF" whenever the routers are forwarding something other than the OSPF path — which includes the exact state where OSPF is selected *because* steering to AI left it in effect — and disables "Apply to lab" for OSPF with an explanation.
- **A newly drawn link is planned automatically.** `App.tsx` fires `POST /api/lab/plan` as soon as any drawn link has no address, so the canvas shows the backend's own allocation before a deploy is possible. The trigger is the *set* of unaddressed link ids, remembered across attempts, so a backend refusal does not re-fire on every render.
- **The CLI's `ping` is real; the rest of the CLI is a simulator.** It used to print `!!!!!` (ping's own notation for 100% loss) followed by "Success rate is 100 percent (5/5), round-trip min/avg/max = 1/3/4 ms" for every target — invented and self-contradictory. It now calls `POST /api/lab/ping` and prints that command's unedited output plus the parsed summary. The endpoint exists because a terminal is asked about a literal address, which the source/destination measurement path cannot express.
- **The landing page reads nothing at all.** `HomeView` went through three rounds of change, all from the same bug: it kept stating things about a network as if it had measured them. First it *invented* them — a convergence of "< 0.4ms", bridges "br-net0 ... br-net4", daemons "ospfd / bgpd" (only ospfd is ever configured), latency "18.8 ms" vs an AI "12.4 ms (-34%)" at "0.00%" loss, a telemetry deck of "-34.2%" and "0.8 ms" jitter, and a canned `show ip route ospf` transcript. That was replaced with real reads of `/api/lab/status`, `/api/lab/ospf/areas` and `/api/dataset`. **Those real reads were then themselves the bug**, for a reason unrelated to honesty: the lab is *one shared lab*, not a per-user one. Whoever deployed last decided what a stranger saw on their first visit — their device count, area count, ABRs, and worst of all their literal router IDs printed in the terminal card. Two accounts on one machine got two different home pages, so "identical for all users" could not be true of a page fed by mutable server state.
  - The fix is **not** static constants, which would only reinstate the original fabrication. The page carries **no numbers at all**: it describes *capabilities* (draw → deploy → measure → compare), names no device, and fetches nothing. `npm run test:home` enforces this by rendering `HomeView` under two very different `netrouteai_topology_v1` values and diffing the DOM byte-for-byte, and by rejecting **any** `\d+ ms`, `\d+ Mbps` or `\d+%` in the page text — a blanket ban rather than a blocklist of the four old figures, so the next invented number fails too.
  - Measurement is not lost, only relocated: Analytics still prints every figure beside the command that produced it, which is where a number belongs. **A landing page should describe the software, not someone's network.**
- **A landing page must not talk about itself.** Once the home page carried no topology, a second failure mode appeared: sentences *about the page* rather than about the product — "A fixed illustration of one host's route. Your own topology is drawn and measured on the Analytics page, not here.", "The lab you build is yours alone", "Applying a method installs static routes hop by hop, so the choice changes real forwarding", the badges `per topology` / `per device` / `measured`. Every one was accurate, and every one is something no visitor can act on. They were written for a reviewer, not a reader, and they read as hedging on a page that is supposed to be confident.
  - The test is not "is the sentence true" but **"does it describe the software or does it describe this webpage."** The second kind is removed on sight. `npm run test:home` enforces it by class rather than by blocklist: no `illustration`, no pointer to another page, no `not here` / `instead of` / `rather than` contrast, no provenance or hedging phrasing, no scope disclaimer, no instruction telling the reader where to go. Note the deliberate non-rule: "you place a router", "You can inject latency" stay, because second person describing a *capability* is copy, while second person describing the *page* is commentary.
  - The OSPF/AI preview strip originally read `Method / Chosen by / Effect`, where `Effect` said `static routes`. All three are the vocabulary of an implementation note, and `Effect` in particular is what prompted the question of what a static route is doing on a landing page at all. It now reads `Input / Output / Compared on` — the AI branch's input is `live link conditions`, OSPF's is `link cost you set`, the output is `one forwarding path`, and the two are `Compared on latency & loss`. The toggle still switches the branch; the harness clicks it and asserts **both** branches, because reading only the default branch silently proves half a conditional.
  - The `proves:` half of each workflow card went for the same reason. It documented why a measurement is trustworthy — useful in a report, dead weight in a hero. That reasoning belongs in `AGENTS.md` and on the Analytics page's provenance panel, where it is next to the number it defends.
- **The canvas belongs to the account, not the browser.** Topology lived under one global key, `netrouteai_topology_v1`, which was fine with no accounts and wrong the moment there were: two people on one browser shared a canvas, and the second sign-in inherited the first person's network. It is now `netrouteai_topology_v1:u<id>` (`utils/topologyStore.ts`). Three consequences that are easy to get wrong:
  - **The canvas can no longer be read in a `useState` initialiser.** The account is not known until `/api/auth/me` answers, so loading is an effect keyed on `user.id` and the state starts empty.
  - **A save effect that fires before the load has landed silently eats the saved canvas.** Both run on the same commit and the save closes over the *initial* empty state, so it overwrites storage with a blank on every sign-in and "your topology came back" never works. `hydratedFor` exists solely to hold the save back until the load has run. A workspace rendered in the window between the two puts an empty canvas on screen for a frame and then fills it, which reads as data loss — hence `if (hydratedFor !== user.id) return <AuthLoading />` before the workspace renders.
  - **An empty canvas must be saved, not skipped.** "No saved topology" and "saved an empty topology" are different states and only the second is what the user did. A store that refuses to write an empty canvas passes the fresh-login rule forever and fails the first time someone clears their workspace and signs back in — resurrecting exactly what they deleted. `npm run test:canvas` asserts `hasSavedTopology(id) === true` alongside `loadTopology(id).devices.length === 0`, because only asserting the second would pass for a store that never saved at all.
  - `getDefaultTopology()` is no longer the initial state, and the seeded "Corporate Core LAN (VLAN 10)" annotation is gone — both described a network a blank canvas does not have. The toolbar's `Topologies` menu still offers them, which is a deliberate user action. Settings → "Reset LocalStorage Topology" used to load the default preset, so "clear my data" quietly handed you a starter network; it now blanks the workspace.
- **A dead prop is a claim nobody checked.** `HomeView` accepted `deviceCount` and `cableCount` and never read either — so `App.tsx` passed `devices.length` and `cables.length` on every render with no visible effect. The props looked like proof the page was topology-aware; they were not, and the cost of removing them was breaking `tsc` at three call sites. Grep for the *declaration* separately from the *use*: a prop type shows up either way.
- **Interface names are unstable across Docker restarts.** Never restart the generated lab after configuring it — re-apply the config instead, or the interfaces the FRR config refers to will not be the ones that exist.
- **`exec_run(demux=True)` returns a namedtuple whose `.output` is a `(stdout, stderr)` tuple.** Use `metrics_collector._demux()` / `lab_topology._exec_stdout()` rather than treating it as a string.
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
- Frontend has no unit-test suite; `npm run lint` is `tsc --noEmit`. The auth surface
  is covered by the three jsdom harnesses in `frontend/.harness/`, which need the
  backend running and are not part of `npm run lint`.
- `DISABLE_HMR=true` disables Vite HMR and file watching (used in AI Studio to prevent flickering during agent edits). Configured in `vite.config.ts` — do not remove.
- `backend/training_data.db` has an `origin` column (`measured` vs `synthetic`); `network_metrics` also holds the balanced synthetic seed.
- `frontend/src/utils/api.ts` sets `API_BASE = "http://127.0.0.1:8000"` and surfaces the real FastAPI `detail` via `describeFailure()` rather than a generic "failed".
- `python` is not on PATH; use `backend/venv/bin/python` (3.14). `pkill -f "uvicorn main:app"` kills its own shell — stop the API by its pidfile instead.
- Layout is verifiable without a browser via a jsdom harness under `/tmp/opencode/` run with `frontend/node_modules/.bin/tsx`: mount the component, stub `globalThis.fetch`, and `await act()` until the loading flags clear. **Capture the real `fetch` into a variable before replacing it** or the shim recurses into itself, and **strip the query and the `API_BASE` origin** (`new URL(u, base).pathname`) or you request a malformed URL and mistake a harness bug for a product one.
