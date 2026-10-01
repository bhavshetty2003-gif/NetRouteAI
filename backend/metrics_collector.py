"""Real network metrics measured from the running Docker/FRR OSPF lab.

Every number this module returns comes from a command executed against a live
container. Nothing is simulated or hardcoded.

Measurement map (tool -> metric):
    ping            -> RTT min/avg/max, packet loss, jitter
    traceroute      -> hop count, per-hop RTT
    ip -s link      -> RX/TX packets, bytes, errors, drops
    /proc/net/dev   -> interface counters (bandwidth/utilisation deltas)
    tc -s qdisc     -> queue depth, drops, overlimits, requeues
    vtysh (FRR)     -> OSPF neighbours, LSDB, routing table, SPF time
    /proc/stat      -> CPU usage
    /proc/meminfo   -> memory usage
    ip link         -> interface up/down state
    tc qdisc netem  -> inject delay / loss / jitter / corruption / reorder

Probes run in a ThreadPoolExecutor so a full sweep stays well under a second.
"""

from __future__ import annotations

import re
import shlex
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

import docker
from docker.errors import DockerException, NotFound

from lab_topology import discover_lab

# Docker bridge interfaces report 10 Gbit; a lab link is a 1 Gbit handoff.
# Used only to turn byte counters into a utilisation percentage.
DEFAULT_LINK_SPEED_MBPS = 1000.0

_POOL = ThreadPoolExecutor(max_workers=16, thread_name_prefix="metric")

_PING_STATS = re.compile(
    r"(?P<sent>\d+) packets transmitted, (?P<received>\d+) packets received"
    r"(?:, (?P<loss>[\d.]+)% packet loss)?"
)
_PING_RTT = re.compile(
    r"(?:round-trip|rtt)\s+min/avg/max(?:/mdev)?\s*=\s*"
    r"([\d.]+)/([\d.]+)/([\d.]+)(?:/([\d.]+))?"
)


class LabUnavailable(RuntimeError):
    """Raised when the Docker lab is not running."""


def _client() -> docker.DockerClient:
    try:
        return docker.from_env()
    except DockerException as exc:  # pragma: no cover - environment dependent
        raise LabUnavailable(f"Docker daemon unreachable: {exc}") from exc


def _container(client: docker.DockerClient, name: str):
    try:
        return client.containers.get(name)
    except (NotFound, DockerException) as exc:
        raise LabUnavailable(f"Container '{name}' not available: {exc}") from exc


def _exec(
    container, cmd: list[str], timeout: int = 15, stdin: str | None = None
) -> tuple[int, str]:
    """Run a command in a container, returning (exit_code, output).

    `container` may be a container object or a container name. Names are
    resolved through the client so a helper module does not have to repeat the
    `client.containers.get()` dance at every call site.

    `stdin` is piped in from inside the container rather than through the Docker
    API's socket stream, which this client build does not accept. That matters
    for vtysh: its `-c` flag runs each argument as a separate command in exec
    mode, so `vtysh -c "configure terminal" -c "ip route ..."` fails with
    "Unknown command" because the second command never runs in config mode.
    """
    try:
        if isinstance(container, str):
            container = _client().containers.get(container)
        if stdin is not None:
            script = "printf %s " + shlex.quote(stdin)
            cmd = ["sh", "-c", f"{script}| {shlex.join(cmd)}"]
        res = container.exec_run(cmd, demux=True)
    except (DockerException, NotFound) as exc:
        return 1, str(exc)
    except Exception as exc:  # noqa: BLE001 - docker raises many shapes
        return 1, str(exc)

    return res.exit_code, _demux(res.output)


def _demux(raw: Any) -> str:
    """Flatten exec_run output (bytes, str, or (stdout, stderr) tuple)."""
    if raw is None:
        return ""
    if isinstance(raw, bytes):
        return raw.decode(errors="replace")
    if isinstance(raw, str):
        return raw
    if isinstance(raw, tuple):
        parts = [_demux(chunk) for chunk in raw]
        return "".join(p for p in parts if p)
    return str(raw)


