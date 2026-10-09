"""NetRoute AI API.

Surface:
    /health, /                          service info
    POST /upload-topology               frontend topology -> CURRENT_TOPOLOGY
    POST /api/routing/recommend         Random Forest route recommendation
    GET  /api/lab/status                running Docker/FRR lab inventory
    POST /api/lab/deploy                build the measurable lab from the
                                       designer topology (same IPs/costs/areas)
    GET  /api/lab/deploy                which lab is running + its address plan
    POST /api/lab/deploy/enterprise     restore the fixed lab as a fallback
    POST /api/lab/deploy/teardown       stop the generated lab
    POST /api/lab/measure               real ping/traceroute between two devices
    GET  /api/lab/metrics               full metric sweep (interfaces, queues,
                                       CPU/mem, OSPF state, routing tables)
    POST /api/analytics/live            OSPF vs AI comparison, measured
    POST /api/lab/impair                inject delay/loss/jitter via tc netem
    POST /api/lab/link                  bring a lab interface up or down
    GET  /api/dataset                   training-set statistics
    POST /api/dataset/collect           measure the lab and store training rows
    POST /api/routing/dijkstra          model shortest path (+ measured metrics)
    POST /api/simulation/send-packets    packet-level simulation
    POST /api/analytics/compare         Dijkstra vs Random Forest on the model

    /api/auth/*                         accounts: register, login, logout,
                                       /me, forgot/reset password, Google
"""

import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth_db
from auth_routes import router as auth_router
from ai_route_service import (
    get_current_topology,
    recommend_route,
    upload_topology,
)
from analytics_service import compare_algorithms
from convergence import measure_convergence
from database import (
    dataset_stats,
    get_training_data,
    get_training_samples,
    init_db,
    insert_training_sample,
    record_measurement,
)
from lab_deploy import (
    DeployError,
    deploy,
    deploy_enterprise,
    deployed_lab_running,
    load_record,
    resolve_plan,
    teardown,
)
from lab_topology import discover_lab
from metrics_collector import (
    LabUnavailable,
    _client,
    apply_impairment,
    clear_impairment,
    collect_all,
    measure_bandwidth,
    measure_path,
    probe_ping,
    set_link_state,
)
from models import (
    AnalyticsCompareRequest,
    AnalyticsCompareResponse,
    ConvergenceRequest,
    DeployRequest,
    ImpairRequest,
    LinkStateRequest,
    LiveAnalyticsRequest,
    MeasureRequest,
    OspfAreaRequest,
    RawPingRequest,
    RouteRecommendationRequest,
    RouteRecommendationResponse,
    RouteSteerRequest,
    RoutingRequest,
    RoutingResponse,
    SimulationRequest,
    SimulationResponse,
    TopologyCreateRequest,
    TopologyCreateResponse,
    TrafficRequest,
    UploadTopologyRequest,
    UploadTopologyResponse,
)
from ospf_ai_service import compare_ospf_vs_ai, invalidate_link_conditions, path_for_method
from route_steer import apply_steer, revert_steer, static_routes, steer_plan  # noqa: F401
from routing_service import dijkstra_route, get_topology, random_forest_route, store_topology
from simulation_service import simulate_packets

logger = logging.getLogger("netroute.dataset")
# Plan/deploy refusals go to the log as well as the response. A 400 whose
# detail only reaches the browser leaves nothing to diagnose server-side --
# that is exactly how a refused plan once stayed invisible here.
deploy_logger = logging.getLogger("netroute.deploy")

init_db()
auth_db.init_auth_db()
auth_db.purge_expired()

app = FastAPI(
    title="NetRoute AI API",
    version="2.0.0",
    description="Real network telemetry from a live Docker/FRR OSPF lab.",
)

# In-memory topology store keyed by topology_id
topologies_store: dict[str, dict] = {}

STARTED_AT = time.time()

# Accounts and sessions. Mounted before the network routes so a request to
# /api/auth/* is matched here rather than falling through to a 404 handler.
app.include_router(auth_router)


