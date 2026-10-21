"""The IPv4 networks this machine is already using, and the ones it must not.

Why this module exists
-----------------------
Docker turns every bridge network's IPAM subnet into a *route on the host*:

    10.99.0.0/24 dev br-4bd0cb4d2960 proto kernel scope link src 10.99.0.1

That route carries no metric -- it is metric 0 -- while the route a laptop's
wifi gets from DHCP carries metric 600. So when the lab claimed a subnet the
machine was already on, the kernel preferred Docker's route and the machine
sent everything meant for its router's gateway address through a Docker
bridge instead. The gateway stopped answering, DHCP and DNS gave up, and the
desktop showed an unidentified network: a question mark on the wifi icon and
no internet on the very machine that was running the lab.

Nothing about the lab is wrong in that picture. A bridge network is *supposed*
to add a route; the fault is claiming a route for a network the machine is
already using. So the lab has to know which networks the machine is using
before it picks one, and this module is where it finds out.

How the machine's networks are found
------------------------------------
``/proc/net/route`` is the kernel's routing table for the network namespace
the calling process is in. When the backend runs on the machine itself
(``./start.sh``) that *is* the machine's table, and the file answers the
question directly. When the backend runs as a container
(``docker compose up``) the file describes the *container's* namespace
instead, so the table is read from a throwaway container that shares the
host's network namespace (``--network host``) -- the same namespace the
Docker daemon creates every bridge in, and therefore the namespace the
conflicting route would land in.

The reading is cached, because it costs a container start and the machine's
networks change only when it joins another one.
"""

from __future__ import annotations

import ipaddress
import os
import socket
import struct
import sys
import time
from typing import Any

# How long a reading is trusted. The machine's networks change when it joins a
# different one -- the office router one minute and a phone hotspot the next --
# and a stale reading would let the lab claim the network just joined.
_TTL_SECONDS = 60.0

# The route table of the machine itself, and the pools held by Docker's own
# networks. Both are cached separately: the first is read from a file (or a
# container), the second from the daemon.
_ROUTE_CACHE: dict[str, Any] = {"at": 0.0, "value": None}
_POOL_CACHE: dict[str, Any] = {"at": 0.0, "value": None}

# Networks that are somebody's LAN almost everywhere. These are only used when
# the machine's own routing table cannot be read at all: guessing wrong costs
# the lab a subnet it could have used, and not guessing costs the machine its
# wifi.
_FALLBACK_LANS = (
    "192.168.0.0/24",   # the default on most consumer routers
    "192.168.1.0/24",   # and on most of the rest
    "192.168.10.0/24",  # TP-Link and friends
    "192.168.31.0/24",  # Xiaomi/Redmi
    "192.168.42.0/24",  # an Android hotspot, older layout
    "192.168.43.0/24",  # an Android hotspot
    "172.20.10.0/28",   # an iPhone hotspot
    "10.0.0.0/24",      # some hotspots and small office routers
)

# Interface name prefixes that belong to Docker rather than to the machine's
# own network. The lab's own bridges are excluded for a second reason as well:
# they are removed before every deploy, so their subnets are free again, and
# counting them would make the plan depend on whether a lab happens to be
# running.
_DOCKER_INTERFACE_PREFIXES = ("br-", "docker", "veth", "virbr", "cni", "flannel", "kube")


# --------------------------------------------------------------------------- #
# Reading the machine's routing table
# --------------------------------------------------------------------------- #
def _read_text(path: str) -> str:
    try:
        with open(path) as handle:
            return handle.read()
    except OSError:
        return ""


def in_container() -> bool:
    """Whether this process is inside a container rather than on the machine."""
    if os.path.exists("/.dockerenv"):
        return True
    cgroup = _read_text("/proc/1/cgroup")
    return any(marker in cgroup for marker in ("docker", "containerd", "kubepods", "podman"))