# --------------------------------------------------------------------------- #
# Parsers
# --------------------------------------------------------------------------- #
def parse_ping(output: str) -> dict[str, Any]:
    """Parse `ping -c N` output into RTT statistics and packet loss."""
    result: dict[str, Any] = {
        "reachable": False,
        "sent": 0,
        "received": 0,
        "loss_percent": 100.0,
        "rtt_min_ms": None,
        "rtt_avg_ms": None,
        "rtt_max_ms": None,
        "rtt_mdev_ms": None,
        "jitter_ms": None,
    }

    # BusyBox ping omits /mdev from its summary, so derive jitter from the
    # individual reply lines (std-dev of the RTT samples).
    samples = [float(x) for x in re.findall(r"time[=<]\s*([\d.]+)\s*ms", output)]
    result["samples"] = samples
    if len(samples) > 1:
        result["jitter_ms"] = round(statistics.stdev(samples), 4)
        result["rtt_min_ms"] = result["rtt_min_ms"] or min(samples)
        result["rtt_avg_ms"] = result["rtt_avg_ms"] or round(statistics.mean(samples), 4)
        result["rtt_max_ms"] = result["rtt_max_ms"] or max(samples)

    m = _PING_STATS.search(output)
    if m:
        result["sent"] = int(m.group("sent"))
        result["received"] = int(m.group("received"))
        if m.group("loss") is not None:
            result["loss_percent"] = float(m.group("loss"))
        elif result["sent"]:
            result["loss_percent"] = round(
                (result["sent"] - result["received"]) / result["sent"] * 100, 2
            )

    r = _PING_RTT.search(output)
    if r:
        result["rtt_min_ms"] = float(r.group(1))
        result["rtt_avg_ms"] = float(r.group(2))
        result["rtt_max_ms"] = float(r.group(3))
        result["rtt_mdev_ms"] = float(r.group(4)) if r.group(4) else None
        if result["jitter_ms"] is None and result["rtt_mdev_ms"] is not None:
            # mdev is the std-dev of RTTs, i.e. jitter.
            result["jitter_ms"] = result["rtt_mdev_ms"]
        result["reachable"] = result["received"] > 0
    return result


def _parse_per_hop_rtts(output: str) -> list[float]:
    rtts: list[float] = []
    for line in output.splitlines():
        m = re.search(r"([\d.]+)\s*ms", line)
        if m:
            rtts.append(float(m.group(1)))
    return rtts


def parse_traceroute(output: str) -> dict[str, Any]:
    """Parse traceroute output into hop count, per-hop RTTs and answering IPs.

    Each hop keeps its `address` because that address is the only thing that
    identifies which device forwarded the packet -- two devices on the same
    /29 hold different addresses inside it (r1 is 10.0.0.10, r12 is 10.0.0.11).
    Dropping it here is what used to leave the analytics page with per-hop
    timings it could not attribute to any router, and therefore with no way to
    show the path a packet actually takes.

    `raw_lines` is kept for the traceroute header/diagnostics.
    """
    hops: list[dict[str, Any]] = []
    raw_lines: list[str] = []
    for line in output.splitlines():
        m = re.match(r"\s*(\d+)\s+(.*)$", line)
        if not m:
            continue
        raw_lines.append(line)
        idx = int(m.group(1))
        rest = m.group(2)
        if rest.strip().startswith("*"):
            hops.append({"hop": idx, "address": None, "rtt_ms": None})
            continue
        addr = re.match(r"([0-9a-fA-F:.]+)", rest.strip())
        rtts = _parse_per_hop_rtts(rest)
        hops.append(
            {
                "hop": idx,
                "address": addr.group(1) if addr else None,
                "rtt_ms": statistics.mean(rtts) if rtts else None,
            }
        )

    answered = [h for h in hops if h["rtt_ms"] is not None]
    return {
        "hop_count": len(answered),
        "max_hops": len(hops),
        "hops": hops,
        "raw_lines": raw_lines,
        "reached": bool(answered),
    }