def validate_topology(topology: dict) -> dict:
    """Validate topology and return warnings/errors."""
    warnings: list[str] = []
    errors: list[str] = []

    devices = topology.get("devices", [])
    links = topology.get("links", [])

    device_ids = [d["id"] for d in devices]
    if len(device_ids) != len(set(device_ids)):
        errors.append("Duplicate device IDs found")

    for link in links:
        if link["source"] not in device_ids:
            errors.append(f"Link source '{link['source']}' not found in devices")
        if link["target"] not in device_ids:
            errors.append(f"Link target '{link['target']}' not found in devices")

    ip_addresses: dict[str, str] = {}
    for device in devices:
        ip = device.get("ip_address")
        if ip:
            if ip in ip_addresses:
                warnings.append(
                    f"IP conflict: {ip} used by {ip_addresses[ip]} and {device['id']}"
                )
            else:
                ip_addresses[ip] = device["id"]

    connected = {link["source"] for link in links} | {link["target"] for link in links}
    for device in devices:
        if device["id"] not in connected:
            warnings.append(f"Device '{device['id']}' has no connections")

    return {"warnings": warnings, "errors": errors}


def _lab_error(exc: Exception) -> HTTPException:
    """Convert a lab failure into a 503 the frontend can surface."""
    return HTTPException(status_code=503, detail=str(exc))


# --------------------------------------------------------------------------- #
# Service
# --------------------------------------------------------------------------- #
@app.get("/")
def home():
    X, _ = get_training_data()
    lab = discover_lab()
    return {
        "service": "NetRoute AI API",
        "version": "2.0.0",
        "uptime_seconds": round(time.time() - STARTED_AT, 1),
        "training_rows": len(X),
        "lab": {
            "online": lab["online"],
            "devices": len(lab["devices"]),
            "links": len(lab["links"]),
            "error": lab.get("error"),
        },
    }


@app.get("/health")
def health():
    return {"status": "healthy", "service": "NetRoute AI API"}


# --------------------------------------------------------------------------- #
# Topology
# --------------------------------------------------------------------------- #
@app.post("/upload-topology", response_model=UploadTopologyResponse)
def upload_topology_endpoint(request: UploadTopologyRequest):
    """Receive the topology JSON from the frontend and store it as CURRENT_TOPOLOGY."""
    topology = request.topology.model_dump()
    validation = validate_topology(topology)
    topology_id = upload_topology(topology)
    topologies_store[topology_id] = topology
    return UploadTopologyResponse(
        status="success", topology_id=topology_id, validation=validation
    )


@app.post("/api/topology/create", response_model=TopologyCreateResponse)
def create_topology(request: TopologyCreateRequest):
    """Create and store a topology."""
    topology = request.topology.model_dump()
    validation = validate_topology(topology)
    topology_id = store_topology(topology)
    topologies_store[topology_id] = topology
    return TopologyCreateResponse(
        status="success", topology_id=topology_id, validation=validation
    )


@app.post("/api/routing/recommend", response_model=RouteRecommendationResponse)
def route_recommendation(request: RouteRecommendationRequest):
    """Random Forest route recommendation for the uploaded topology."""
    topology_id, topology = get_current_topology()
    if not topology or topology_id != request.topology_id:
        raise HTTPException(
            status_code=404, detail="Topology not found. POST /upload-topology first."
        )

    result = recommend_route(request.source, request.destination)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return RouteRecommendationResponse(**result)


# --------------------------------------------------------------------------- #
# Deploying the designed lab
# --------------------------------------------------------------------------- #
@app.get("/api/lab/deploy")
def lab_deploy_state():
    """Which lab is currently measurable, and the plan it was built from.

    The plan is the record of the addresses the running lab actually uses, so
    the designer shows the IPs the routers were configured with rather than the
    ones it hoped for.
    """
    record = load_record()
    running = deployed_lab_running()
    return {
        "source": "designer" if running else (
            "enterprise-ospf-lab" if discover_lab()["online"] else None
        ),
        "running": running,
        "plan": record["plan"] if record else None,
        "interfaces": record["interfaces"] if record else None,
    }


@app.post("/api/lab/plan")
def lab_deploy_plan(request: DeployRequest):
    """Resolve a topology's addresses, costs and areas without touching Docker.

    The canvas calls this as links are drawn so a real IP can be shown
    immediately, rather than only after a deploy that takes a couple of minutes.
    Addresses already on a link are honoured; blanks are allocated the same way a
    deploy allocates them, so what the canvas shows is what the lab will get.
    """
    try:
        plan = resolve_plan(request.topology)
    except DeployError as exc:
        deploy_logger.warning("plan refused: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        "routers": plan["routers"],
        "links": plan["links"],
        "areas": plan["areas"],
        "interfaces": {},
        "replaced_containers": [],
        "lab_dir": None,
    }


