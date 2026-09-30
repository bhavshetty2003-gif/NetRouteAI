"""Live discovery of the Docker/FRR OSPF lab.

The lab topology is *discovered* from the Docker daemon rather than hardcoded, so
it always reflects the containers that are actually running. Discovery uses:

  * container list      -> device names + running state
  * container inspect   -> per-interface IPv4 addresses
  * network inspect     -> which containers share a bridge (i.e. a wire)

A shared bridge becomes a link in the lab graph. The result is a topology in the
same shape the rest of the backend uses (devices/links) so it can be fed to the
routing services unchanged.
"""

from __future__ import annotations

import functools
import ipaddress
import re
import time
from typing import Any

import docker
from docker.errors import DockerException, NotFound

# Container name -> logical device type
_ROUTER_RE = re.compile(r"^r\d+$", re.IGNORECASE)
_SWITCH_RE = re.compile(r"^(sw|switch)\d+$", re.IGNORECASE)
_PC_RE = re.compile(r"^(pc|host|h)\d+$", re.IGNORECASE)

# Transit links carry OSPF; LANs are multi-access segments.
_TRANSIT_PREFIX = "10."


def _client() -> docker.DockerClient | None:
    try:
        return docker.from_env()
    except DockerException:
        return None


def _device_type(name: str) -> str:
    if _ROUTER_RE.match(name):
        return "router"
    if _SWITCH_RE.match(name):
        return "switch"
    if _PC_RE.match(name):
        return "pc"
    return "host"


def _interfaces(container) -> dict[str, str]:
    """Return {interface_name: ipv4} for a container, ignoring loopback.

    Interface names come from `ip -o -4 addr` inside the container because the
    Docker API exposes networks, not kernel interface names -- and the kernel
    names (eth0, eth1, ...) are what `tc`/`ip -s link` need.
    """
    try:
        res = container.exec_run(
            ["ip", "-o", "-4", "addr", "show"], demux=True
        )
        output = res.output.decode() if res.output else ""
    except Exception:
        output = ""

    out: dict[str, str] = {}
    for line in output.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        iface = parts[1].split("@")[0]
        addr = parts[3].split("/")[0]
        if iface != "lo":
            out[iface] = addr

    if out:
        return out

    # Fallback: Docker network settings (no interface names available)
    try:
        netattrs = container.attrs["NetworkSettings"]["Networks"]
    except (KeyError, TypeError):
        return out
    for idx, net in enumerate(netattrs.values()):
        addr = net.get("IPAddress")
        if addr:
            out[f"eth{idx}"] = addr
    return out


def _shared_networks(client) -> dict[str, dict[str, str]]:
    """Map bridge network name -> {container_name: ipv4} for multi-member bridges.

    Each network is inspected individually: the list/summary endpoints omit
    the `Containers` map, so only `network(id)` reveals which containers (and
    with which addresses) share a bridge.
    """
    shared: dict[str, dict[str, str]] = {}
    try:
        summaries = client.api.networks()
    except DockerException:
        return shared

    for summary in summaries:
        net_id = summary.get("Id")
        if not net_id:
            continue
        try:
            detail = client.api.inspect_network(net_id)
        except (DockerException, NotFound):
            continue

        containers = detail.get("Containers") or {}
        if len(containers) < 2:
            continue

        members = {
            c.get("Name"): (c.get("IPv4Address") or "").split("/")[0]
            for c in containers.values()
            if c.get("Name")
        }
        if len(members) >= 2:
            shared[detail.get("Name") or net_id] = members
    return shared


@functools.lru_cache(maxsize=1)
def _cached_discovery(ttl_bucket: int) -> dict[str, Any]:  # pragma: no cover - thin cache
    return _discover()