def parse_qdisc(output: str) -> dict[str, Any]:
    """Parse `tc -s qdisc show` into per-interface queue statistics."""
    result: dict[str, dict[str, Any]] = {}
    current: str | None = None

    for raw in output.splitlines():
        line = raw.strip()
        if not line:
            continue

        head = re.match(r"qdisc\s+(\S+)\s+\S+:\s+dev\s+(\S+)", line)
        if head:
            current = head.group(2)
            result[current] = {
                "kind": head.group(1),
                "queue_length": 0,
                "sent_bytes": 0,
                "sent_packets": 0,
                "dropped": 0,
                "overlimits": 0,
                "requeues": 0,
                "backlog_bytes": 0,
                "backlog_packets": 0,
            }
            continue

        if current is None:
            continue

        m = re.search(
            r"Sent\s+(\d+)\s+bytes\s+(\d+)\s+pkt.*?dropped\s+(\d+),\s*"
            r"overlimits\s+(\d+)\s+requeues\s+(\d+)",
            line,
        )
        if m:
            entry = result[current]
            entry["sent_bytes"] = int(m.group(1))
            entry["sent_packets"] = int(m.group(2))
            entry["dropped"] = int(m.group(3))
            entry["overlimits"] = int(m.group(4))
            entry["requeues"] = int(m.group(5))
            continue

        b = re.search(r"backlog\s+(\d+)b\s+(\d+)p", line)
        if b:
            result[current]["backlog_bytes"] = int(b.group(1))
            result[current]["backlog_packets"] = int(b.group(2))
            continue

        # netem line reports the effective delay it is applying
        n = re.search(r"delay\s+([\d.]+ms]+)", line)
        if n:
            result[current]["netem_delay"] = n.group(1)
    return result


def _counter_row(block: str, prefix: str) -> tuple[int, int, int, int, int, int]:
    """Extract the six counter values that follow an `RX:`/`TX:` header line."""
    lines = block.splitlines()
    for i, line in enumerate(lines):
        if not line.strip().startswith(f"{prefix}:"):
            continue
        values: list[int] = []
        for nxt in lines[i + 1:]:
            toks = nxt.split()
            if not toks:
                continue
            if all(t.isdigit() for t in toks):
                values = [int(t) for t in toks]
            break
        if len(values) >= 4:
            return (values[0], values[1], values[2], values[3], *values[4:6])
        return (0, 0, 0, 0, 0, 0)
    return (0, 0, 0, 0, 0, 0)


def parse_link_stats(output: str) -> list[dict[str, Any]]:
    """Parse `ip -s link` into per-interface counters."""
    interfaces: list[dict[str, Any]] = []
    blocks = re.split(r"(?m)^\d+:\s", output)
    for block in blocks:
        block = block.strip()
        if not block or ":" not in block:
            continue
        name = block.split(":", 1)[0].split("@")[0].strip()
        if not name or name == "lo":
            continue
        entry: dict[str, Any] = {
            "name": name,
            "state": "down",
            "rx_bytes": 0,
            "rx_packets": 0,
            "rx_errors": 0,
            "rx_dropped": 0,
            "tx_bytes": 0,
            "tx_packets": 0,
            "tx_errors": 0,
            "tx_dropped": 0,
        }
        if re.search(r"state\s+(UP|UNKNOWN)", block):
            entry["state"] = "up"

        # `ip -s link` puts the header and the numbers on separate lines:
        #     RX:  bytes packets errors dropped  missed   mcast
        #          24388     209      0       0       0       0
        rx = _counter_row(block, "RX")
        tx = _counter_row(block, "TX")
        entry.update(
            {
                "rx_bytes": rx[0],
                "rx_packets": rx[1],
                "rx_errors": rx[2],
                "rx_dropped": rx[3],
                "tx_bytes": tx[0],
                "tx_packets": tx[1],
                "tx_errors": tx[2],
                "tx_dropped": tx[3],
            }
        )
        interfaces.append(entry)
    return interfaces


# --------------------------------------------------------------------------- #
# Probes
# --------------------------------------------------------------------------- #
def probe_ping(
    client, container_name: str, target_ip: str, count: int = 5, interval: float = 0.2
) -> dict[str, Any]:
    """Measure RTT / loss / jitter from a container to an IP."""
    container = _container(client, container_name)
    cmd = ["ping", "-c", str(count), "-i", str(interval), "-W", "2", target_ip]
    code, out = _exec(container, cmd, timeout=count * interval + 10)
    parsed = parse_ping(out)
    parsed["command"] = " ".join(cmd)
    parsed["source"] = container_name
    parsed["target"] = target_ip
    parsed["exit_code"] = code
    # The unedited output, so a caller that wants to show the terminal what
    # actually came back does not have to reconstruct it from the parsed fields.
    parsed["raw_output"] = out
    return parsed


