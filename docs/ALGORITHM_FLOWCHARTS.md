# NetRouteAI — Complete Algorithm Flowcharts

Every diagram below is transcribed from the running code, not from intention. Each
section names the file and function it documents so a reader can diff the diagram
against the source.

**Rendered with Mermaid** — GitHub, GitLab, VS Code (Markdown Preview Mermaid
Support) and Obsidian all render these natively.

---

## Table of contents

| # | Algorithm | Source |
|---|-----------|--------|
| 1 | [System overview](#1-system-overview) | whole project |
| 2 | [Automatic address planning (canvas trigger)](#2-automatic-address-planning-canvas-trigger) | `frontend/src/App.tsx` |
| 3 | [`resolve_plan` — the addressing algorithm](#3-resolve_plan--the-addressing-algorithm) | `backend/lab_deploy.py` |
| 4 | [`_addresses_for` — one link's address](#4-_addresses_for--one-links-address) | `backend/lab_deploy.py` |
| 5 | [`deploy` — build, start, configure, prove](#5-deploy--build-start-configure-prove) | `backend/lab_deploy.py` |
| 6 | [`configure` — vtysh plus read-back](#6-configure--vtysh-plus-read-back) | `backend/lab_deploy.py` |
| 7 | [OSPF path resolution — three sources](#7-ospf-path-resolution--three-sources) | `backend/ospf_ai_service.py` |
| 8 | [`_rib_walk` — walking the OSPF RIB](#8-_rib_walk--walking-the-ospf-rib) | `backend/ospf_ai_service.py` |
| 9 | [`rank_paths` — AI path scoring](#9-rank_paths--ai-path-scoring) | `backend/ai_route_service.py` |
| 10 | [`compare_ospf_vs_ai` — the Analytics run](#10-compare_ospf_vs_ai--the-analytics-run) | `backend/ospf_ai_service.py` |
| 11 | [`_measure_path_hops` — the noise floor](#11-_measure_path_hops--the-noise-floor) | `backend/ospf_ai_service.py` |
| 12 | [Latency verdict — is the gap real?](#12-latency-verdict--is-the-gap-real) | `backend/ospf_ai_service.py` |
| 13 | [Steering the data plane](#13-steering-the-data-plane) | `backend/route_steer.py` |
| 14 | [`apply_impairment` — tc chaining](#14-apply_impairment--tc-chaining) | `backend/metrics_collector.py` |
| 15 | [`measure_bandwidth` — real throughput](#15-measure_bandwidth--real-throughput) | `backend/metrics_collector.py` |
| 16 | [`measure_convergence` — timed failure](#16-measure_convergence--timed-failure) | `backend/convergence.py` |
| 17 | [OSPF area change](#17-ospf-area-change) | `backend/ospf_area.py` |
| 18 | [Dataset collection loop](#18-dataset-collection-loop) | `backend/dataset_collector.py` |
| 19 | [Theme + contrast audit](#19-theme--contrast-audit) | `frontend/src/utils/theme.ts`, `scripts/audit_contrast.py` |
| 20 | [Endpoint → algorithm map](#20-endpoint--algorithm-map) | `backend/main.py` |

---

## The five invariants every diagram enforces

These are the properties the whole design exists to hold. Each is a rejection
path somewhere in the diagrams below.

| # | Invariant | Enforced by |
|---|-----------|-------------|
| I1 | **An IP on the canvas is the IP the routers get.** Not a re-derivation that could disagree. | `resolve_plan` runs once per plan; `adoptPlan` writes *its* output back onto the canvas. Diagram 2, 3 |
| I2 | **Every displayed number is measured.** No constants, no placeholders. | Every measurement diagram returns `None`/`n/a` rather than a guess. Diagrams 7–18 |
| I3 | **A supplied address always beats the address class.** | `_addresses_for` checks the supplied branch *first*. Diagram 4 |
| I4 | **Deleting a link or router releases its address.** | The allocator is stateless — a subnet is taken only by the topology being planned, and each class rescans from the start. Diagram 3 |
| I5 | **The label never exceeds the evidence.** | Noise-floor gate before declaring a winner; `"n/a"` otherwise. Diagram 12 |

---

## 1. System overview

```mermaid
flowchart TD
    START(["User draws routers and links<br/>on the designer canvas"]) --> STATE["Canvas state<br/>devices, cables<br/>persisted to localStorage<br/>netrouteai_topology_v1"]

    STATE --> HASADDR{"Any drawn link<br/>missing subnet<br/>or source/target IP?"}
    HASADDR -- yes --> PLAN_REQ
    HASADDR -- no --> USER_ACTION{"User action"}

    USER_ACTION -- "Deploy" --> DEPLOY_REQ
    USER_ACTION -- "opens Analytics" --> ANALYTICS
    USER_ACTION -- "edits / deletes" --> STATE

    subgraph PLANNING["Addressing — no Docker touched"]
        PLAN_REQ["POST /api/lab/plan"] --> RP["resolve_plan — see diagram 3"]
        RP --> ADOPT["adoptPlan — backend output written onto canvas"]
        ADOPT -.->|"I1: canvas now shows the backend's own allocation"| STATE
    end

    subgraph DEPLOYMENT["Deployment — the drawn topology becomes the lab"]
        DEPLOY_REQ["POST /api/lab/deploy"] --> DP["deploy — see diagram 5"]
    end

    subgraph ANALYTICS_VIEW["Analytics view — scoped to canvas ∩ lab"]
        ANALYTICS["AnalyticsView receives canvas devices"] --> INTERSECT{"Filter lab devices to those<br/>present in BOTH canvas and lab"}
        INTERSECT -- "empty" --> EMPTY["Show 'no topology to analyse'<br/>fetch nothing at all"]
        INTERSECT -- "non-empty" --> SRC["Source / destination selects list<br/>only the intersection"]
    end

    SRC --> LIVE_REQ["POST /api/analytics/live"]
    LIVE_REQ --> CMP["compare_ospf_vs_ai — see diagram 10"]
    CMP --> TABLE["Comparison table, traced path,<br/>end-to-end figures, provenance panel"]

    FALLBACK["POST /api/lab/deploy/enterprise<br/>explicit fallback lab"] -.->|"only if the drawn topology<br/>is not deployed"| ANALYTICS

    style PLANNING fill:#e8f4f8,stroke:#0d6e85
    style DEPLOYMENT fill:#fdf0e6,stroke:#b5651d
    style ANALYTICS_VIEW fill:#eef7ee,stroke:#3d7a3d
```

**Reading it:** the designer is the source of truth for *shape*; the backend is the
source of truth for *addresses*. Planning is deliberately separated from deploying
so an IP can appear on the canvas long before any container exists — and it is the
*same* allocator that later configures the routers, which is what makes I1 true
rather than merely likely.

---

## 2. Automatic address planning (canvas trigger)

`frontend/src/App.tsx` — `unaddressedKey`, `plannedKeyRef`, `useEffect`

```mermaid
flowchart TD
    CANVAS["cables[] — every drawn link"] --> FILTER{"filter:<br/>!subnet || !sourceIp || !targetIp"}
    FILTER --> SORT["map id, sort, join with comma"]
    SORT --> KEY["unaddressedKey<br/>a STRING, not a counter"]

    KEY --> GUARD{"Guard checks:<br/>1. unaddressedKey is non-empty<br/>2. unaddressedKey != plannedKeyRef.current<br/>3. not already isPlanning"}

    GUARD -- fails --> IDLE["Do nothing — no request"]
    GUARD -- passes --> SETKEY["plannedKeyRef.current = unaddressedKey<br/>claim this key BEFORE awaiting"]

    SETKEY --> CALL["await previewAddresses(buildDeployPayload())"]

    CALL --> OK{"Request succeeded?"}
    OK -- yes --> ADOPT["adoptPlan(result)<br/>subnet, mask, class, sourceIp,<br/>targetIp, cost written to each cable"]
    ADOPT --> CLEARK["plannedKeyRef.current = ''<br/>clear the guard so the NEXT edit can re-fire"]
    CLEARK --> DONE(["Canvas shows real IPs"])

    OK -- no --> RESTORE["plannedKeyRef.current = unaddressedKey<br/>RESTORE the key"]
    RESTORE --> MSG["setLabMessage — show the backend's refusal<br/>on the canvas, verbatim"]
    MSG --> STOP["Guard now blocks a retry:<br/>key is unchanged, so no loop"]

    style OK fill:#fff4e6,stroke:#b5651d
```

**Why the key is remembered, not just an `isPlanning` flag:** a `useEffect` that
fires on `[unaddressedKey]` re-runs whenever the component re-renders with the same
inputs. Guarding on `isPlanning` alone means a backend *refusal* — "no free Class C
subnet" — re-fires on every render, forever. Remembering the key that was asked
about makes a refusal terminal until the user actually changes something.

`adoptPlan` also **strips** addresses from cables absent from the plan, so a link
whose address was released stops the canvas claiming to hold it (I4).

---

## 3. `resolve_plan` — the addressing algorithm

`backend/lab_deploy.py:146`. This is the single allocator. It backs both
`POST /api/lab/plan` and `POST /api/lab/deploy`.

```mermaid
flowchart TD
    IN["topology: routers[], links[]"] --> RLOOP{"for each router"}
    RLOOP --> RID{"has an id?"}
    RID -- no --> E1["DeployError: 'A router has no id'"]
    RID -- yes --> RTYPE{"type == router?"}
    RTYPE -- no --> RLOOP
    RTYPE -- yes --> RPAT{"id matches ^r(\d+)$ ?"}
    RPAT -- no --> E2["DeployError: ids must look like R1, R2, R3"]
    RPAT -- yes --> RDUP{"id already seen?"}
    RDUP -- yes --> E3["DeployError: duplicate router id"]
    RDUP -- no --> ADD["append {id, container: 'r'+n,<br/>name, area, router_id}"]
    ADD --> RLOOP

    RLOOP --> RCHK{"routers found?"}
    RCHK -- "0" --> E4["DeployError: no routers to deploy"]
    RCHK -- "1" --> E5["DeployError: deploy needs at least two routers"]
    RCHK -- ">=2" --> RSORT["sort by container number<br/>canonical order, so ethN is predictable"]
    RSORT --> RID2["router_id defaults to index.index.index.index"]
    RID2 --> BYID["by_id lookup"]

    BYID --> PASS1

    subgraph PASS1["PASS 1 — reserve what the caller already holds"]
        direction TB
        P1["for each link with any of<br/>subnet / source_ip / target_ip"] --> P1SUB["derive its subnet<br/>from subnet, else /32 of an IP"]
        P1SUB --> P1OVL{"overlaps() any<br/>subnet already held?"}
        P1OVL -- yes --> E6["DeployError: claims X which overlaps Y<br/>already held by link Z"]
        P1OVL -- no --> P1HOLD["held.append(subnet, link_name)"]
        P1HOLD --> P1LOOP{"more links?"}
        P1LOOP -- yes --> P1
        P1LOOP -- no --> P1DONE["used_subnets ∪= held"]
    end

    P1DONE --> PASS2

    subgraph PASS2["PASS 2 — allocate, in list order"]
        direction TB
        L0["for each link in order"] --> LEND{"both ends are routers<br/>in by_id?"}
        LEND -- no --> E7["DeployError: link refers to a non-router"]
        LEND -- yes --> LSELF{"source == target?"}
        LSELF -- yes --> E8["DeployError: link connects a router to itself"]
        LSELF -- no --> LCOST["cost = clamp(cost, 1..65535, default 10)"]
        LCOST --> LAREA["area = normalise(<br/>link.area ?? link.source_area<br/>?? SOURCE router's area)"]
        LAREA --> LADDR["_addresses_for — see diagram 4"]
        LADDR --> LCLAIM["_claim(source_ip, source)<br/>_claim(target_ip, target)<br/>refuse an address held twice"]
        LCLAIM --> LAPP["append {id, source, target, subnet, mask,<br/>address_class, source_ip, target_ip,<br/>cost, area, network: 'nNN'}"]
        LAPP --> LLOOP{"more links?"}
        LLOOP -- yes --> L0
        LLOOP -- no --> LCHK
    end

    LCHK{"any links?"}
    LCHK -- "0" --> E9["DeployError: no links to deploy"]
    LCHK -- ">=1" --> ORPH{"any router on no link?"}
    ORPH -- yes --> E10["DeployError: routers not connected to anything:<br/>R7, R9"]
    ORPH -- no --> PRIM

    subgraph PRIM["Router primary address — 'each router has a distinct IP'"]
        direction TB
        PA["for every (router, address) pair<br/>on every one of its links"] --> PB["keep the numerically lowest<br/>address, compared as octet tuples"]
        PB --> PC["assert no two routers<br/>present the SAME address"]
        PC -- collides --> E11["DeployError: R2 and R11 would both be 10.0.0.2"]
        PC -- ok --> PD["routers[].ip = primary"]
    end

    PD --> RET["return {routers, links, areas}<br/>areas = union of router areas and link areas"]

    style PASS1 fill:#e8f4f8,stroke:#0d6e85
    style PASS2 fill:#fdf0e6,stroke:#b5651d
    style PRIM fill:#eef7ee,stroke:#3d7a3d
```

### Pass 1 exists because allocation is greedy

Without it, a link needing a *fresh* subnet takes the first free candidate **even
when a link further down the list already sits on it** — then that later link is
refused as a duplicate and the whole plan fails while a free subnet sits unused.

Reproduced on the running 14-link lab by renumbering `l6` (which comes before
`l7`) to Class A:

```
greedy, single pass:   l6 claims 10.0.0.0/8  →  l7 refused  →  HTTP 400
two-pass reservation:  l6 gets 11.0.0.0/8    →  l7 keeps 10.0.0.0/8  →  HTTP 200
```

### Why `overlaps()` and not equality

Equality is not sufficient. `10.0.0.0/24` is not *equal* to `10.0.0.0/8`, but every
address in the `/24` is also inside the `/8` — so a Class A link could be handed the
containing `/8` while another link held the `/24`, and the routers would be
configured with **the same host addresses on two different links**. The per-class
blocks are disjoint by first octet, so this can only arise across a prefix
boundary, but it has to be caught.

Sibling `/24`s inside one `/8` (`10.0.0.0/24` and `10.5.0.0/24`) still allocate
normally, because they genuinely do not overlap.

### I4 — deletion is free

There is no pool and nothing to release. A subnet is "taken" only by the topology
currently being planned, and each class rescans its candidates from the start. So
deleting `l5` hands `192.168.3.0/24` straight back to the next link that needs one,
and drawing the link again returns it.

---

## 4. `_addresses_for` — one link's address

`backend/lab_deploy.py:382`

```mermaid
flowchart TD
    RAW["one link from the canvas"] --> SUP{"any of subnet,<br/>source_ip, target_ip<br/>supplied?"}

    SUP -- "YES — the canvas already holds an address" --> SUBNET["subnet = supplied subnet,<br/>else /32 derived from an IP"]
    SUBNET --> CLS["address_class = class_of(subnet)<br/>by prefix length: /8→A, /16→B, /24→C"]
    CLS --> IPSUP{"any IP supplied?"}
    IPSUP -- yes --> INNET{"each supplied IP is a<br/>usable host address?<br/>in subnet, not network<br/>or broadcast"}
    INNET -- no --> E1["DeployError: '10.0.0.0 is not a<br/>usable host address on subnet X'"]
    INNET -- yes --> BOTH
    IPSUP -- "no — subnet only" --> FIRSTHOST["take the first two hosts<br/>hosts[1] and hosts[2]"]
    FIRSTHOST --> BOTH{"source_ip == target_ip?"}
    BOTH -- yes --> E2["DeployError: both ends given<br/>the same address"]
    BOTH -- no --> MASK["mask = dotted mask for the class<br/>/8→255.0.0.0  /16→255.255.0.0  /24→255.255.255.0"]
    MASK --> RET1["return supplied address,<br/>with the class *derived* from it"]

    SUP -- "NO — blank link" --> RESOLVE["address_class = resolve_class(<br/>address_class ?? ip_class)<br/>default 'C'"]

    RESOLVE --> CAND{"_class_candidates(class),<br/>first 256, in order:<br/>A: 10.0.0.0/8, 11.0.0.0/8 …<br/>B: 172.16.0.0/16, 172.18.0.0/16 …<br/>C: 192.168.0.0/24 …"}
    CAND --> FREE{"overlaps() any<br/>already-used subnet?"}
    FREE -- yes --> NEXT
    FREE -- "no — first free one" --> TAKE["claim it<br/>source_ip = hosts[1]<br/>target_ip = hosts[2]"]
    TAKE --> RET2["return fresh address +<br/>the class the user chose"]

    NEXT{"exhausted 256<br/>candidates?"}
    NEXT -- no --> CAND
    NEXT -- yes --> E3["DeployError: no free Class X subnet<br/>left for the links in this topology"]

    style SUP fill:#e8f4f8,stroke:#0d6e85
```

### The class pools are disjoint

| Class | Mask | Drawn from | Never collides with |
|-------|------|-----------|---------------------|
| A | `/8` — `255.0.0.0` | `10.0.0.0/8`, `11.0.0.0/8`, … `99.0.0.0/8` | B or C |
| B | `/16` — `255.255.0.0` | `172.16.0.0/16`, `172.18.0.0/16` … `172.31.0.0/16` | A or C |
| C | `/24` — `255.255.255.0` | `192.168.0.0/24` … `192.168.255.0/24` | A or B |

A Class A link can therefore never be handed the same subnet as a Class C one,
whatever order the links arrive in. `172.17.0.0/16` is deliberately absent from the
B pool because it is Docker's default bridge range.

### I3 — supplied address beats class

The `SUP` branch is checked **first** and returns immediately. This is the whole
guarantee in I1: an address already on the canvas survives planning untouched, and
because the lab is configured from the plan, the routers get it.

The corollary, which was a real defect until fixed: **changing the class on an
already-addressed link did nothing at all.** The held subnet was honoured and the
chosen class silently discarded, with the backend reporting the old class back.
The fix is in the UI, not the allocator — `CablePropertiesPanel` now clears
`subnet`/`subnetMask`/`sourceIp`/`targetIp` alongside the class, which puts the
link back into the unaddressed set of diagram 2 so it is genuinely renumbered.

---

## 5. `deploy` — build, start, configure, prove

`backend/lab_deploy.py:1002`

```mermaid
flowchart TD
    TOPO["drawn topology"] --> RP["resolve_plan — diagram 3"]
    RP -->|DeployError| FAIL(["HTTP 400 with the reason"])
    RP --> PLAN["plan: routers, links, areas"]

    PLAN --> WRITE["write_files(plan)<br/>docker-compose.yml<br/>per-router frr.conf<br/>networks n00, n01 …"]
    WRITE --> CLIENT["docker client"]
    CLIENT --> FREE["_free_container_names<br/>replace any container already<br/>holding a planned router name<br/>two labs cannot share names"]
    FREE --> UP["docker compose up -d"]

    UP --> UPC{"exit code 0?"}
    UPC -- no --> E1["DeployError: docker compose could not<br/>start the lab + stderr tail"]
    UPC -- yes --> WAIT["poll every container<br/>until all are 'running'<br/>or 90s deadline"]

    WAIT --> WAITQ{"all running?"}
    WAITQ -- no --> E2["DeployError: containers did not all<br/>reach 'running'"]
    WAITQ -- yes --> CONF["configure(plan, client)<br/>— diagram 6"]
    CONF -->|DeployError| E3["DeployError: the generated OSPF<br/>configuration did not match<br/>the running lab: reasons"]
    CONF --> SAVE["save_plan(plan, assignments)<br/>backend/labs/current/plan.json<br/>gitignored — it is output"]
    SAVE --> SETTLE["sleep 12s — OSPF needs to form<br/>adjacencies before anything<br/>is worth measuring"]
    SETTLE --> OK(["200: routers, links, areas,<br/>interface assignments"])

    ERR["POST /api/lab/deploy/teardown"] --> DOWN["compose down --volumes --remove-orphans"]

    style CONF fill:#fdf0e6,stroke:#b5651d
```

**Deploy never restarts the lab.** The containers are created with a minimal
`frr.conf` and the real configuration is pushed into the *running* `vtysh`.
Interface names (`eth0..ethN`) are not stable across a Docker restart — they are
handed out in a different order — so a config generated from a pre-restart reading
lands each area and cost on the **wrong interface**, and FRR accepts it without
complaint. The lab then looks healthy while OSPF silently runs on the wrong links.
Chasing the mapping across restarts does not converge; never restarting does.

---

## 6. `configure` — vtysh plus read-back

`backend/lab_deploy.py:743`

```mermaid
flowchart TD
    START(["configure(plan, client)"]) --> ATTEMPT{"attempt 1..3"}

    ATTEMPT --> READ["_read_interfaces<br/>read the live iface → ip mapping<br/>from every container<br/>(60s deadline)"]
    READ --> BYIP["invert the mapping:<br/>address → interface"]

    BYIP --> RLOOP{"for each router"}
    RLOOP --> EXIST["_read_ospf_interfaces — ONE call per router<br/>replaces one vtysh call per link"]
    EXIST --> CMDS["start the command list:<br/>router ospf<br/>ospf router-id x.x.x.x"]

    CMDS --> LLOOP{"for each link touching<br/>this router"}
    LLOOP --> FIND{"the interface holding<br/>this link's address?"}
    FIND -- "not found" --> PROB["record problem:<br/>no interface holding that address"]
    FIND -- found --> P2P["interface &lt;iface&gt;<br/>ip ospf network point-to-point"]
    P2P --> AREACHK{"already has an area<br/>that DIFFERS from the plan?"}
    AREACHK -- yes --> NOAREA["emit 'no ip ospf area'<br/>FIRST — FRR refuses to overwrite<br/>an area in place, and still exits 0"]
    AREACHK -- "no, or already correct" --> SETAREA["ip ospf area &lt;n&gt;<br/>ip ospf cost &lt;c&gt;<br/>exit"]
    NOAREA --> SETAREA
    SETAREA --> LLOOP2{"more links?"}
    LLOOP2 -- yes --> LLOOP
    LLOOP2 -- no --> SEND

    PROB --> SEND["_vtysh: pipe the whole stanza through<br/>sh -c 'printf ... | vtysh'<br/>separate -c args each run in EXEC mode<br/>and 'configure terminal' is rejected"]
    SEND --> CHK{"exit code, or a '%' line<br/>in the transcript?"}
    CHK -- rejected --> PROB2["record problem: vtysh rejected"]
    CHK -- accepted --> RLOOP2
    PROB2 --> RLOOP2
    RLOOP2 --> RLOOP

    RLOOP --> APPLY["RE-READ 'show ip ospf interface'<br/>on every router"]
    APPLY --> VERIFY["_verify_applied — compare what the routers<br/>REPORT against what was ASKED:<br/>interface in OSPF? area matches?<br/>cost matches? no duplicate addresses?"]

    VERIFY --> PROBOK{"any problems?"}
    PROBOK -- "no" --> PERSIST["_write_configs(plan, readings)<br/>persist frr.conf per router"]
    PERSIST --> DONE(["return the verified<br/>interface assignments"])

    PROBOK -- yes --> RETRY{"attempt &lt; 3?"}
    RETRY -- yes --> SETTLE["sleep 6s<br/>OSPF needs a moment"] --> ATTEMPT
    RETRY -- no --> RAISE(["DeployError listing every problem"])

    style VERIFY fill:#eef7ee,stroke:#3d7a3d
    style NOAREA fill:#ffe8e8,stroke:#b33
```

### Why verification is a read-back and not an exit status

`vtysh` exits **0** while rejecting lines. Two specific cases:

- `ip ospf area <n>` answers `Must remove previous area config before changing ospf area` and still exits 0.
- Any unknown command likewise exits 0.

So an exit code cannot distinguish "applied" from "silently refused". The only
honest check is to ask the router what it actually has, which is
`show ip ospf interface` — an interface only appears there once OSPF is
operational, so a configured-but-down interface is correctly reported as *absent*
rather than as being in area 0.

Area state read this way also means **ABR status is derived** from a router actually
holding interfaces in more than one area, rather than asserted.

---

## 7. OSPF path resolution — two live sources, or a raised refusal

`backend/ospf_ai_service.py:672` (`compare_ospf_vs_ai`). Which path is "the OSPF
path" is the single most consequential decision on the Analytics page.

```mermaid
flowchart TD
    SRC["source, destination"] --> E2E["0. measure_path end-to-end FIRST:<br/>ping + traceroute, 12 ICMP requests<br/>(the refusal below quotes this measurement)"]
    SRC --> RIB["1. ospf_rib_path<br/>each router's 'show ip route ospf',<br/>longest-prefix walk over graph G — diagram 8"]
    SRC --> TRACE["2. real_ospf_path<br/>traceroute: what is ACTUALLY<br/>being forwarded right now"]

    RIB --> RIBOK{"RIB walk succeeded AND<br/>ends at the destination?"}
    RIBOK -- yes --> PICK1["OSPF PATH = RIB<br/>basis: 'OSPF RIB on each router<br/>(show ip route ospf)'"]
    RIBOK -- "no, or empty" --> TOK{"traceroute complete AND<br/>last hop == destination?"}
    TOK -- yes --> PICK2["OSPF PATH = traceroute<br/>basis: 'Live forwarding path'"]
    TOK -- no --> RAISE["RAISE LabUnavailable (HTTP 503):<br/>the pair is not measurable. The message is<br/>_diagnose(end_to_end), e.g. 'Path breaks after<br/>3 hop(s); the remaining hops did not<br/>answer ICMP.' — what was OBSERVED, not modelled"]

    PICK1 --> MEAS["_measure_path_hops — diagram 11"]
    PICK2 --> MEAS

    NOTE["traceroute is kept SEPARATELY as path_taken:<br/>it is the ground truth for what is<br/>actually being forwarded"] -.-> TRACE
    KILL["There is NO modelled fallback.<br/>ospf_path() (hand-rolled undirected Dijkstra)<br/>is deleted: it can disagree with FRR, and it<br/>usually duplicated the AI path."] -.-> RAISE

    style RIB fill:#eef7ee,stroke:#3d7a3d
    style TRACE fill:#fdf0e6,stroke:#b5651d
    style RAISE fill:#fbe9e9,stroke:#a33
```

### Why the RIB is authoritative and traceroute is not

Reading "the OSPF path" from traceroute is **circular once the lab is steered**: a
static route makes traceroute report the AI path back, and calling that "the OSPF
path" means the page compares the AI path against itself and always declares a
match. The RIB is unaffected by injected static routes, so it is what OSPF itself
would forward.

A hand-rolled SPF is unreliable in general and is **deleted here entirely**, not
kept as a labelled last resort. **OSPF charges cost on each router's own outgoing
interface** — RFC 2328 §2.1.2 states that "a cost is associated with the output
side of each router interface" and models the result as a *directed* graph — so an
interface can cost 5 outbound and 20 on the return direction, which a symmetric
undirected graph cannot express. In *this* lab that particular trap is not armed
(`ip ospf cost {link cost}` is applied to both ends), but the modelled path had two
failings that did apply: the RIB remains the authority on what OSPF would forward,
and the modelled path usually duplicated the AI path, making it an unhelpful third
answer. So when the RIB walk fails *and* the traceroute does not reach the
destination, the comparison raises — with the measured end-to-end probe's observed
reason — instead of inventing a route the routers were never asked about.

### `lab_graph` — the routable graph

Built once per comparison and reused by every algorithm below. It is **live-state
aware**: an interface that is administratively down, or shaped by `tc`, changes
what the graph may claim.

```mermaid
flowchart TD
    LAB["discovered lab"] --> COSTS["_interface_costs<br/>ONE 'vtysh -c show running-config' per router,<br/>split into interface stanzas<br/>vtysh has no per-interface config subcommand"]
    LAB --> COND["_link_conditions: ONE exec per device<br/>'ip -br link; echo ===TC===; tc qdisc show'<br/>5 s TTL cache; /api/lab/link and<br/>/api/lab/impair invalidate it explicitly"]
    COSTS --> TRANSIT["for each TRANSIT link:<br/>edge cost = the live 'ip ospf cost' on<br/>router A's interface in that subnet<br/>(fallback 10 if unreadable)<br/>SKIPPED if the interface is down at either end"]
    COND --> TRANSIT
    COSTS --> LAN
    COND --> LAN["for each LAN segment<br/>(grouped by bridge name):<br/>the ONE router on the segment is the<br/>gateway for its other members<br/>— also skipped if down at either end"]
    TRANSIT --> JOIN["graph G<br/>cost from the live OSPF config;<br/>latency / bandwidth / loss merged from the<br/>tc state of BOTH link ends (delays add,<br/>loss 1-(1-a)(1-b), rate = min)"]
    LAN --> JOIN

    NOTE["Why this matters: 80 ms netem on R2–R11<br/>leaves OSPF on that link (tc does not change<br/>cost) and sends the AI around R3→R9→R10 —<br/>a difference driven by measured tc state.<br/>A failed exec treats the device as UP: fail<br/>open, never guess an edge out of existence."] -.-> JOIN

    NOTE2["Why transit-only: 'show ip route ospf' on r1<br/>lists exclusively 10.0.0.0/8 prefixes — the 192.168.x<br/>LANs appear only as connected routes on their<br/>own gateway. Hop identity is resolved by SUBNET<br/>MEMBERSHIP, not exact IP equality, because R1 is<br/>10.0.0.10 and R12 is 10.0.0.11 on the same /29."] -.-> JOIN

    style COSTS fill:#e8f4f8,stroke:#0d6e85
    style COND fill:#e8f4f8,stroke:#0d6e85
```

---

## 8. `_rib_walk` — walking the OSPF RIB

`backend/ospf_ai_service.py:812`

```mermaid
flowchart TD
    A["walk(lab, source, destination, target_ip)"] --> INIT["path = [source]<br/>metric = 0<br/>current = source"]
    INIT --> LOOP{"12 iterations max<br/>a routing loop must not<br/>hang the request"}

    LOOP --> ATDEST{"current == destination?"}
    ATDEST -- yes --> DONE
    ATDEST -- no --> DIRECT{"_directly_linked(current, destination)?<br/>OSPF always prefers a connected route"}
    DIRECT -- yes --> APPEND["append destination, break"]

    DIRECT -- no --> GETDEV["find the device for 'current'"]
    GETDEV --> SHOW["vtysh -c 'show ip route ospf'"]
    SHOW --> PARSE["_parse_ospf_rib → entries"]
    PARSE --> LOOKUP{"_ospf_nexthop(entries, target_ip)<br/>longest-prefix match"}
    LOOKUP -- "none" --> BREAK1["break — OSPF has no route from here.<br/>Stopping beats inventing a hop."]
    LOOKUP -- found --> ACC["metric += entry metric"]
    ACC --> WHO{"_device_for_address(next_hop)"}
    WHO -- "unknown device" --> BREAK2["break"]
    WHO -- found --> CYCLE{"next_device already in path?"}
    CYCLE -- yes --> BREAK3["break — loop guard on DEVICES,<br/>not on addresses"]
    CYCLE -- no --> ADVANCE["path.append(next_device)<br/>current = next_device"] --> LOOP

    BREAK1 --> DONE
    BREAK2 --> DONE
    BREAK3 --> DONE
    APPEND --> DONE
    DONE --> VALID{"path[0] == source<br/>AND path[-1] == destination?"}
    VALID -- "no" --> NONE["return None — the walk ran out of<br/>OSPF knowledge. Appending the destination<br/>would manufacture a path no router forwards."]
    VALID -- yes --> RET["return (metric, path)"]

    style DIRECT fill:#eef7ee,stroke:#3d7a3d
```

### The `directly_linked` check is the fix for "no valid path"

Without it the walk kept consulting the RIB and could be sent back the way it came:
asking R2's RIB for `10.5.0.2` (R11's link to R12) makes R2 point at R1 — a hop
already visited — and the caller then saw **"no valid path" on a topology with an
obvious one**.

### Multi-homed destinations

Every address of the destination is a separate OSPF destination, and on a
multi-homed router they do **not** all route the same way (R10 is reachable from R2
over its R9 link at cost 35 but over its R11 link at 40). Each address is walked and
the cheapest wins, scored by the interface costs the running routers report.

The `[110/metric]` figure in the RIB is deliberately **not** used to rank them: it
is the distance from the *advertising* router and excludes that router's own egress
cost, so two walks diverging at different routers are not comparable and the
cheaper path can lose.

---

## 9. `rank_paths` — AI path scoring

`backend/ai_route_service.py:164`

```mermaid
flowchart TD
    G["live graph G<br/>diagram 7"] --> ALL["nx.all_simple_paths(G, source, destination, cutoff 10)"]
    ALL --> NOPATH{"NoPath, or empty?"}
    NOPATH -- yes --> E1["return {error: no path found}"]
    NOPATH -- no --> CAP{"more than 400 candidate paths?"}
    CAP -- yes --> TRIM["keep the 400 SHORTEST<br/>guard against combinatorial blow-up"]
    CAP -- no --> FEAT
    TRIM --> FEAT["extract_path_features per path:<br/>[total_latency, loss%, min_bandwidth,<br/>hop_count, total_cost, congestion]<br/>— the exact DB training column order"]

    FEAT --> NORM["min-max normalise ACROSS the candidate set,<br/>so the ranking is relative to the<br/>alternatives that actually exist:<br/>latency (lower better)<br/>bandwidth (higher better)<br/>loss (lower better)<br/>cost (lower better)"]
    NORM --> FIT["_fit_random_forest:<br/>RandomForestClassifier(100 trees,<br/>seed 42) on rows from SQLite<br/>origin='measured'"]

    FIT --> HASRF{"training rows present?"}
    HASRF -- no --> HEUR["congestion term = 1 - heuristic feature<br/>model reported as 'heuristic'"]
    HASRF -- yes --> PROBA["rf.predict_proba(features)<br/>map class → weight:<br/>Low 1.0, Medium 0.5, High 0.0"]

    HEUR --> SCORE
    PROBA --> SCORE["quality = 0.25·lat + 0.25·bw<br/>+ 0.15·loss + 0.05·cost<br/>+ 0.30·congestion<br/>higher is better"]

    SCORE --> SORT["sort by quality, descending"]
    SORT --> BEST["best = ranked[0]"]
    BEST --> CONF["confidence = min(99,<br/>55 + margin·180 + congestion·30)<br/>margin = best − runner-up"]
    CONF --> OUT(["{best, ranking, confidence, model}"])

    style FIT fill:#eef7ee,stroke:#3d7a3d
    style SCORE fill:#fdf0e6,stroke:#b5651d
```

### Why not `max(predict_proba(...))`

The original implementation argmax'd a 3-class congestion classifier. That is not a
path comparison: a path can have high confidence of being *Low* congestion while
another path is strictly better on every axis, and the classifier has no notion of
"better path". It reliably picked the wrong route.

### What the RF contributes, and what it does not

The Random Forest contributes **exactly one term** — the congestion score, weighted
`0.30`. It does not invent any displayed measurement. Every figure in the
comparison table (latency, loss, hop count, cost, throughput) comes from a
measurement; the candidate rows in `ai_ranking` are labelled `measured: false` and
carry `ai_ranking_basis` stating they are graph estimates. Only the **selected**
path is measured — probing every candidate would mean a ping burst per path.

---

## 10. `compare_ospf_vs_ai` — the Analytics run

`backend/ospf_ai_service.py:471` · `POST /api/analytics/live`

```mermaid
flowchart TD
    REQ["source, destination, method, packet_count=12"] --> DISC["discover_lab()"]

    DISC --> ONLINE{"lab online?"}
    ONLINE -- no --> E1["LabUnavailable → 503<br/>'Lab not running'"]
    ONLINE -- yes --> MEMBERS{"both endpoints in<br/>the lab's ip_index?"}
    MEMBERS -- no --> E2["LabUnavailable: not part of<br/>the running lab"]
    MEMBERS -- yes --> METHOD{"method in ROUTING_METHODS?<br/>{ospf, ai}"}
    METHOD -- no --> E3["LabUnavailable: unknown method"]
    METHOD -- yes --> G["G = lab_graph(lab)"]

    G --> OSPFPATH["resolve OSPF path — diagram 7<br/>RIB → traceroute → raise with diagnosis"]
    OSPFPATH --> OSPFM["_measure_path_hops(ospf) — diagram 11"]
    OSPFM --> AIPATH["rank_paths(G, s, d) — diagram 9"]
    AIPATH --> AIM["_measure_path_hops(ai)"]

    AIPATH --> E2E

    subgraph E2E["End-to-end, from the real source container"]
        direction TB
        E0["measure_path(source, destination, count=12)"] --> ETRY["try EACH of the destination's addresses<br/>in turn — a multi-homed device may have<br/>one that is unroutable from here.<br/>First one that answers wins."]
        ETRY --> ETR["traceroute, up to 3 attempts with<br/>-i 1 -q 1 — FRR rate-limits ICMP replies,<br/>so one run can return '*' mid-trace.<br/>The most complete run wins, earlier<br/>answers kept where a later run blanks."]
        ETR --> ERES["resolution = 100/12 = 8.33%<br/>loss is a ratio of whole packets:<br/>6 packets cannot express a loss<br/>below 17%, so one drop read as 1/6"]
    end

    E2E --> RESOLVE["resolve_traced_hops — map each hop's<br/>ANSWERING ADDRESS back to its device.<br/>The address is the only thing that<br/>identifies which router forwarded it."]
    RESOLVE --> GAPS{"any hop with no owner<br/>('?hopN') in the chain?"}
    GAPS -- yes --> INCOMPLETE["path_taken_complete = false<br/>path_taken = []<br/>path_taken_gaps = the holes"]
    GAPS -- no --> COMPLETE["path_taken = the walked chain"]

    INCOMPLETE --> VERDICT
    COMPLETE --> VERDICT["_matches_method / _forwarding_method:<br/>which methods does the traced path<br/>AGREE with, and which single method<br/>does it correspond to?"]

    VERDICT --> ACTIVE["_active_method — report in_effect honestly:<br/>'the routers are forwarding this path'<br/>vs 'selected, but the routers are still<br/>forwarding OSPF; apply to install a route'"]
    ACTIVE --> BUILD["_build_comparison — diagram 12"]
    BUILD --> DIAG{"_diagnose — explain WHY<br/>if unreachable"}
    DIAG --> CONV{"convergence requested<br/>and a transit link exists?"}
    CONV -- yes --> CONVM["measure_convergence — diagram 16"]
    CONV -- no --> OUT
    CONVM --> OUT(["200: ospf, ai, comparison rows,<br/>path_taken, end_to_end,<br/>ai_ranking, model, confidence,<br/>active, convergence"])

    style E2E fill:#e8f4f8,stroke:#0d6e85
    style VERDICT fill:#eef7ee,stroke:#3d7a3d
```

### Why 12 packets

Loss is a ratio of whole packets, so with *N* requests the smallest loss expressible
is `1/N`. At the old `N=6` one dropped packet read as "17% loss" and no figure below
that was possible at all. At `N=12` a single drop reads as 8%, and `1%` would need
`N=100`. The response therefore carries `loss_resolution_percent` so the UI can
state the precision it actually had instead of implying more.

### Gapped chains are reported, not reconciled

A hop nobody answered for leaves a hole in the chain, so the walked path cannot be
compared against a computed one. Reporting a *mismatch* there would invent a fact;
claiming a *match* would be worse. The page shows the gaps.

---

## 11. `_measure_path_hops` — the noise floor

`backend/ospf_ai_service.py:352`. This is where latency becomes trustworthy.

```mermaid
flowchart TD
    PATH["a path of N routers"] --> SHORT{"N &lt; 2?"}
    SHORT -- yes --> NONE["{segments: [], total_latency_ms: null,<br/>reachable: false}"]
    SHORT -- no --> SEG["for each consecutive pair (src, dst)"]

    SEG --> CAND["candidate targets = the addresses on the<br/>connecting subnet, else any address of dst"]
    CAND --> PING{"for each candidate:<br/>ping -c 4 -i 0.15<br/>keep the first result,<br/>prefer any that answers"}
    PING --> SEGMENT["segment = {latency_ms: rtt_avg,<br/>jitter_ms, loss_percent, reachable, command}"]
    SEGMENT --> ACC{"rtt_avg available?"}
    ACC -- yes --> ADD["total_latency += rtt_avg<br/>measured += 1"]
    ACC -- no --> NOADD
    ADD --> NEXTSEG
    NOADD --> NEXTSEG{"more segments?"}
    NEXTSEG -- yes --> SEG
    NEXTSEG -- no --> AGG

    subgraph AGG["Aggregation — the honest part"]
        direction TB
        W["worst_segment_loss = MAX(losses)<br/>the WORST segment, never the mean:<br/>averaging would let a completely<br/>dead hop read as a small number"]
        M["latency_margin_ms = sqrt( Σ jitter² )<br/>each segment's jitter_ms is the standard deviation<br/>of that segment's own RTT samples, so for a sum of<br/>independent segments the uncertainty of the total<br/>is the root-sum-square of theirs"]
    end

    AGG --> RET["{segments, total_latency_ms,<br/>latency_margin_ms,<br/>worst_segment_loss_percent,<br/>measured_segments, reachable}"]

    style M fill:#fff4e6,stroke:#b5651d
```

### Why the margin exists at all

Every hop in this lab is a veth pair, which has **no real propagation delay** — a
four-hop path measures around 0.4 ms, essentially all of it Linux scheduling jitter
between separate `docker exec` spawns. Measured on an *unchanged* path:

```
R1 → R9, six runs:  0.304  0.412  0.352  0.389  0.331  0.367  ms
                    spread 0.108,  stdev 0.045
```

On `R12 → R9` the OSPF-minus-AI difference fell **inside the measured spread in 5
of 6 runs** — yet the table printed a winner and a precise percentage. The numbers
were honest; the conclusion drawn from them was not. Carrying the margin beside
every figure lets the comparison decide in diagram 12.

---

## 12. Latency verdict — is the gap real?

`backend/ospf_ai_service.py:1186` · `_build_comparison`. Invariant **I5**.

```mermaid
flowchart TD
    OSPF["ospf_latency_ms<br/>ospf_latency_margin_ms"] --> M["lat_margin = sqrt(<br/>ospf_margin² + ai_margin²)<br/>combined uncertainty of the difference"]
    AI["ai_latency_ms<br/>ai_latency_margin_ms"] --> M

    M --> AVAIL{"both latencies<br/>present?"}
    AVAIL -- no --> NA["winner: 'n/a'<br/>detail: 'not comparable'"]
    AVAIL -- yes --> GAP["lat_gap = |ai_lat − ospf_lat|"]

    GAP --> CLEARS{"lat_gap > lat_margin ?<br/>does the difference exceed<br/>the wobble in our own<br/>measurement of it?"}

    CLEARS -- "YES — the gap is real" --> WIN["winner = _winner(lower is better)<br/>detail: '+12.4% vs OSPF, clear of the<br/>±0.061 ms measurement spread'"]
    CLEARS -- "NO — inside the noise" --> TIE["winner: 'tie'<br/>detail: '+0.037 ms apart, inside the<br/>±0.061 ms measurement spread'"]

    WIN --> ROWS
    NA --> ROWS
    TIE --> ROWS

    subgraph ROWS["Every row carries its own basis"]
        direction TB
        R1["Latency (RTT) — margin-gated, diagram above"]
        R2["Hop Count — pure integer difference, cannot be noise"]
        R3["Path Cost — sum of the routers' live 'ip ospf cost'"]
        R4["Min Link Speed — bottleneck /sys/class/net speed,<br/>null when the kernel does not know it"]
        R5["Worst Packet Loss — worst hop-to-hop ping on the path"]
        R6["Measured Segments — how many pings actually ran"]
        R7["Reachable — did all hops answer"]
    end

    ROWS --> OUT(["comparison.rows[] — parameter, ospf, ai,<br/>winner, detail — plus end_to_end"])

    style CLEARS fill:#eef7ee,stroke:#3d7a3d
    style TIE fill:#fff4e6,stroke:#b5651d
```

`detail` is a rendered column, not a debug field — the reader can see *why* a row
says what it says.

### One row is decorative in this lab

**Min Link Speed** reads `10000 Mbps` on every path because all veths report the
same synthetic 10 Gbps. It can never discriminate between two paths in this lab, so
that row cannot decide anything. The real capacity figure is measured throughput
(diagram 15), which reads ~6.58 Mbps on a clean link. `link_speed_mbps` returns
`None` on `-1`/0 rather than substituting a plausible default.

---

## 13. Steering the data plane

`backend/route_steer.py` · `POST /api/lab/route`

```mermaid
flowchart TD
    REQ["method, source, destination,<br/>apply: true | false"] --> PLAN["path_for_method(lab, method, s, d)<br/>computed FRESH from the lab —<br/>must not depend on a prior analytics call"]

    PLAN --> REVMETHOD{"method == 'ospf' ?"}
    REVMETHOD -- yes --> NOOP["reason: 'OSPF is already in effect'<br/>NOT a short-circuit that skips the removal.<br/>apply:false and method:'ospf' share<br/>the SAME removal path."]

    REVMETHOD -- "no (ai)" --> HOPPLAN["steer_plan — build one static route<br/>PER TRANSIT HOP, not just the source"]

    HOPPLAN --> NOADDR{"destination has<br/>a known IP?"}
    NOADDR -- no --> NA1["not applicable: no address known"]
    HOPPLAN --> EACH{"for each consecutive pair (a, b):<br/>hop_plan — is the next hop<br/>DIRECTLY ATTACHED to a?"}
    EACH -- "no" --> NA2["not applicable: a static route can only<br/>hand traffic to a directly connected<br/>neighbour, so every hop must be adjacent"]
    EACH -- yes --> ACC["accumulates {container, interface,<br/>subnet, next_hop, prefix, command}"]
    ACC --> ALLHOP{"all hops ok?"}
    ALLHOP -- no --> NA2
    ALLHOP -- yes --> PLANOK(["{applicable: true, hops[], commands[],<br/>reason: 'Installs N static routes, one per<br/>transit hop, pinning DEST along A→B→C.<br/>Static routes beat OSPF, so FRR forwards<br/>this path until they are removed.'}"])

    PLANOK --> APPLYQ{"apply == true?"}
    APPLYQ -- no --> SHOWONLY(["200: the plan only — the UI can show<br/>what would change and refuse with a reason"])
    APPLYQ -- yes --> INSTALL

    subgraph INSTALL["apply_steer — all-or-nothing"]
        direction TB
        I1["group hops BY CONTAINER<br/>one vtysh session per router — sending every<br/>hop to a single container silently installs<br/>the later hops on the wrong router"]
        I1 --> I2["install every hop's command"]
        I2 --> I3{"any hop rejected?"}
        I3 -- yes --> ROLLBACK["REMOVE the routes already accepted<br/>before raising — a partially applied<br/>path is not left behind"]
        I3 -- no --> CONFIRM["verify with 'show ip route static'"]
    end

    ROLLBACK --> E1(["LabUnavailable"])
    CONFIRM --> OK(["200: routes now installed"])

    NOOP --> REVERTQ{"apply == false,<br/>or method == 'ospf'?"}
    REVERTQ -- yes --> REV["revert_steer(container, prefix,<br/>next_hop, interface)"]
    REV --> REVPREC["all THREE of prefix, next hop and<br/>interface must match exactly — FRR answers<br/>'Command incomplete' without all three,<br/>and the route SURVIVES.<br/>(Parsing must not swallow the trailing comma.)"]
    REVPREC --> REVOUT(["200: pinning routes removed —<br/>the routers are forwarding OSPF again"])
    NA1 --> SHOWONLY
    NA2 --> SHOWONLY

    style INSTALL fill:#fdf0e6,stroke:#b5651d
    style REVPREC fill:#ffe8e8,stroke:#b33
```

### Why pinning only the source is insufficient

Tried and measured: pinning R1 alone to send via R2 produced
`R1 → R2 → R3 → R12 → R11`, because **R2's own OSPF still chose its own way onward**.
Only the first hop was pinned. Static routes must be installed on every transit hop.

### "Select OSPF" and "revert to OSPF" are one operation

The endpoint used to short-circuit on `method: "ospf"` and report *"OSPF is what the
routers already forward with nothing injected"* **without checking whether anything
had been injected**. The pinning static routes stayed on every hop and the routers
kept forwarding the deselected AI path while the response claimed no change was
needed. `apply: false` and `method: "ospf"` now share the removal path, and the UI
enables *Revert to OSPF* whenever the routers are forwarding something other than
the OSPF path — which includes the exact state where OSPF is selected *because*
steering to AI left it in effect.

`dijkstra` is rejected with a clean **503**, not a 500: `path_for_method` raises
`LabUnavailable`, which the handler converts.

---

## 14. `apply_impairment` — tc chaining

`backend/metrics_collector.py:701` · `POST /api/lab/impair`

```mermaid
flowchart TD
    REQ["container, interface,<br/>delay, jitter, loss, corrupt,<br/>duplicate, reorder, bandwidth"] --> BUILD["assemble the netem parts list:<br/>delay Xms (+ Yms jitter)<br/>loss X% · corrupt X%<br/>duplicate X% · reorder X%"]

    BUILD --> RATE{"a bandwidth limit<br/>requested?"}
    RATE -- yes --> DEL["tc qdisc del dev &lt;if&gt; root<br/>start from a known state so 'replace'<br/>cannot collide with a leftover"]
    DEL --> TBF["tc qdisc REPLACE dev &lt;if&gt; ROOT handle 1:<br/>tbf rate &lt;N&gt;mbit burst 32k latency 400ms"]
    TBF --> NETEMQ{"netem parts<br/>present?"}
    NETEMQ -- yes --> CHILD["tc qdisc REPLACE dev &lt;if&gt; PARENT 1:1<br/>handle 10: netem &lt;parts&gt;<br/>— attached as a CHILD"]
    NETEMQ -- no --> RUN
    CHILD --> RUN

    RATE -- "no, but netem present" --> ROOTNETEM["tc qdisc REPLACE dev &lt;if&gt;<br/>ROOT netem &lt;parts&gt;"] --> RUN
    RATE -- "no netem either" --> CLEARED["nothing to do — an untouched link<br/>is already clear"]

    RUN["execute each command"] --> ERR{"any non-zero exit?"}
    ERR -- yes --> BAD["report applied: false + the<br/>failing command and its output"]
    ERR -- no --> GOOD(["{applied: true, commands[]}"])

    CLEARED --> CLEAR["'clear': true →<br/>tc qdisc del dev &lt;if&gt; root<br/>'handle of zero' / 'No such file'<br/>means ALREADY CLEAR, not a failure"]

    style CHILD fill:#fff4e6,stroke:#b5651d
```

### Why tbf is the root and netem is a child

An interface can have only **one root qdisc**. Installing both as `root` means the
second `add` is rejected with "File exists", the rate limit is **silently never
applied**, and the link looks loaded in the request while carrying no real queue
pressure. Chaining `tbf` (root) with `netem` (child under `parent 1:1`) is the
arrangement that actually produces backlog and drops.

Verified: 80 ms netem on `r1/eth0` produced 80.285 ms latency and 3 qdisc drops.
Queue length and qdisc drops are legitimately `0` on a clean link.

---

## 15. `measure_bandwidth` — real throughput

`backend/metrics_collector.py:585` · `POST /api/lab/bandwidth`

```mermaid
flowchart TD
    START(["measure_bandwidth(container, [peer_ips], duration=2s)"]) --> BEFORE["read /proc/net/dev<br/>BEFORE — rx_bytes, tx_bytes per interface"]

    BEFORE --> STIM["stimulus: ping -s 4000 -i 0.01 -c N -W 1<br/>~6.6 Mbps of real bytes.<br/>iperf3 is absent from every lab image<br/>(alpine and frr alike)"]
    STIM --> SLEEP["sleep duration"]
    SLEEP --> MID["read /proc/net/dev again"]
    MID --> MOVED{"any interface other than 'lo'<br/>moved?"}

    MOVED -- "no" --> RETRY["kill the stimulus, then retry ONCE<br/>with the plain form: ping -s 84 -i 0.05<br/>so a reported zero means NOTHING WAS<br/>FORWARDED, not 'the flag was too fast'"]
    MOVED -- yes --> KILL
    RETRY --> KILL["kill every stimulus process"]
    KILL --> DELTA

    subgraph DELTA["Per-interface deltas — not a sum"]
        direction TB
        D1["for each interface: rx = max(0, after−before)<br/>tx = max(0, after−before)<br/>discard interfaces that did not move"]
        D2["busiest = the interface with the<br/>largest rx+tx — the probe is ONE flow,<br/>crossing ONE egress link. Summing every<br/>interface folds in unrelated traffic"]
        D3["throughput_mbps = (rx+tx)·8 / duration / 1e6<br/>measured_interface + per_interface reported alongside"]
    end

    DELTA --> OUT(["{measured_interface, per_interface,<br/>rx_bytes, tx_bytes, throughput_mbps,<br/>utilization_percent, sample_seconds}"])

    style D2 fill:#fff4e6,stroke:#b5651d
```

### Two corrections encoded here

- **The requested destination is the one measured.** The endpoint used to ignore
  `destination` and ping every adjacent peer, so the throughput figure sat beside a
  latency/loss/hop count for a *different* pair. Adjacency was never necessary: the
  counters being sampled are the source container's own, and they move for a remote
  destination exactly as for a neighbour. R1→R9 across three hops and two areas
  moved 822 KB in the same 2 s sample that R1→R2 did.
- **A heavy stimulus or it measures the packet rate.** `ping -i 0.05` on a default
  84-byte echo request offers about 0.03 Mbps of load — that is a packet rate, not a
  link rate.

Verified responsive to shaping: R12→R5 reads 6.576 Mbps, 3.411 Mbps under
`tc tbf rate 2mbit` on `r12/eth0`, 6.576 Mbps cleared.

---

## 16. `measure_convergence` — timed failure

`backend/convergence.py:30` · `POST /api/lab/convergence`

```mermaid
flowchart TD
    START(["source, destination, link {container, interface}, timeout 60s"]) --> LAB["discover_lab; resolve ids to<br/>container + target IP"]
    LAB --> BEFORE["ip -s link show &lt;if&gt;<br/>was the link already up?"]

    BEFORE --> ALT{"_has_alternate_path(lab, container, iface)<br/>is there a second route across?"}
    ALT --> BASE["baseline ping (2 × 0.1s)"]
    BASE --> T0["t0 = perf_counter"]
    T0 --> DOWN["ip link set &lt;if&gt; DOWN"]

    DOWN --> POLL{"loop while<br/>elapsed &lt; 60s:<br/>ping -c 1 -i 0.05<br/>reachable?"}
    POLL -- no --> SLEEP["sleep 0.25s"] --> POLL
    POLL -- "yes" --> RECOVERED["recovered_after = perf_counter − t0<br/>break"]

    POLL --> FIN["finally:"] --> RESTORE["restore the link UP<br/>— ALWAYS, whatever happened.<br/>Leaving it down silently changes the<br/>network for everything measured after."]
    RECOVERED --> FIN
    RESTORE --> AFTER["ping -c 3 post-recovery"]

    AFTER --> CUT{"no alternate path<br/>AND nothing recovered?"}
    CUT -- yes --> NOTE["note: 'This link is the only route between<br/>its two ends, so there is nothing to fail over<br/>to. Convergence is UNDEFINED for it,<br/>not unmeasured.'<br/>destination_avoided_failed_link = true"]
    CUT -- no --> OK

    NOTE --> OUT(["{convergence_ms, detected, baseline_reachable,<br/>recovered_reachable, post_recovery_latency_ms,<br/>poll_attempts, link_restored, link_was_down_before,<br/>alternate_path_exists, note}"])
    OK --> OUT

    style RESTORE fill:#ffe8e8,stroke:#b33
```

### Why the timeout is 60 s and three fields exist

OSPF's dead timer is **40 s**. A link carrying the only route to the destination
stays unreachable until it expires, and the adjacency rebuild takes a few more
seconds — a timeout below ~45 s reports `detected: false` for a case that is
working correctly.

- `link_restored` / `link_was_down_before` distinguish *"we put it back"* from
  *"we found it broken and left it that way"*.
- `alternate_path_exists` records that false convergence is a property of the
  *topology*, not of OSPF. On a cut edge (R2–R4, R4–R5, R4–R6) there is nothing to
  converge to.
- `destination_avoided_failed_link` catches the other false positive: a cut link can
  "converge" instantly when the measured pair never used it — R2→R6 does not cross
  R4–R5 — and calling that a convergence time measures a link the traffic avoided.

---

## 17. OSPF area change

`backend/ospf_area.py` · `GET/POST /api/lab/ospf/area`. The rules live in the
backend, not the UI, so they hold for any caller.

```mermaid
flowchart TD
    REQ["device, interface, target area"] --> READ["read_router_areas:<br/>'show ip ospf interface' + router-id"]

    READ --> KNOWN{"the interface is<br/>an OSPF interface<br/>on this router?"}
    KNOWN -- no --> E1["AreaError: it has no area to change"]
    KNOWN -- yes --> SAME{"already in<br/>the target area?"}
    SAME -- yes --> E2["AreaError: already in area X"]
    SAME -- no --> T0{"target == area 0?"}
    T0 -- yes --> E3["AreaError: 'Area 0 is the backbone. It cannot<br/>be assigned as a target: a backbone interface<br/>exists because the router BORDERS the backbone,<br/>not because someone renumbered it.'"]
    T0 -- no --> CUR0{"currently in<br/>area 0?"}
    CUR0 -- yes --> E4["AreaError: 'Moving it into area X would STRAND this<br/>router: non-backbone areas only learn about each<br/>other THROUGH area 0, so its neighbours would lose<br/>every inter-area route. Add an interface in the<br/>target area to make this router an ABR instead.'"]
    CUR0 -- no --> RANGE{"within the 32-bit<br/>OSPF area range?"}
    RANGE -- no --> E5["AreaError: outside the 32-bit OSPF area range"]
    RANGE -- yes --> OK

    OK --> Q{"apply, or preview?"}
    Q -- "preview — REQUIRED FIRST" --> PREV["preview_move — which currently-reachable<br/>pairs pass through this router?<br/>(from the /api/lab/reachability matrix)"]
    PREV --> PRESP(["{from_area, to_area, address, was_abr,<br/>would_become_abr, at_risk_pairs[],<br/>at_risk_count, warning}"])
    PREV --> APPLY

    Q -- "apply without a prior preview" --> REFUSE(["400: refused — a preview is required"])

    APPLY["apply_move — ONE config-mode pipe:<br/>printf 'configure terminal\ninterface &lt;if&gt;<br/>no ip ospf area\nip ospf area &lt;n&gt;\nend\n' | vtysh"] --> TRANSCRIPT{"vtysh exits 0 — but does the<br/>TRANSCRIPT contain a refusal?<br/>('unknown command' or a '%' line)"}
    TRANSCRIPT -- yes --> E6["AreaError: vtysh refused the area change,<br/>quoting the offending line"]
    TRANSCRIPT -- no --> READBACK["RE-READ 'show ip ospf interface'"]
    READBACK --> LANDED{"the interface now reports<br/>the target area?"}
    LANDED -- no --> E7["AreaError: the change did not land"]
    LANDED -- yes --> OUT(["200: post-change state, confirmed<br/>by reading the OSPF process back"])

    style CUR0 fill:#ffe8e8,stroke:#b33
    style READBACK fill:#eef7ee,stroke:#3d7a3d
```

### Two FRR behaviours that make read-back mandatory

1. `ip ospf area <n>` **does not overwrite** an existing area — FRR answers
   `Must remove previous area config before changing ospf area` and **still exits
   0**. So `no ip ospf area` must precede it, and only when the read-back differs.
2. Separate `-c` arguments each run in **exec mode**, so
   `vtysh -c "configure terminal" -c "interface eth0"` is rejected as an unknown
   command. Config lines go in through a `printf … | vtysh` pipe.

### Changing an area is a routing change

OSPF only forms adjacencies between interfaces in the **same** area, so moving one
side leaves the far side routing to nothing until it follows. That is why a preview
is mandatory, and why it reports the pairs at risk rather than simulating — OSPF
has no dry-run. Neighbours take one dead-timer interval (40 s) to re-form.

---

## 18. Dataset collection loop

`backend/dataset_collector.py` · `POST /api/dataset/collect`

```mermaid
flowchart TD
    START(["collect(max_pairs=66)"]) --> LAB["discover_lab; must be online"]
    LAB --> PAIRS["pairs = upper triangle of routers<br/>(R1,R2), (R1,R3) … [:66]"]
    PAIRS --> COSTS["_interface_costs — ONE config read per router,<br/>reused across every pair and profile"]

    COSTS --> OUTER{"for each pair (STRICTLY SERIALLY)"}
    OUTER --> LIVE["real_ospf_path → the live path"]
    LIVE --> PATH{"path found<br/>and a transit link<br/>identified?"}
    PATH -- no --> SKIP1["skip this pair — reported with a<br/>diagnosis, never as '100% loss'"]
    PATH -- yes --> INNER

    subgraph INNER["for each real impairment profile"]
        direction TB
        I0["clean {} · mild {8ms, 3ms jitter, 1%}<br/>moderate {55ms, 8ms, 2%} · heavy {45ms, 12ms, 6%}<br/>loaded {20ms, 3%, bandwidth 1 mbit}"]
        I0 --> I1{"impairment set?"}
        I1 -- yes --> I2["apply_impairment on the FIRST HOP's egress interface"]
        I1 -- "no" --> I4
        I2 --> I3{"tbf rate limit?"}
        I3 -- yes --> I3A["drive real ping load for 1.5s<br/>a rate limit only bites when there is<br/>traffic to queue"]
        I3 -- no --> I4
        I3A --> I4["BEFORE = queue state on every interface<br/>along the path (ip -s link + tc -s qdisc)"]
        I4 --> I5["throughput = measure_bandwidth(source→destination)<br/>sampled WHILE the profile is still in effect"]
        I5 --> I6["measurement = measure_path(count=4, traceroute)"]
        I6 --> I7["AFTER = queue state again"]
        I7 --> I8["finally: clear_impairment — ALWAYS,<br/>even if the measurement raised"]
    end

    I8 --> REACH{"reachable AND<br/>latency known?"}
    REACH -- no --> SKIP2["skip — an unreachable pair is not<br/>a training row"]
    REACH -- yes --> TP{"throughput number<br/>produced?"}
    TP -- "no — counters did not move" --> SKIP3["SKIP, do not write a placeholder.<br/>The old code wrote the profile's tbf rate<br/>(or a flat 1000 when there was none) — a<br/>configured number, not an observation."]
    TP -- yes --> FEAT["congestion = f(counter DELTAS):<br/>min(1, drops/20 + overlimits/20), +0.25 if errors<br/>cost = sum of the live 'ip ospf cost' in the<br/>direction of travel"]

    FEAT --> ROW["record_measurement(<br/>latency, loss, jitter, hop_count,<br/>bandwidth_mbps, total_cost, congestion,<br/>origin='measured')"]

    ROW --> OUTER
    SKIP1 --> OUTER
    SKIP2 --> OUTER
    SKIP3 --> OUTER
    OUTER --> DONE(["{stored, skipped, diagnosis, elapsed}"])

    style I8 fill:#ffe8e8,stroke:#b33
    style TP fill:#eef7ee,stroke:#3d7a3d
```

### Why it must be serial

Impairment lands on the **first hop's egress interface**, and several distinct pairs
share that interface — every R1 pair goes out of `r1`'s `eth0`. Parallel workers
would install competing `tc qdisc add root` rules on one interface, each
`clear_impairment` would tear down the others, and a 1 Mbps tbf limit would starve
unrelated measurements. That is exactly what made multi-hop pairs report as
unreachable.

### Why a clean lab is a poor teacher

Every router-to-router ping on an idle lab measures 0.1–0.8 ms with 0% loss, so
`classify()` puts **100% of rows in the "Low" band** and the Random Forest learns
nothing about congestion. Each profile is a real condition produced by real `tc`
impairment, chosen so every classification band is reachable from a real
measurement — 55 ms of netem delay lands squarely in "Medium", which the 45 ms
profile never reaches and a clean link never approaches.

---

## 19. Theme + contrast audit

`frontend/src/utils/theme.ts`, `frontend/index.html`, `scripts/audit_contrast.py`

```mermaid
flowchart TD
    FIRST["First visit"] --> MEDIA{"prefers-color-scheme?"}
    MEDIA -- light --> LIGHT["applyTheme('light')"]
    MEDIA -- "dark or unset" --> DARK["applyTheme('dark')"]

    LIGHT --> APPLY
    DARK --> APPLY["applyTheme(t):<br/>toggle documentElement.classList 'dark'<br/>persist to localStorage netrouteai_theme"]

    PREPAINT["index.html — inline script<br/>runs BEFORE first paint"] --> STORE{"a theme in<br/>localStorage?"}
    STORE -- yes --> APPLY
    STORE -- "no first visit" --> MEDIA
    APPLY --> TOGGLE["toggleTheme(): reads the current<br/>state and flips it"]

    APPLY --> VARS["CSS resolves every colour from<br/>per-theme variables on :root and .dark,<br/>republished through '@theme inline'"]

    VARS --> AUDIT["scripts/audit_contrast.py<br/>156 pairings across 2 themes,<br/>exact sRGB math — no colour-space conversion"]
    AUDIT --> W3C{"every text pairing<br/>meets its WCAG AA threshold?"}
    W3C -- no --> FAIL(["non-zero exit — blocks the build"])
    W3C -- yes --> MISUSE{"GUARD: is accent-ink<br/>below 3:1 on every surface?"}
    MISUSE -- "yes — being used as FILL ink" --> FAIL2["fail: accent-ink is fill ink (text on a<br/>bright fill). Using it as a heading colour<br/>on a panel is exactly the 1.03–1.27:1 bug."]
    MISUSE -- no --> PASS(["0 failing"])

    style MISUSE fill:#eef7ee,stroke:#3d7a3d
```

### The two inks must never be swapped

| Token | Meaning | Used for |
|-------|---------|----------|
| `accent-ink` | **fill** ink — text sitting **on** a bright accent fill | buttons, selected chips |
| `text-ink` | **reading** ink — text on panels and pages | body copy, headings, labels |

`text-accent-ink` used as a heading colour was the original invisible-text bug: 24
sites, including the hero headline's first half, the wordmark, the login dialog
title and the footer, all at **1.03–1.27:1**. The inverse was also present — 6
elements paired a bright fill with `text-ink`. The audit script now *guards* the
invariant rather than only measuring it.

The CLI terminal stays dark in **both** themes and has its own theme-invariant
`console-*` palette, so terminal output never responds to a theme switch.

---

## 20. Endpoint → algorithm map

| Method | Path | Handler | Algorithm |
|--------|------|---------|-----------|
| POST | `/api/lab/plan` | `resolve_plan` | **Diagram 3 + 4** — no Docker touched |
| POST | `/api/lab/deploy` | `deploy` → `resolve_plan` → `configure` | **Diagrams 5 + 6** |
| GET | `/api/lab/deploy` | `load_plan` / `deployed_lab_running` | drift check vs the canvas |
| POST | `/api/lab/deploy/teardown` | `teardown` | `compose down --volumes` |
| POST | `/api/lab/deploy/enterprise` | `deploy_enterprise` | explicit fallback lab |
| GET | `/api/lab/status` | `discover_lab` | dynamically discovered devices, links, cost histogram |
| POST | `/api/lab/ping` | `probe_ping` | literal-IP ping from one router's container |
| POST | `/api/lab/measure` | `measure_path` | **Diagram 10** E2E block |
| POST | `/api/lab/bandwidth` | `measure_bandwidth` | **Diagram 15** |
| POST | `/api/lab/impair` | `apply_impairment` / `clear_impairment` | **Diagram 14** |
| POST | `/api/lab/link` | `set_link_state` | `ip link set dev … down/up` |
| POST/GET | `/api/lab/traffic` | `traffic.py` | detached in-container ping loops |
| GET | `/api/lab/ospf/areas` | `area_inventory` | `show ip ospf interface` + derived ABR status |
| POST | `/api/lab/ospf/area` | `preview_move` / `apply_move` | **Diagram 17** |
| POST | `/api/lab/convergence` | `measure_convergence` | **Diagram 16** |
| GET | `/api/lab/reachability` | parallel sweep, full 171-pair matrix | ground truth for which pairs can work |
| GET | `/api/lab/metrics` | `collect_all` | interface + resource counters |
| POST | `/api/analytics/live` | `compare_ospf_vs_ai` | **Diagrams 7, 8, 10, 11, 12** |
| POST | `/api/lab/route` | `steer_plan` / `apply_steer` / `revert_steer` | **Diagram 13** |
| GET | `/api/lab/routes` | `static_routes` | `show ip route static`, exact-revert capable |
| POST | `/api/dataset/collect` | `collect` | **Diagram 18** |
| GET | `/api/dataset` | row counts | measured/synthetic split, class balance |
| — | `scripts/audit_contrast.py` | — | **Diagram 19** |

---

## Appendix — the verification commands each diagram rests on

So a reader can confirm a diagram is still true:

```bash
# Diagrams 3, 4 — allocation, renumbering, overlap, order independence
backend/venv/bin/python /tmp/opencode/final_verify.py   # 29/29 end-to-end checks
python3 scripts/audit_contrast.py                       # 156 pairings, 0 failing
cd frontend && npm run lint                             # tsc --noEmit
cd frontend && npm run build
```