@app.post("/api/lab/deploy")
def lab_deploy(request: DeployRequest):
    """Build the running lab from the topology drawn in the designer.

    Addresses given in the payload are used verbatim; anything unset is filled
    in and returned so the caller can adopt it. Container names come from
    router ids, so a lab already holding those names is replaced.
    """
    try:
        return deploy(request.topology, wait_seconds=request.wait_seconds)
    except DeployError as exc:
        deploy_logger.warning("deploy refused: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/lab/deploy/enterprise")
def lab_deploy_enterprise():
    """Restore the fixed `enterprise-ospf-lab` as the measurement target."""
    try:
        return deploy_enterprise()
    except DeployError as exc:
        deploy_logger.warning("enterprise deploy refused: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/lab/deploy/teardown")
def lab_deploy_teardown():
    """Stop the generated lab without touching the fixed one."""
    return teardown()


# --------------------------------------------------------------------------- #
# Live lab
# --------------------------------------------------------------------------- #
@app.get("/api/lab/status")
def lab_status():
    """Inventory of the running Docker/FRR lab."""
    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    from lab_topology import adjacency

    adj = adjacency(lab)
    return {
        "online": True,
        "device_count": len(lab["devices"]),
        "link_count": len(lab["links"]),
        "transit_links": sum(1 for l in lab["links"] if l["kind"] == "transit"),
        "lan_links": sum(1 for l in lab["links"] if l["kind"] == "lan"),
        "devices": [
            {
                **d,
                "neighbors": sorted(adj.get(d["id"], [])),
            }
            for d in lab["devices"]
        ],
        "links": lab["links"],
    }


@app.post("/api/lab/ping")
def lab_ping(request: RawPingRequest):
    """Ping a literal IP from one lab router's container.

    The designer's CLI needs this: it is asked to ping whatever address the user
    types, not only the addresses the discovery index knows. Without it the CLI
    had no honest answer and printed a made-up one.
    """
    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    name = request.device.upper()
    device = next((d for d in lab["devices"] if d["id"] == name), None)
    if not device:
        raise _lab_error(LabUnavailable(f"'{request.device}' is not part of the running lab"))
    if device.get("type") != "router":
        raise _lab_error(
            LabUnavailable(f"{name} is a {device.get('type')}, which has no shell to ping from")
        )

    try:
        result = probe_ping(_client(), device["container"], request.target, count=request.count)
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc
    except Exception as exc:  # a bad target must not escape as a 500
        raise _lab_error(LabUnavailable(f"ping failed: {exc}")) from exc

    result["device"] = name
    result["replies"] = _ping_reply_lines(result.get("raw_output") or "")
    # The CLI prints this verbatim, so what the terminal shows is the command's
    # own output rather than something reworded to look like it.
    result["output"] = result.pop("raw_output", "")
    result.pop("samples", None)
    return result


def _ping_reply_lines(output: str) -> list[str]:
    """The per-packet reply lines from a ping, in the order they arrived."""
    lines: list[str] = []
    for line in output.splitlines():
        stripped = line.strip()
        # "64 bytes from 10.0.0.3: seq=0 ttl=64 time=0.204 ms" -- a real reply.
        if re.search(r"\bbytes from\b", stripped):
            lines.append(stripped)
        # busybox's stand-in for an unanswered packet.
        elif re.search(r"Request timeout for icmp_seq", stripped):
            lines.append(stripped)
    return lines