def probe_traceroute(
    client, container_name: str, target_ip: str, max_hops: int = 12, attempts: int = 3
) -> dict[str, Any]:
    """Measure hop count and per-hop RTT to a target IP.

    A router does not always answer the TTL-expired probe: FRR rate-limits ICMP
    replies, so a single run can come back with `*` in the middle of an otherwise
    complete trace. That is a measurement artefact, not a routing fact, and left
    unhandled it produced a path with a router missing from it -- the analytics
    page then reported that forwarding did not match OSPF when it had in fact
    matched. Each retry sends the probe with a longer gap (`-i`), and the most
    complete run wins, with earlier answers kept for any hop that a later run
    leaves blank.
    """
    container = _container(client, container_name)
    best: dict[str, Any] | None = None
    commands: list[str] = []

    for attempt in range(max(1, attempts)):
        # Linux traceroute caps the interval at 1s, so spacing alone cannot fix
        # rate limiting; what it does fix is sending the probes far enough apart
        # that the router's limiter has reset before the next one.
        cmd = ["traceroute", "-n", "-m", str(max_hops), "-w", "1"]
        if attempt:
            cmd += ["-i", "1", "-q", "1"]
        cmd += [target_ip]
        commands.append(" ".join(cmd))
        code, out = _exec(container, cmd, timeout=max_hops + 10)
        parsed = parse_traceroute(out)
        parsed["exit_code"] = code
        best = _merge_traceroute(best, parsed)
        if best.get("complete"):
            break

    assert best is not None
    best["command"] = commands[0]
    best["commands"] = commands
    best["attempts"] = len(commands)
    best["source"] = container_name
    best["target"] = target_ip
    return best


def _merge_traceroute(
    previous: dict[str, Any] | None, current: dict[str, Any]
) -> dict[str, Any]:
    """Keep the most complete traceroute seen, filling gaps from earlier runs.

    A hop that answered in any run counts as answered: the router is on the
    path, it just did not reply that time. `complete` then means every hop up to
    the destination replied, which is what the caller needs before treating the
    hop list as the real path.
    """
    if previous is None:
        merged = dict(current)
    else:
        earlier = {h["hop"]: h for h in previous.get("hops", [])}
        hops = []
        for hop in current.get("hops", []):
            if hop.get("address") is None and hop["hop"] in earlier:
                recovered = earlier[hop["hop"]]
                if recovered.get("address") is not None:
                    hop = dict(hop)
                    hop["address"] = recovered["address"]
                    hop["rtt_ms"] = hop.get("rtt_ms") or recovered.get("rtt_ms")
                    hop["recovered_from_earlier_run"] = True
            hops.append(hop)
        merged = dict(current)
        merged["hops"] = hops

    hops = merged.get("hops", [])
    answered = [h for h in hops if h.get("address")]
    merged["answered_hops"] = len(answered)
    # Complete means the trace ran to the target with no gap: every hop before
    # the last answered one answered too. A trace that stops short is not a
    # complete picture of the path even if the hops it did get are all there.
    merged["complete"] = bool(answered) and len(answered) == len(hops)
    merged["hop_count"] = len(answered)
    return merged


def probe_interfaces(client, container_name: str) -> dict[str, Any]:
    """Collect interface state and counters for a container."""
    container = _container(client, container_name)
    _, links_out = _exec(container, ["ip", "-s", "link"])
    _, qdisc_out = _exec(container, ["tc", "-s", "qdisc", "show"])
    return {
        "container": container_name,
        "interfaces": parse_link_stats(links_out),
        "queues": parse_qdisc(qdisc_out),
    }


def probe_resources(client, container_name: str) -> dict[str, Any]:
    """Collect CPU and memory usage from /proc."""
    container = _container(client, container_name)
    _, stat = _exec(container, ["cat", "/proc/stat"])
    _, mem = _exec(container, ["cat", "/proc/meminfo"])
    _, load = _exec(container, ["cat", "/proc/loadavg"])
    return {
        "container": container_name,
        "cpu": _parse_cpu(stat),
        "memory": _parse_meminfo(mem),
        "loadavg": load.strip().split()[:3],
    }