def _parse_route_table(text: str) -> list[tuple[str, ipaddress.IPv4Network]]:
    """The directly connected networks in a ``/proc/net/route`` dump.

    The kernel prints the address and the mask as 32-bit hex in *host* byte
    order, so the bytes have to be put back the right way round before they
    mean anything.

    Docker's own bridges are left out: their pools are accounted for
    separately, by the daemon's list of networks, and the lab's own bridges are
    removed before every deploy -- so counting them here would make the plan
    depend on whether a lab happens to be running.
    """
    order = "<I" if sys.byteorder == "little" else ">I"
    found: list[tuple[str, ipaddress.IPv4Network]] = []
    for line in text.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 8:
            continue
        iface, destination, _gateway, _flags, _ref, _use, _metric, mask = parts[:8]
        try:
            prefix = int(mask, 16).bit_length()
            address = socket.inet_ntoa(struct.pack(order, int(destination, 16)))
        except (ValueError, struct.error, OSError):
            continue
        if prefix == 0:
            # The default route. The network it points at is already listed as
            # a connected route on the interface it left through.
            continue
        try:
            network = ipaddress.ip_network(f"{address}/{prefix}", strict=False)
        except ValueError:
            continue
        if network.is_loopback:
            continue
        if iface.lower().startswith(_DOCKER_INTERFACE_PREFIXES):
            continue
        found.append((iface, network))
    return found


def _route_table_text() -> str:
    """The machine's routing table, however this process has to reach it."""
    if not in_container():
        return _read_text("/proc/net/route")
    return _route_table_via_docker()


def _route_table_via_docker() -> str:
    """The host's routing table, read through a container in its namespace.

    A container started with ``--network host`` shares the host's network
    namespace, so ``/proc/net/route`` inside it is the host's table -- the
    table the conflicting route would be added to.
    """
    client = _docker_client()
    if client is None:
        return ""
    image = _helper_image(client)
    if not image:
        return ""
    try:
        container = client.containers.run(
            image,
            ["/proc/net/route"],
            entrypoint=["cat"],
            network_mode="host",
            detach=True,
        )
    except Exception:
        return ""
    try:
        container.wait(timeout=20)
        raw = container.logs()
    except Exception:
        return ""
    finally:
        try:
            container.remove(force=True)
        except Exception:
            pass
    if isinstance(raw, bytes):
        return raw.decode(errors="replace")
    return str(raw)


def _docker_client():
    try:
        import docker

        return docker.from_env()
    except Exception:
        return None


def _helper_image(client) -> str:
    """A local image that can read a file, for the host-namespace probe.

    The backend's own image is preferred: it is certainly present (the backend
    is running from it) and it certainly has a shell. The alternatives are
    there for the case where the backend runs on the machine itself and no
    backend image was ever built.
    """
    for name in _own_image_names():
        try:
            container = client.containers.get(name)
        except Exception:
            continue
        try:
            tags = container.image.tags
        except Exception:
            continue
        if tags:
            return tags[0]
    for candidate in ("netrouteai-backend", "frrouting/frr:latest", "alpine:latest", "busybox:latest"):
        try:
            client.images.get(candidate)
        except Exception:
            continue
        return candidate
    return ""


def _own_image_names() -> list[str]:
    """Names that might identify this process's own container."""
    names = []
    hostname = socket.gethostname()
    if hostname:
        names.append(hostname)
    from_file = _read_text("/etc/hostname").strip()
    if from_file and from_file not in names:
        names.append(from_file)
    return names


# --------------------------------------------------------------------------- #
# The machine's networks
# --------------------------------------------------------------------------- #
def _read_host() -> tuple[list[ipaddress.IPv4Network], list[dict[str, str]]]:
    """The machine's networks, and the interface each one came from."""
    parsed = _parse_route_table(_route_table_text())
    networks: list[ipaddress.IPv4Network] = []
    details: list[dict[str, str]] = []
    for iface, network in parsed:
        if network in networks:
            continue
        networks.append(network)
        details.append({"network": str(network), "iface": iface})

    if not networks:
        # The table could not be read (no /proc, no daemon, no image to probe
        # with). Fall back to the LANs almost every network is on, because
        # taking the wrong subnet is a worse failure than not using one.
        networks = [ipaddress.ip_network(text) for text in _FALLBACK_LANS]
        details = [{"network": text, "iface": "unknown"} for text in _FALLBACK_LANS]
    return networks, details


def host_networks(refresh: bool = False) -> list[ipaddress.IPv4Network]:
    """The IPv4 networks this machine is directly attached to.

    These are the ones the lab must not claim: claiming one puts a competing
    route in front of the machine's own.
    """
    return list(_cached_host(refresh)[0])


def host_network_details(refresh: bool = False) -> list[dict[str, str]]:
    """The machine's networks with the interface each one came from."""
    return [dict(entry) for entry in _cached_host(refresh)[1]]