def _training_row(source: str, destination: str, measurement: dict, client) -> None:
    """Store one training row built only from things that were measured.

    This used to write `bandwidth_mbps: 1000` and a path cost copied from the
    hop count, so the Random Forest was trained on two fabricated columns: a flat
    1000 Mbps on every row regardless of the link, and "cost" that was just the
    number of hops. A model handed constant columns learns nothing from them, and
    any confidence derived from them was noise. Both are now read for real --
    throughput from /proc/net/dev deltas while the pair is actually pinged, and
    cost from the live `ip ospf cost` of each interface on the traced path.
    """
    from dataset_collector import _congestion_from, _path_cost, _path_queue_state
    from ospf_ai_service import _interface_costs

    lab = discover_lab()
    if not lab["online"]:
        return

    src = source.upper()
    dst = destination.upper()
    path = [d["id"] for d in lab["devices"] if d["id"] in (src, dst)]
    try:
        target_ip = measurement.get("target_ip") or lab["ip_index"].get(dst)
        source_container = lab["container_map"].get(src)
        if not target_ip or not source_container:
            return

        before = _path_queue_state(lab, path, client)
        throughput = measure_bandwidth(
            client, source_container, [target_ip], duration=1.5
        )
        after = _path_queue_state(lab, path, client)
    except (LabUnavailable, KeyError):
        # Without a throughput number there is no honest row to store, and a row
        # with a placeholder in it is worse than no row.
        return

    congestion, _drops, _errors = _congestion_from(before, after)
    traced = measurement.get("device_path") or []
    if len(traced) >= 2:
        path = traced

    try:
        costs = _interface_costs(client, lab)
    except LabUnavailable:
        costs = {}
    cost = _path_cost(lab, path, costs)

    record_measurement(
        {
            "latency_ms": measurement["latency_ms"],
            "packet_loss_percent": measurement["packet_loss_percent"],
            "bandwidth_mbps": float(throughput["throughput_mbps"]),
            "hop_count": measurement.get("hop_count") or max(1, len(path) - 1),
            "total_cost": cost,
            "congestion_level": congestion,
            "topology_id": f"{src}-{dst}",
        }
    )


@app.post("/api/lab/measure")
def lab_measure(request: MeasureRequest):
    """Measure a real path with ping and traceroute."""
    try:
        result = measure_path(
            request.source,
            request.destination,
            count=request.count,
            include_traceroute=not request.skip_traceroute,
        )
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc

    # Persist as a training row so the model learns from real observations.
    if result["reachable"] and result["latency_ms"] is not None:
        try:
            _training_row(request.source, request.destination, result, _client())
        except Exception:  # noqa: BLE001
            # A failed training write must not fail the measurement the caller
            # actually asked for; the row is a side effect, not the result.
            pass

    return result


@app.get("/api/lab/metrics")
def lab_metrics(include_ospf: bool = True):
    """Sweep the lab: interfaces, queues, CPU/memory, OSPF state."""
    try:
        return collect_all(include_ospf=include_ospf)
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc


@app.post("/api/analytics/live")
def analytics_live(request: LiveAnalyticsRequest):
    """Measured OSPF vs AI comparison over the running lab."""
    try:
        return compare_ospf_vs_ai(
            request.source,
            request.destination,
            include_convergence=request.include_convergence,
            method=request.method,
            packet_count=request.packet_count,
        )
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc


@app.post("/api/lab/route")
def lab_route(request: RouteSteerRequest):
    """Put a chosen routing method's path into effect, or revert to OSPF.

    FRR forwards its own OSPF path unless a static route overrides it, so this
    is what makes the routing-method selector change the data plane rather than
    only relabel a column. Reverting removes the exact entry that was installed.
    """
    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    source = request.source.upper()
    destination = request.destination.upper()
    for name, value in (("source", source), ("destination", destination)):
        if value not in lab["ip_index"]:
            raise _lab_error(LabUnavailable(f"'{value}' is not part of the running lab ({name})"))

    src_dev = next((d for d in lab["devices"] if d["id"] == source), None)
    if not src_dev:
        raise _lab_error(LabUnavailable(f"{source} has no container in the lab"))
    container = src_dev["container"]

    dest_ip = lab["ip_index"][destination]

    # Revert, and "select OSPF", are the same operation. Both must actually
    # remove the pinning static routes: the selection claiming "OSPF is already
    # forwarding this" without checking left the AI path in effect, so the
    # routers kept forwarding the path the user had just deselected. `apply`
    # false and `method` "ospf" both mean "put OSPF back".
    if not request.apply or request.method == "ospf":
        # Drop every static route pinning this destination, on any router, since
        # a steered path installs one per hop.
        removed: list[str] = []
        routers: list[str] = []
        # Only routers can hold a static route. Hosts and switches have no FRR
        # and no vtysh, and probing them raises "executable file not found".
        for device in lab["devices"]:
            if device.get("type") != "router":
                continue
            try:
                existing = static_routes(device["container"])
            except LabUnavailable as exc:
                raise _lab_error(exc) from exc

            for route in existing:
                if route["prefix"].split("/")[0] != dest_ip:
                    continue
                try:
                    result = revert_steer(
                        device["container"],
                        route["prefix"],
                        route["next_hop"],
                        route["interface"] or "",
                    )
                except LabUnavailable as exc:
                    raise _lab_error(exc) from exc
                removed.append(f"{device['id']}: {result['command']}")
                routers.append(device["id"])

        return {
            "ok": True,
            "applied": False,
            "device": source,
            "container": container,
            "routers": routers,
            "removed": removed,
            "message": (
                f"Removed {len(removed)} static route(s) from "
                f"{', '.join(routers)}; OSPF is forwarding this pair again."
                if removed
                else f"No static route was pinning {destination}; OSPF was already "
                "forwarding it."
            ),
        }

    try:
        path = path_for_method(lab, request.method, source, destination)
    except LabUnavailable as exc:
        # Report an unsupported method through the same 503 channel as any other
        # lab failure, rather than letting it escape the handler as a 500.
        raise _lab_error(exc) from exc
    if not path:
        raise _lab_error(
            LabUnavailable(
                f"No {request.method} path between {source} and {destination}"
            )
        )

    plan = steer_plan(request.method, path, lab, source, destination)
    if not plan.get("applicable"):
        raise _lab_error(LabUnavailable(plan.get("reason") or "Cannot apply this method."))

    try:
        applied = apply_steer(plan)
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc

    routers = sorted({h["device"] for h in plan["hops"]})
    return {
        "ok": True,
        "applied": True,
        "device": source,
        "container": container,
        "routers": routers,
        "plan": plan,
        "commands": applied["commands"],
        "message": (
            f"{' -> '.join(plan['path'])} is now in effect. {len(applied['commands'])} "
            f"static route(s) installed on {', '.join(routers)}; static routes beat "
            "OSPF, so packets follow the "
            f"{request.method} path until you revert."
        ),
    }