def _parse_cpu(stat: str) -> dict[str, Any]:
    for line in stat.splitlines():
        if not line.startswith("cpu "):
            continue
        parts = [int(x) for x in line.split()[1:] if x.isdigit()]
        if len(parts) < 4:
            break
        user, nice, system, idle = parts[:4]
        iowait = parts[5] if len(parts) > 5 else 0
        total = user + nice + system + idle + iowait
        idle_total = idle + iowait
        usage = 0.0 if total == 0 else (1 - idle_total / total) * 100
        return {
            "usage_percent": round(usage, 2),
            "user": user,
            "system": system,
            "idle": idle,
        }
    return {"usage_percent": 0.0, "user": 0, "system": 0, "idle": 0}


def _parse_meminfo(mem: str) -> dict[str, Any]:
    info: dict[str, Any] = {}
    for line in mem.splitlines():
        m = re.match(r"(\w+):\s+(\d+)\s*kB", line)
        if m:
            info[m.group(1).lower()] = int(m.group(2))
    total = info.get("memtotal", 0)
    avail = info.get("memavailable", info.get("memfree", 0))
    return {
        "total_kb": total,
        "available_kb": avail,
        "usage_percent": 0.0 if not total else round((1 - avail / total) * 100, 2),
    }


def probe_ospf(client, container_name: str) -> dict[str, Any]:
    """Collect OSPF adjacency and SPF state from FRR."""
    container = _container(client, container_name)
    _, neigh = _exec(container, ["vtysh", "-c", "show ip ospf neighbor"])
    _, route = _exec(container, ["vtysh", "-c", "show ip route"])
    _, proc = _exec(container, ["vtysh", "-c", "show ip ospf"])
    return {
        "container": container_name,
        "neighbors": parse_ospf_neighbors(neigh),
        "routes": parse_ospf_routes(route),
        "spf": parse_ospf_process(proc),
    }


def parse_ospf_neighbors(output: str) -> list[dict[str, Any]]:
    neighbors: list[dict[str, Any]] = []
    for line in output.splitlines():
        parts = line.split()
        # Neighbor ID Pri State UpTime DeadTime Address Interface ...
        if len(parts) < 7 or not re.match(r"^\d+\.\d+\.\d+\.\d+$", parts[0]):
            continue
        state = parts[2]
        neighbors.append(
            {
                "neighbor_id": parts[0],
                "priority": parts[1],
                "state": state,
                "up_time": parts[3],
                "dead_time": parts[4],
                "address": parts[5],
                "interface": parts[6],
                "full": state.startswith("Full"),
            }
        )
    return neighbors


def parse_ospf_routes(output: str) -> list[dict[str, Any]]:
    routes: list[dict[str, Any]] = []
    for line in output.splitlines():
        m = re.match(
            r"^(?P<code>[OCSKT*>]+)\s+(?P<prefix>\S+)\s+\[(?P<dist>\d+)/(?P<cost>\d+)\]"
            r"(?:\s+is directly connected)?(?:\s+via\s+(?P<via>\S+))?",
            line.strip(),
        )
        if not m:
            continue
        routes.append(
            {
                "code": m.group("code"),
                "prefix": m.group("prefix"),
                "distance": int(m.group("dist")),
                "cost": int(m.group("cost")),
                "via": m.group("via"),
                "ospf": m.group("code").find("O") >= 0,
                "connected": "directly connected" in line,
            }
        )
    return routes


def parse_ospf_process(output: str) -> dict[str, Any]:
    info: dict[str, Any] = {}
    m = re.search(r"SPF algorithm last executed ([\dhm ]+)ago", output)
    if m:
        info["spf_last_executed"] = m.group(1).strip()
    m = re.search(r"Last SPF duration (\d+) usecs", output)
    if m:
        info["spf_duration_us"] = int(m.group(1))
    m = re.search(r"Number of external LSA (\d+)", output)
    if m:
        info["external_lsa"] = int(m.group(1))
    m = re.search(r"This router is an (\w+), ABR type is: (\w+)", output)
    if m:
        info["role"] = f"{m.group(1)} ({m.group(2)} ABR)"
    return info