def _cached_host(refresh: bool) -> tuple[list[ipaddress.IPv4Network], list[dict[str, str]]]:
    now = time.time()
    if (
        not refresh
        and _ROUTE_CACHE["value"] is not None
        and now - _ROUTE_CACHE["at"] < _TTL_SECONDS
    ):
        return list(_ROUTE_CACHE["value"]), [dict(entry) for entry in _ROUTE_CACHE["details"]]

    networks, details = _read_host()
    _ROUTE_CACHE["at"] = now
    _ROUTE_CACHE["value"] = list(networks)
    _ROUTE_CACHE["details"] = [dict(entry) for entry in details]
    return networks, details


def docker_pools(
    exclude_project: str | None = None, refresh: bool = False
) -> dict[str, list[ipaddress.IPv4Network]]:
    """The subnets Docker's networks hold, by network name.

    A network of `exclude_project` is left out: the lab removes its own
    resources before every deploy, so those subnets are free again, and
    counting them would make the plan depend on whether a lab happens to be
    running.

    The application stack's own network is *not* left out. It is created
    before the backend starts and lives until the stack is brought down, and a
    lab link that landed inside it would be refused by the daemon with
    "invalid pool request: Pool overlaps with other one on this address space".
    """
    now = time.time()
    if (
        not refresh
        and _POOL_CACHE["value"] is not None
        and now - _POOL_CACHE["at"] < _TTL_SECONDS
    ):
        return _filter_pools(_POOL_CACHE["value"], exclude_project)

    client = _docker_client()
    pools: dict[str, dict[str, Any]] = {}
    if client is not None:
        try:
            networks = client.networks.list()
        except Exception:
            networks = []
        for network in networks:
            subnets: list[ipaddress.IPv4Network] = []
            config = (network.attrs.get("IPAM") or {}).get("Config") or []
            for entry in config:
                raw = entry.get("Subnet")
                if not raw:
                    continue
                try:
                    subnets.append(ipaddress.ip_network(raw, strict=False))
                except ValueError:
                    continue
            if not subnets:
                continue
            labels = network.attrs.get("Labels") or {}
            pools[network.name] = {
                "project": labels.get("com.docker.compose.project"),
                "subnets": subnets,
            }

    _POOL_CACHE["at"] = now
    _POOL_CACHE["value"] = pools
    return _filter_pools(pools, exclude_project)


def _filter_pools(
    pools: dict[str, dict[str, Any]], exclude_project: str | None
) -> dict[str, list[ipaddress.IPv4Network]]:
    """The pools to avoid, with one compose project's networks left out."""
    return {
        name: list(entry["subnets"])
        for name, entry in pools.items()
        if not (exclude_project and entry.get("project") == exclude_project)
    }


def reserved_networks(
    exclude_project: str | None = None, refresh: bool = False
) -> list[ipaddress.IPv4Network]:
    """Every subnet the lab must not claim.

    That is the machine's own networks -- claiming one takes the machine's
    wifi down -- and the pools Docker's other networks hold -- claiming one
    makes the daemon refuse the lab's network outright.
    """
    reserved = list(host_networks(refresh=refresh))
    for pools in docker_pools(exclude_project=exclude_project, refresh=refresh).values():
        for subnet in pools:
            if subnet not in reserved:
                reserved.append(subnet)
    return reserved


def conflict_for(
    subnet: ipaddress.IPv4Network, reserved: list[ipaddress.IPv4Network]
) -> ipaddress.IPv4Network | None:
    """The reserved network `subnet` would collide with, if any."""
    for other in reserved:
        if subnet.overlaps(other):
            return other
    return None


def describe(network: ipaddress.IPv4Network) -> str:
    """Where a network is, in words.

    The address is not repeated here: the callers have already said which
    network they mean, and "was given 192.168.0.0/24, which is
    192.168.0.0/24" says the same thing twice.
    """
    for entry in host_network_details():
        if entry["network"] == str(network):
            return f"the network this machine is on ({entry['iface']})"
    return "a subnet another Docker network already holds"


def reset_cache() -> None:
    """Forget the cached readings."""
    _ROUTE_CACHE["at"] = 0.0
    _ROUTE_CACHE["value"] = None
    _ROUTE_CACHE.pop("details", None)
    _POOL_CACHE["at"] = 0.0
    _POOL_CACHE["value"] = None