@app.post("/api/lab/traffic")
def lab_traffic(request: TrafficRequest):
    """Start or stop continuous background traffic in a lab device.

    The interface counters on the analytics page only advance while something
    is generating packets. This puts a real ping loop on the wire so those
    figures move, and reports the condition rather than hiding it.
    """
    from metrics_collector import _client
    import traffic as traffic_gen

    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    device = request.device.upper()
    if device not in lab["ip_index"]:
        raise _lab_error(LabUnavailable(f"'{device}' is not part of the running lab"))

    try:
        if request.running:
            return traffic_gen.start(
                _client(), lab, device, interval=request.interval
            )
        return traffic_gen.stop(_client(), device)
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc


@app.get("/api/lab/traffic")
def lab_traffic_status():
    """Which devices are currently generating traffic."""
    import traffic as traffic_gen

    return traffic_gen.status()


@app.get("/api/lab/ospf/areas")
def lab_ospf_areas():
    """Area assignment for every OSPF interface in the lab, read from FRR.

    Read from `show ip ospf interface` rather than from `frr.conf` or the drawn
    topology: an interface only appears in that output once OSPF is actually
    operational on it, so a configured-but-down interface is correctly reported
    as absent instead of as being in area 0.
    """
    from metrics_collector import _client
    from ospf_area import area_inventory

    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    try:
        return area_inventory(_client(), lab)
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc


@app.post("/api/lab/ospf/area")
def lab_ospf_area(request: OspfAreaRequest):
    """Preview or apply an interface area change on a live router.

    Two calls, deliberately: the first with `preview: true` reports which
    currently-reachable pairs the change would put at risk, and only the second
    applies it. A single `apply: true` call is refused so that no caller can
    skip the report.
    """
    from metrics_collector import _client
    from ospf_area import (
        AreaError,
        apply_move,
        normalise_area,
        preview_move,
        read_router_areas,
    )

    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    device = request.device.upper()
    entry = next(
        (d for d in lab["devices"] if d["id"] == device and d["type"] == "router"),
        None,
    )
    if entry is None:
        raise _lab_error(
            LabUnavailable(f"'{request.device}' is not a router in the running lab")
        )

    client = _client()
    try:
        state = read_router_areas(client, entry["container"])
        state = {"device": device, "container": entry["container"], **state}

        key = _move_key(device, request.interface, request.area)
        target = normalise_area(request.area)

        if request.preview:
            sweep = _sweep_pairs(lab, max_probes=400, max_workers=24)
            reachable = {
                f"{p['source']}|{p['destination']}": p["reachable"]
                for p in sweep["pairs"]
            }
            report = preview_move(state, lab, request.interface, target, reachable)
            # Authorise exactly this move, once.
            _confirmed_area_moves[key] = True
            return {"preview": True, **report}

        if not _confirmed_area_moves.pop(key, False):
            raise AreaError(
                "Preview this change before applying it. Re-send with preview: true, "
                "then apply the same device, interface and area."
            )

        return {"preview": False, **apply_move(client, state, request.interface, target)}
    except AreaError as exc:
        raise _lab_error(exc) from exc