# --------------------------------------------------------------------------- #
# Traffic-based bandwidth measurement
# --------------------------------------------------------------------------- #
def measure_bandwidth(
    client, container_name: str, peer_ips: list[str], duration: float = 2.0
) -> dict[str, Any]:
    """Measure real throughput by generating traffic and reading byte counters.

    `ping` is the stimulus because `iperf3` is absent from every lab image
    (alpine and frr alike). The payload size and interval are pushed hard --
    `ping -s 4000 -i 0.01` -- because the default `-i 0.05` on an 84-byte echo
    request only offers about 0.03 Mbps of load, which measures the packet rate
    rather than the link. With a 4 KB payload at 100 Hz the same probe moves
    roughly 4 Mbps of real bytes. Sampling /proc/net/dev before and after gives
    the achieved bit rate either way; a smaller interval or payload falls back
    when the container refuses it.

    The counters being sampled are this container's own, so the peer does not
    need to be adjacent: they move for a destination several hops away too.
    """
    container = _container(client, container_name)

    def counters() -> dict[str, tuple[int, int]]:
        _, out = _exec(container, ["cat", "/proc/net/dev"])
        parsed: dict[str, tuple[int, int]] = {}
        for line in out.splitlines()[2:]:
            parts = line.replace(":", "").split()
            if len(parts) < 10:
                continue
            parsed[parts[0]] = (int(parts[1]), int(parts[9]))
        return parsed

    def stimulus(ips: list[str], interval: str, size: str) -> list[Any]:
        procs: list[Any] = []
        count = max(1, int(duration / float(interval)))
        for ip in ips:
            try:
                procs.append(
                    container.exec_run(
                        ["ping", "-i", interval, "-s", size, "-c", str(count), "-W", "1", ip],
                        detach=True,
                    )
                )
            except Exception:  # noqa: BLE001
                continue
        return procs

    before = counters()
    processes = stimulus(peer_ips, "0.01", "4000")

    time.sleep(duration)
    # No movement means the fast form was refused or nothing answered. Re-try
    # once with the plain ping before reporting a zero, so a zero means
    # "nothing was forwarded", not "the flag I tried was too fast".
    after = counters()
    moved = any(
        iface != "lo"
        and (
            max(0, after[iface][0] - before[iface][0])
            + max(0, after[iface][1] - before[iface][1])
        )
        > 0
        for iface in set(before) & set(after)
    )
    if not moved and processes:
        for proc in processes:
            try:
                proc.kill()
            except Exception:  # noqa: BLE001
                pass
        processes = stimulus(peer_ips, "0.05", "84")

    after = counters()
    for proc in processes:
        try:
            proc.kill()
        except Exception:  # noqa: BLE001
            pass

    # Per-interface deltas, not a sum across every interface. The probe is a
    # single flow, so it crosses exactly one egress interface and returns on one
    # ingress interface; anything else moving is unrelated traffic -- a
    # background ping loop, a neighbour's probes -- and folding it in reported a
    # figure that no single link carried. The headline is taken from the busiest
    # interface, which is the link actually carrying this traffic.
    per_interface: dict[str, dict[str, int]] = {}
    for iface in set(before) & set(after):
        if iface == "lo":
            continue
        rx = max(0, after[iface][0] - before[iface][0])
        tx = max(0, after[iface][1] - before[iface][1])
        if rx or tx:
            per_interface[iface] = {"rx_bytes": rx, "tx_bytes": tx}

    busiest = max(per_interface, key=lambda i: sum(per_interface[i].values()), default=None)
    rx_delta = per_interface[busiest]["rx_bytes"] if busiest else 0
    tx_delta = per_interface[busiest]["tx_bytes"] if busiest else 0

    return {
        "container": container_name,
        "measured_interface": busiest,
        "per_interface": per_interface,
        "sample_seconds": duration,
        "rx_bytes": rx_delta,
        "tx_bytes": tx_delta,
        "throughput_mbps": round((rx_delta + tx_delta) * 8 / duration / 1_000_000, 3),
        "utilization_percent": round(
            min(100.0, (rx_delta + tx_delta) * 8 / duration / (DEFAULT_LINK_SPEED_MBPS * 1_000_000) * 100),
            3,
        ),
    }