def discover_lab(ttl: float = 10.0) -> dict[str, Any]:
    """Discover the running lab. Cached for `ttl` seconds.

    Returns a dict with:
      online         bool   - whether a usable lab was found
      devices        list   - [{id, type, name, status, addresses: {iface: ip}}]
      links          list   - [{id, source, target, subnet, kind, members}]
      container_map  dict   - device id -> container name
      ip_index       dict   - device id -> primary ipv4
      error          str|None
    """
    bucket = int(time.time() / max(ttl, 0.001))
    return _cached_discovery(bucket)


def _discover() -> dict[str, Any]:
    client = _client()
    if client is None:
        return {
            "online": False,
            "devices": [],
            "links": [],
            "container_map": {},
            "ip_index": {},
            "error": "Docker daemon unreachable",
        }

    try:
        containers = client.containers.list(all=False)
    except DockerException as exc:
        return {
            "online": False,
            "devices": [],
            "links": [],
            "container_map": {},
            "ip_index": {},
            "error": f"Docker error: {exc}",
        }

    devices: list[dict[str, Any]] = []
    container_map: dict[str, str] = {}
    ip_index: dict[str, str] = {}

    for c in containers:
        name = c.name
        if not (_ROUTER_RE.match(name) or _SWITCH_RE.match(name) or _PC_RE.match(name)):
            continue

        addrs = _interfaces(c)
        device_id = name.upper()
        devices.append(
            {
                "id": device_id,
                "name": name,
                "type": _device_type(name),
                "status": "running" if c.status == "running" else "stopped",
                "container": name,
                "addresses": addrs,
            }
        )
        container_map[device_id] = name
        if addrs:
            # Primary address = first non-loopback, deterministic by sort
            ip_index[device_id] = sorted(addrs.items(), key=lambda kv: int(kv[0][2:]) if kv[0][2:].isdigit() else 0)[0][1]

    links: list[dict[str, Any]] = []
    try:
        shared = _shared_networks(client)
    except DockerException:
        shared = {}

    for net_name, member_ips in sorted(shared.items()):
        present = sorted(
            m for m in member_ips if m.upper() in container_map and member_ips[m]
        )
        if len(present) < 2:
            continue

        # Subnet is identical for every member of a bridge; take the first
        # address and derive the link network from it.
        subnet = str(ipaddress.ip_network(f"{member_ips[present[0]]}/29", strict=False))
        kind = "lan" if not subnet.startswith(_TRANSIT_PREFIX) else "transit"

        for i in range(len(present)):
            for j in range(i + 1, len(present)):
                a, b = present[i], present[j]
                links.append(
                    {
                        "id": f"{net_name}:{a}--{b}",
                        "source": a.upper(),
                        "target": b.upper(),
                        "network": net_name,
                        "subnet": subnet,
                        "kind": kind,
                        "members": [m.upper() for m in present],
                    }
                )

    return {
        "online": bool(devices),
        "devices": sorted(devices, key=lambda d: d["id"]),
        "links": links,
        "container_map": container_map,
        "ip_index": ip_index,
        "error": None if devices else "No lab containers running",
    }


def lab_to_topology(lab: dict[str, Any]) -> dict[str, Any]:
    """Convert a discovered lab into the backend topology dict shape."""
    devices = [
        {
            "id": d["id"],
            "type": d["type"],
            "name": d["name"],
            "ip_address": lab["ip_index"].get(d["id"]),
        }
        for d in lab["devices"]
    ]
    links = [
        {
            "source": l["source"],
            "target": l["target"],
            "cost": 10,
            "bandwidth": 1000,
            "latency": 1,
            "loss_probability": 0.0,
        }
        for l in lab["links"]
    ]
    return {"devices": devices, "links": links, "auto_ip": False}


def adjacency(lab: dict[str, Any]) -> dict[str, set[str]]:
    """Neighbour sets for the lab graph (transit links only carry OSPF)."""
    adj: dict[str, set[str]] = {d["id"]: set() for d in lab["devices"]}
    for link in lab["links"]:
        if link["kind"] != "transit":
            continue
        adj[link["source"]].add(link["target"])
        adj[link["target"]].add(link["source"])
    return adj