@app.get("/api/lab/routes")
def lab_routes(device: str = "R1"):
    """Static routes currently installed on a lab router, for an exact revert."""
    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    name = device.upper()
    dev = next((d for d in lab["devices"] if d["id"] == name), None)
    if not dev:
        raise _lab_error(LabUnavailable(f"'{device}' is not part of the running lab"))
    try:
        return {
            "device": name,
            "container": dev["container"],
            "routes": static_routes(dev["container"]),
        }
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc


@app.post("/api/lab/bandwidth")
def lab_bandwidth(request: MeasureRequest):
    """Generate traffic and measure achieved throughput from byte counters.

    The requested destination is what gets pinged. This used to ignore
    `destination` and ping every adjacent peer instead, so the designer and the
    analytics page reported throughput for the source's nearest neighbour while
    labelling it with whatever pair the user had picked. Adjacency is not
    required -- the counters being sampled are the source's own, and they move
    for a destination several hops away just as they do for a neighbour (R1 to R9
    across three hops and two areas moves the same bytes R1 to R2 does).
    """
    from metrics_collector import _client

    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    src = request.source.upper()
    if src not in lab["ip_index"]:
        raise _lab_error(LabUnavailable(f"'{request.source}' is not in the running lab"))

    dst = request.destination.upper()
    if dst and dst in lab["ip_index"]:
        peers = [lab["ip_index"][dst]]
    elif dst:
        raise _lab_error(
            LabUnavailable(f"'{request.destination}' is not in the running lab")
        )
    else:
        # No destination named: fall back to whatever is directly adjacent, and
        # say so in the result rather than implying a specific pair.
        peers = [
            lab["ip_index"][l["target"]]
            for l in lab["links"]
            if l["source"] == src and l["target"] in lab["ip_index"]
        ]
    if not peers:
        raise _lab_error(
            LabUnavailable(f"'{request.source}' has no adjacent device to measure against")
        )

    try:
        result = measure_bandwidth(
            _client(), lab["container_map"][src], peers, duration=request.duration
        )
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc

    result["source"] = src
    result["destination"] = dst or "adjacent peers"
    result["peers_pinged"] = peers
    # A multi-address destination may not answer on its first address (R9's
    # r3_r9 address is unroutable from some sources while its r9_r10 one is
    # fine), and `measure_bandwidth` reports a real zero when nothing answered.
    result["reachable"] = result["tx_bytes"] > 0 or result["rx_bytes"] > 0
    if not result["reachable"]:
        result["note"] = (
            f"Nothing was answered by {', '.join(peers)}, so the counters did not move. "
            "That is 0 Mbps measured, not an assumed link speed."
        )
    return result


@app.post("/api/lab/impair")
def lab_impair(request: ImpairRequest):
    """Apply or clear tc netem/tbf impairment on a lab interface."""
    from metrics_collector import _client

    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    container = lab["container_map"].get(request.device.upper())
    if not container:
        raise _lab_error(LabUnavailable(f"'{request.device}' is not in the running lab"))

    try:
        client = _client()
        if request.clear:
            result = clear_impairment(client, container, request.interface)
        else:
            params: dict[str, float] = {}
            for key in ("delay", "loss", "jitter", "corrupt", "duplicate", "reorder", "bandwidth"):
                value = getattr(request, key, None)
                if value:
                    params[key] = float(value)
            if not params:
                raise HTTPException(status_code=400, detail="No impairment parameters supplied")
            result = apply_impairment(client, container, request.interface, **params)
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc
    # The routing graph reads tc's configuration, so make the next request
    # see this one's change instead of the cached previous state.
    invalidate_link_conditions()
    return result