# --------------------------------------------------------------------------- #
# Impairment injection (tc netem / tbf)
# --------------------------------------------------------------------------- #
_IMPAIRMENTS = ("delay", "loss", "jitter", "corrupt", "duplicate", "reorder")


def apply_impairment(
    client, container_name: str, interface: str, **params: float
) -> dict[str, Any]:
    """Apply tc netem/tbf impairment to a container interface.

    Supported: delay (ms), loss (%), jitter (ms), corrupt (%),
    duplicate (%), reorder (%), bandwidth (mbps).

    When both a rate limit and a netem effect are requested they are chained
    rather than both being installed as `root`. An interface can only have one
    root qdisc, so a second `tc qdisc add ... root` is rejected with "File
    exists" and the rate limit was silently never applied -- the link looked
    loaded in the request but carried no real queue pressure. Here `tbf`
    becomes the root and netem is attached beneath it as a child class, which
    is the arrangement that actually produces queue backlog and drops.
    """
    container = _container(client, container_name)
    commands: list[list[str]] = []
    errors: list[str] = []

    netem_parts: list[str] = []
    if params.get("delay"):
        netem_parts += ["delay", f"{params['delay']}ms"]
        if params.get("jitter"):
            netem_parts += [f"{params['jitter']}ms"]
    if params.get("loss"):
        netem_parts += ["loss", f"{params['loss']}%"]
    if params.get("corrupt"):
        netem_parts += ["corrupt", f"{params['corrupt']}%"]
    if params.get("duplicate"):
        netem_parts += ["duplicate", f"{params['duplicate']}%"]
    if params.get("reorder"):
        netem_parts += ["reorder", f"{params['reorder']}%"]

    rate = params.get("bandwidth")

    if rate:
        # Start from a known state so `replace` cannot collide with a leftover.
        _exec(container, ["tc", "qdisc", "del", "dev", interface, "root"], timeout=10)
        commands.append(
            ["tc", "qdisc", "replace", "dev", interface, "root", "handle", "1:",
             "tbf", "rate", f"{int(rate)}mbit", "burst", "32k", "latency", "400ms"]
        )
        if netem_parts:
            commands.append(
                ["tc", "qdisc", "replace", "dev", interface, "parent", "1:1",
                 "handle", "10:", "netem", *netem_parts]
            )
    elif netem_parts:
        commands.append(
            ["tc", "qdisc", "replace", "dev", interface, "root", "netem", *netem_parts]
        )

    for cmd in commands:
        code, out = _exec(container, cmd, timeout=10)
        if code != 0:
            errors.append(f"{' '.join(cmd)}: {out.strip()}")

    return {
        "container": container_name,
        "interface": interface,
        "applied": bool(commands) and not errors,
        "commands": [" ".join(c) for c in commands],
        "errors": errors,
    }


def clear_impairment(client, container_name: str, interface: str) -> dict[str, Any]:
    """Remove any qdisc impairment from an interface.

    An interface with no root qdisc is already clear. `tc` reports that as a
    non-zero exit with "Cannot delete qdisc with handle of zero", which is a
    state description rather than a failure -- reporting it as an error would
    make a "Clear" click on an untouched link look broken.
    """
    container = _container(client, container_name)
    cmd = ["tc", "qdisc", "del", "dev", interface, "root"]
    code, out = _exec(container, cmd, timeout=10)
    already_clear = "handle of zero" in out or "No such file" in out
    return {
        "container": container_name,
        "interface": interface,
        "cleared": code == 0 or already_clear,
        "already_clear": already_clear,
        "output": "" if already_clear else out.strip(),
    }