@app.post("/api/lab/link")
def lab_link(request: LinkStateRequest):
    """Bring a lab interface up or down (link failure injection)."""
    from metrics_collector import _client

    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    container = lab["container_map"].get(request.device.upper())
    if not container:
        raise _lab_error(LabUnavailable(f"'{request.device}' is not in the running lab"))

    try:
        result = set_link_state(_client(), container, request.interface, up=request.up)
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc
    # A link the graph cached as usable just went away (or came back); the
    # next analytics request must not route over the stale reading.
    invalidate_link_conditions()
    return result


@app.post("/api/lab/convergence")
def lab_convergence(request: ConvergenceRequest):
    """Time how long the network takes to recover from a link failure."""
    try:
        return measure_convergence(
            request.source,
            request.destination,
            {"container": request.container, "interface": request.interface},
            timeout=request.timeout,
        )
    except LabUnavailable as exc:
        raise _lab_error(exc) from exc


# --------------------------------------------------------------------------- #
# Dataset
# --------------------------------------------------------------------------- #
@app.get("/api/lab/reachability")
def lab_reachability(max_probes: int = 400, max_workers: int = 24):
    """Probe which device pairs actually answer, so the UI can avoid dead ends.

    A lab is not uniformly connected: hosts behind a stub-area ABR reach their
    gateway but nothing beyond it. Probing tells the frontend which source and
    destination choices will actually produce measurements.

    Probes run concurrently -- each pair can try several destination addresses
    with a ping each, so doing this serially takes minutes.
    """
    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    return _sweep_pairs(lab, max_probes=max_probes, max_workers=max_workers)


def _sweep_pairs(
    lab: dict[str, Any], max_probes: int = 400, max_workers: int = 24
) -> dict[str, Any]:
    """Probe every unordered device pair and report which ones answer.

    The full matrix is swept, not a capped prefix: an earlier 60-pair cap
    silently left later pairs unprobed, so the UI showed "unreachable" for pairs
    it had never actually tried. At 19 devices the matrix is 171 pairs and takes
    ~28s.
    """
    ids = [d["id"] for d in lab["devices"]]
    pairs = [(a, b) for i, a in enumerate(ids) for b in ids[i + 1:]][:max_probes]

    def _probe(pair: tuple[str, str]) -> dict[str, Any]:
        a, b = pair
        try:
            m = measure_path(a, b, count=2, include_traceroute=False)
            return {
                "source": a,
                "destination": b,
                "reachable": m["reachable"],
                "latency_ms": m["latency_ms"],
            }
        except LabUnavailable as exc:
            return {"source": a, "destination": b, "reachable": False, "error": str(exc)}

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        results = list(pool.map(_probe, pairs))

    reachable = [r for r in results if r["reachable"]]
    return {
        "probed": len(results),
        "reachable_pairs": len(reachable),
        "pairs": results,
        "examples": [f"{r['source']}->{r['destination']}" for r in reachable[:8]],
    }


@app.get("/api/dataset")
def dataset():
    """Training-set statistics, split by synthetic vs measured."""
    return dataset_stats()


@app.post("/api/dataset/collect")
def dataset_collect(request: LiveAnalyticsRequest, background_tasks: BackgroundTasks):
    """Measure the lab under varied real conditions and store training rows.

    A clean lab teaches the model nothing -- every ping lands in the "Low"
    band. Each pair is therefore measured with and without real `tc`
    impairment so the Random Forest sees genuine latency, loss, queue depth
    and drop counts. Runs in the background; poll /api/dataset for progress.
    """
    lab = discover_lab()
    if not lab["online"]:
        raise _lab_error(LabUnavailable(lab.get("error") or "Lab not running"))

    from dataset_collector import collect

    def _run() -> None:
        collect(max_pairs=request.max_pairs, on_progress=_log_dataset_progress)

    background_tasks.add_task(_run)
    return {
        "status": "started",
        "pairs_requested": request.max_pairs,
        "message": (
            f"Measuring up to {request.max_pairs} router pairs across 4 real "
            "network conditions (clean, mild, heavy, loaded)"
        ),
    }


def _log_dataset_progress(message: str) -> None:
    logger.info("dataset collection: %s", message)


# Area changes that have been previewed and are therefore allowed to apply.
# Keyed by device/interface/area so a preview authorises exactly one change: a
# caller cannot preview one move and then apply a different one. Single-process
# and short-lived by design -- this is a guard against an accidental un-previewed
# write, not a security boundary.
_confirmed_area_moves: dict[tuple[str, str, str], bool] = {}


def _move_key(device: str, interface: str, area: str) -> tuple[str, str, str]:
    """Preview keys normalise the area so `2`, `2.0.0.0` and `0.0.0.2` match."""
    from ospf_area import format_area, normalise_area

    return (device.upper(), interface, format_area(normalise_area(area)))


@app.get("/api/train/samples")
def train_samples():
    """Most recent routing samples."""
    samples = get_training_samples()
    return {"samples": samples, "count": len(samples)}


# --------------------------------------------------------------------------- #
# Model-based routing (kept for the designer's routing tools)
# --------------------------------------------------------------------------- #
@app.post("/api/routing/dijkstra", response_model=RoutingResponse)
def routing_dijkstra(request: RoutingRequest):
    """Shortest path on the topology model, enriched with measured metrics
    when the same device names exist in the running lab."""
    topology = get_topology(request.topology_id, topologies_store)
    if not topology:
        raise HTTPException(status_code=404, detail=f"Topology '{request.topology_id}' not found")

    result = dijkstra_route(topology, request.source, request.destination)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    # Overlay real measurements when the lab has these devices
    try:
        live = measure_path(
            request.source, request.destination, count=4, include_traceroute=True
        )
        result["metrics"]["latency"] = live["latency_ms"]
        result["metrics"]["packet_loss"] = live["packet_loss_percent"] / 100
        result["metrics"]["jitter_ms"] = live["jitter_ms"]
        result["measured"] = True
    except LabUnavailable:
        result["measured"] = False

    insert_training_sample(
        request.topology_id, request.source, request.destination,
        result["path"], "dijkstra", result["metrics"],
    )
    return RoutingResponse(**result)


@app.post("/api/routing/random-forest", response_model=RoutingResponse)
def routing_random_forest(request: RoutingRequest):
    """Random Forest route selection on the topology model."""
    topology = get_topology(request.topology_id, topologies_store)
    if not topology:
        raise HTTPException(status_code=404, detail=f"Topology '{request.topology_id}' not found")

    result = random_forest_route(topology, request.source, request.destination)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    try:
        live = measure_path(
            request.source, request.destination, count=4, include_traceroute=True
        )
        result["metrics"]["latency"] = live["latency_ms"]
        result["metrics"]["packet_loss"] = live["packet_loss_percent"] / 100
        result["metrics"]["jitter_ms"] = live["jitter_ms"]
        result["measured"] = True
    except LabUnavailable:
        result["measured"] = False

    insert_training_sample(
        request.topology_id, request.source, request.destination,
        result["path"], "random_forest", result["metrics"],
    )
    return RoutingResponse(**result)


@app.post("/api/simulation/send-packets", response_model=SimulationResponse)
def send_packets(request: SimulationRequest):
    """Simulate packet transmission through the topology model."""
    topology = get_topology(request.topology_id, topologies_store)
    if not topology:
        raise HTTPException(status_code=404, detail=f"Topology '{request.topology_id}' not found")

    result = simulate_packets(
        topology, request.source, request.destination,
        request.packet_count, request.packet_size, request.algorithm,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return SimulationResponse(**result)


@app.post("/api/analytics/compare", response_model=AnalyticsCompareResponse)
def analytics_compare(request: AnalyticsCompareRequest):
    """Compare Dijkstra vs Random Forest on the topology model."""
    topology = get_topology(request.topology_id, topologies_store)
    if not topology:
        raise HTTPException(status_code=404, detail=f"Topology '{request.topology_id}' not found")
    return AnalyticsCompareResponse(**compare_algorithms(topology, request.source, request.destination))


# The UI and this API are different origins only in development: Vite serves
# :3000, uvicorn serves :8000, and the browser notices. A deployed build is
# served by nginx, which proxies /api, /upload-topology and /health to this
# process, so the page and the API arrive at the browser as one origin and no
# CORS header is ever consulted — the list below is what makes the dev layout
# work, not what makes deployment work.
#
# Set CORS_ORIGINS (comma separated) when the UI is served from somewhere the
# proxy does not cover, e.g. a static bundle on its own host.
_DEFAULT_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:3000,http://127.0.0.1:3000"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        # `or`, not a dict default: compose always sets the variable, and an
        # explicitly empty one must fall back rather than clear the list.
        for origin in (os.environ.get("CORS_ORIGINS") or _DEFAULT_ORIGINS).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