def set_link_state(client, container_name: str, interface: str, up: bool) -> dict[str, Any]:
    """Bring a container interface up or down (link failure injection)."""
    container = _container(client, container_name)
    cmd = ["ip", "link", "set", interface, "up" if up else "down"]
    code, out = _exec(container, cmd, timeout=10)
    return {
        "container": container_name,
        "interface": interface,
        "state": "up" if up else "down",
        "ok": code == 0,
        "output": out.strip(),
    }


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def collect_all(client=None, include_ospf: bool = True) -> dict[str, Any]:
    """Sweep the whole lab and return every measured metric."""
    client = client or _client()
    lab = discover_lab()
    if not lab["online"]:
        raise LabUnavailable(lab.get("error") or "Lab not running")

    devices = [d for d in lab["devices"] if d["type"] in ("router", "pc")]
    container_map = lab["container_map"]
    ip_index = lab["ip_index"]

    jobs: dict[str, Callable[[], Any]] = {}
    for d in devices:
        name = container_map[d["id"]]
        jobs[f"if:{d['id']}"] = lambda n=name: probe_interfaces(client, n)
        jobs[f"res:{d['id']}"] = lambda n=name: probe_resources(client, n)
        if include_ospf and d["type"] == "router":
            jobs[f"ospf:{d['id']}"] = lambda n=name: probe_ospf(client, n)

    results: dict[str, Any] = {}
    futures = {k: _POOL.submit(fn) for k, fn in jobs.items()}
    for key, fut in futures.items():
        try:
            results[key] = fut.result(timeout=30)
        except Exception as exc:  # noqa: BLE001
            results[key] = {"error": str(exc)}

    return {
        "timestamp": time.time(),
        "lab": {
            "online": lab["online"],
            "device_count": len(lab["devices"]),
            "link_count": len(lab["links"]),
        },
        "devices": {d["id"]: d for d in devices},
        "ips": ip_index,
        "interfaces": {k.split(":", 1)[1]: v for k, v in results.items() if k.startswith("if:")},
        "resources": {k.split(":", 1)[1]: v for k, v in results.items() if k.startswith("res:")},
        "ospf": {k.split(":", 1)[1]: v for k, v in results.items() if k.startswith("ospf:")},
    }


def measure_path(
    source: str, destination: str, count: int = 5, include_traceroute: bool = True
) -> dict[str, Any]:
    """Measure a real source->destination path with ping (+ traceroute).

    A multi-homed device holds several addresses and any one of them may be
    unroutable from the source (R9's r8_r9 address vs its r9_r10 address, for
    example), so each of the destination's addresses is tried in turn and the
    first one that answers is used. Falling back to a single arbitrary address
    made reachable devices report 100% packet loss.
    """
    client = _client()
    lab = discover_lab()
    if not lab["online"]:
        raise LabUnavailable(lab.get("error") or "Lab not running")

    container_map = lab["container_map"]
    src, dst = source.upper(), destination.upper()

    if src not in container_map:
        raise LabUnavailable(f"'{source}' is not part of the running lab")

    target_ips = _target_addresses(lab, dst)
    if not target_ips:
        raise LabUnavailable(f"'{destination}' has no IP address in the lab")

    source_container = container_map[src]

    ping: dict[str, Any] | None = None
    target_ip = target_ips[0]
    tried: list[dict[str, Any]] = []

    for candidate in target_ips:
        attempt = probe_ping(client, source_container, candidate, count=count)
        tried.append({"ip": candidate, "reachable": attempt["reachable"]})
        if ping is None or attempt["reachable"]:
            ping, target_ip = attempt, candidate
        if attempt["reachable"]:
            break

    assert ping is not None
    result: dict[str, Any] = {
        "source": src,
        "destination": dst,
        "source_container": source_container,
        "target_ip": target_ip,
        "latency_ms": ping["rtt_avg_ms"],
        "rtt_min_ms": ping["rtt_min_ms"],
        "rtt_max_ms": ping["rtt_max_ms"],
        "jitter_ms": ping["jitter_ms"],
        "packet_loss_percent": ping["loss_percent"],
        "reachable": ping["reachable"],
        "packets_sent": ping["sent"],
        "packets_received": ping["received"],
        "addresses_tried": tried,
        "raw": {"ping": ping},
    }

    if include_traceroute:
        tr = probe_traceroute(client, source_container, target_ip)
        result["hop_count"] = tr["hop_count"]
        result["hops"] = tr["hops"]
        result["raw"]["traceroute"] = tr
    else:
        result["hop_count"] = None

    return result


def _target_addresses(lab: dict[str, Any], device_id: str) -> list[str]:
    """All addresses of a lab device, primary first, then the rest sorted."""
    device = next((d for d in lab["devices"] if d["id"] == device_id), None)
    if not device:
        return []

    addrs = list(device["addresses"].values())
    primary = lab["ip_index"].get(device_id)
    if primary in addrs:
        addrs.remove(primary)
        addrs.insert(0, primary)
    return addrs
