"""Deploy the topology drawn in the designer as a real FRR lab.

This is the piece that makes the analytics page honest. The drawn topology
becomes the running lab, using the exact addresses, costs and areas the
designer holds.

Two properties matter more than anything else here:

  * **The addresses are the designer's.** They are planned once, returned to the
    caller and persisted, so the canvas, this module and the running routers all
    agree. Nothing re-derives an address behind the caller's back.
  * **Interface-to-cost/area assignment is measured, not predicted.** Docker
    decides which kernel interface (`ethN`) lands on which network, and that
    ordering is not the order the compose file lists. The containers are
    therefore created first, the real `iface -> ip` mapping is read back with
    `docker inspect`, and only then is `frr.conf` written. Guessing produced
    configs where the cost and the area landed on the wrong interface.

The generated lab uses one Docker bridge per link, so a link failure is a real
`ip link set down` and `tc` impairment is real, exactly as in the fixed lab.
"""

from __future__ import annotations

import ipaddress
import json
import os
import re
import shutil
import subprocess
import time
from typing import Any

import docker
from docker.errors import DockerException, NotFound

from host_networks import conflict_for, describe, reserved_networks

LAB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "labs", "current")
COMPOSE_PROJECT = "netrouteai"

# The label Docker Compose puts on every container and network it creates.
# Selecting the lab's resources by this label rather than by name is what
# keeps the lab's teardown away from the application stack, whose own project
# is `netrouteai-app` -- a name match on "netrouteai" would match it too.
COMPOSE_PROJECT_LABEL = "com.docker.compose.project"

# Routers are named after the designer's ids so the existing live discovery
# (`^r\d+$` in lab_topology) keeps working unchanged and so a canvas id and a
# container name never drift apart.
_ROUTER_ID = re.compile(r"^r(\d+)$", re.IGNORECASE)

# A router's display name is written into `frr.conf` as `hostname <name>`, and
# its router-id is written as `ospf router-id <id>` and pushed through `vtysh`.
# Both are text taken from the request body, so both are checked before they
# reach the config file: a name containing a newline would otherwise append
# whatever followed it as extra FRR configuration, and a router-id is an IPv4
# address by definition.
_ROUTER_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

# Address classes. The designer picks a class per link and the mask follows from
# it, so "Class C" means /24 without anyone typing a prefix. Each class draws
# from its own block so all three can be used in one topology without their
# subnets ever overlapping -- a single Class A link otherwise swallows every
# Class C link in 10/8.
#
# Docker accepts all three prefix lengths on a bridge (verified: /8, /16 and /24
# all create cleanly, and fail only when they overlap an existing pool), so the
# mask is genuinely the kernel's, not a label.
#
#   Class A -> /8   Class B -> /16   Class C -> /24
CLASS_A = "A"
CLASS_B = "B"
CLASS_C = "C"

CLASS_PREFIX = {CLASS_A: 8, CLASS_B: 16, CLASS_C: 24}

# Class A: one /8 per first octet (10, 11, 12, ...). Class B: one /16 per second
# octet (172.16, 172.18, 172.19, ...; 172.17 is Docker's own default pool).
# Class C: one /24 per third octet. The three blocks are disjoint.
_CLASS_A_FIRST_OCTET = 10
_CLASS_B_SECOND_OCTET = [16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
_CLASS_C_THIRD_OCTET = list(range(0, 256))

# How many candidate subnets to try before giving up.
_MAX_SUBNET_ATTEMPTS = 256

# The default when a link states no class: Class C, the only class that scales
# to a topology with one segment per link.
DEFAULT_CLASS = CLASS_C

# .1 is left to Docker as the bridge gateway; endpoints start at .2.
_FIRST_HOST = 2

# Time given to the lab to settle: long enough for Docker to finish renaming
# interfaces across a restart, and long enough for OSPF to register an
# interface on the routers. Twelve routers are configured and read back in one
# pass, so this is multiplied by the retry count in `configure`.
_SETTLE_SECONDS = 8

# How long to let FRR breathe between pushing the configuration and reading it
# back. A daemon that `watchfrr` restarts while the push is in flight comes
# back a moment later with the configuration it re-read from frr.conf, so an
# immediate read-back sees the gap rather than the result.
_PUSH_SETTLE_SECONDS = 3

DAEMONS = """zebra=yes
bgpd=no
ospfd=yes
ospf6d=no
ripd=no
ripngd=no
isisd=no
pimd=no
ldpd=no
nhrpd=no
eigrpd=no
babeld=no
sharpd=no
staticd=yes
pbrd=no
bfdd=no
fabricd=no
vrrpd=no

vtysh_enable=yes
zebra_options="-A 127.0.0.1"
ospfd_options="-A 127.0.0.1"
staticd_options="-A 127.0.0.1"
"""

VTYSH_CONF = "service integrated-vtysh-config\nhostname frr\n"

FRR_HEADER = """frr version 8.4_git
frr defaults traditional
hostname {hostname}
no ipv6 forwarding
service integrated-vtysh-config
!
"""


class DeployError(Exception):
    """A topology the lab cannot be built from. Carries a caller-facing reason."""


def _compose(*args: str, cwd: str = LAB_DIR) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            ["docker", "compose", "-p", COMPOSE_PROJECT, *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired as exc:
        # A hung `docker compose` is a refusal with a reason, not a crash: the
        # reason is what the user needs, and an unhandled exception here used
        # to reach the browser as an unreadable "Failed to fetch".
        raise DeployError(
            f"docker compose {' '.join(args)} did not finish within "
            f"{int(exc.timeout or 0)}s"
        ) from exc
    except FileNotFoundError as exc:
        raise DeployError(
            "The `docker` command was not found, so no lab can be built."
        ) from exc


def _client() -> docker.DockerClient:
    try:
        return docker.from_env()
    except DockerException as exc:
        raise DeployError(f"Docker daemon unreachable: {exc}") from exc


def _router_name(raw: Any, fallback: str) -> tuple[str, str | None]:
    """A router's display name, made safe before it reaches `frr.conf`.

    The name becomes the line `hostname <name>` in the router's config file.
    FRR's `hostname` takes a single word, so a name carrying a space is not
    accepted by the daemon -- and a name carrying a newline would put whatever
    followed it on the next line of that file as a configuration line of its
    own.

    So the name is *sanitised* rather than refused: characters FRR will not
    take become dashes. Refusing the whole deployment over a cosmetic field
    would mean a user who typed "Edge A" could not deploy at all. The second
    value returned is a note saying the name was changed, so the change is
    visible rather than silent.
    """
    name = str(raw or "").strip()
    if not name:
        return fallback, None
    if _ROUTER_NAME.match(name):
        return name, None

    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-._")
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    if not cleaned:
        cleaned = fallback
    if not cleaned[0].isalnum():
        cleaned = f"r-{cleaned}"
    cleaned = cleaned[:64]
    note = (
        f"Router '{_one_line(name)}' is not a valid FRR hostname; it was "
        f"deployed as '{cleaned}'."
    )
    return cleaned, note


def _one_line(text: str) -> str:
    """A single-line rendering of a name, for a message that is read on a page."""
    return re.sub(r"\s+", " ", text).strip()


def _router_id(raw: Any) -> str:
    """An OSPF router-id, checked before it reaches `frr.conf` or `vtysh`.

    A router-id is an IPv4 address. Validating it as one catches a value with a
    newline in it -- which would otherwise be pushed as a second `vtysh` command
    -- as well as a value that FRR would reject with a message nobody reads.
    An empty value means "not supplied"; the caller fills one in.
    """
    value = str(raw or "").strip()
    if not value:
        return ""
    try:
        return str(ipaddress.IPv4Address(value))
    except ipaddress.AddressValueError as exc:
        raise DeployError(
            f"OSPF router-id '{value}' is not a valid IPv4 address"
        ) from exc


def _generated_router_id(index: int) -> str:
    """The router-id used when the caller supplied none: `1.1.1.1`, `2.2.2.2`, …

    Each octet is the router's position, so the ids are unique and obviously
    not addresses of anything. There are only 255 usable octets, so a
    topology larger than that is refused rather than configured with an
    address the kernel would not accept.
    """
    if index > 255:
        raise DeployError(
            f"A topology of {index} routers is too large: OSPF router-ids are "
            f"generated from the router's position and only 255 are available"
        )
    return f"{index}.{index}.{index}.{index}"


# --------------------------------------------------------------------------- #
# Planning
# --------------------------------------------------------------------------- #
def resolve_plan(topology: dict[str, Any]) -> dict[str, Any]:
    """Turn a drawn topology into a fully addressed lab plan.

    Addresses the caller supplied are kept verbatim; only the ones left unset
    are filled in. The result is the single source of truth for the IPs and is
    handed back to the caller so the canvas can adopt it.
    """
    routers_in = topology.get("routers") or topology.get("devices") or []
    links_in = topology.get("links") or []

    routers: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    # Anything the plan had to change, said out loud. A link that was moved off
    # a clashing address is reported rather than quietly rewritten; so is a
    # router name that had to be made into a valid FRR hostname.
    notes: list[str] = []
    for raw in routers_in:
        device_id = str(raw.get("id") or "").strip()
        if not device_id:
            raise DeployError("A router has no id")
        if str(raw.get("type", "router")).lower() != "router":
            continue
        match = _ROUTER_ID.match(device_id)
        if not match:
            raise DeployError(
                f"Router '{device_id}' cannot be deployed: router ids must look "
                f"like R1, R2, R3 … (got '{device_id}')"
            )
        key = device_id.upper()
        if key in seen_ids:
            raise DeployError(f"Duplicate router id '{device_id}'")
        seen_ids.add(key)
        name, name_note = _router_name(raw.get("name"), key)
        if name_note:
            notes.append(name_note)
        routers.append(
            {
                "id": key,
                "container": f"r{match.group(1)}",
                "name": name,
                "area": _normalise_area(raw.get("area", 0)),
                "router_id": _router_id(raw.get("router_id")),
            }
        )
    if not routers:
        raise DeployError("The topology has no routers to deploy")
    if len(routers) < 2:
        raise DeployError("Deploy needs at least two routers")

    # Canonical order so eth assignment and container numbering are stable.
    routers.sort(key=lambda r: int(r["container"][1:]))
    for index, router in enumerate(routers, start=1):
        router["router_id"] = router["router_id"] or _generated_router_id(index)

    by_id = {r["id"]: r for r in routers}

    links: list[dict[str, Any]] = []
    used_addresses: dict[str, str] = {}
    used_subnets: set[ipaddress.IPv4Network] = set()

    # The networks this machine is already using, and the pools Docker's other
    # networks hold. A link is never given one of them: Docker puts a route on
    # the host for every bridge network it creates, so a link that took the
    # machine's own network would put the lab's traffic in front of the
    # machine's router and leave it with no connection at all.
    reserved = reserved_networks(exclude_project=COMPOSE_PROJECT)

    # Reserve every subnet the caller already holds BEFORE allocating anything.
    #
    # Allocation is greedy and runs in list order, so without this a link that
    # needs a fresh subnet takes the first free candidate even when a link
    # further down the list is already sitting on it. That later link is then
    # refused as a duplicate, and the whole plan fails even though a free subnet
    # was available. Renumbering one link's class is what exposes it: clearing
    # l6 (which comes early) to Class A made it claim 10.0.0.0/8 before l7, which
    # already held it, had been considered.
    #
    # Reserving first makes the result independent of link order, which is the
    # property the canvas needs -- a link's address depends on its own class and
    # the set of addresses already held, not on where it happens to sit in the
    # array.
    #
    # Overlap is checked, not just equality. Holding 10.0.0.0/24 and then
    # allocating 10.0.0.0/8 gives two links the same host addresses, because
    # every address in the /24 also sits inside the /8. The per-class blocks are
    # disjoint by first octet, so this can only arise across a prefix boundary
    # -- a supplied /24 inside an allocated /8 -- but it has to be caught, since
    # the routers would be configured with two addresses for one interface.
    held: list[tuple[ipaddress.IPv4Network, str]] = []
    for raw in links_in:
        supplied_subnet = str(raw.get("subnet") or "").strip()
        supplied_source = str(raw.get("source_ip") or "").strip()
        supplied_target = str(raw.get("target_ip") or "").strip()
        if not (supplied_subnet or supplied_source or supplied_target):
            continue
        label = f"{raw.get('source')}–{raw.get('target')}"
        name = str(raw.get("id") or label)
        subnet = _subnet_from_supplied(supplied_subnet, supplied_source, supplied_target)
        for other, owner in held:
            if subnet.overlaps(other):
                raise DeployError(
                    f"Link {label} claims {subnet}, which overlaps {other} already "
                    f"held by link {owner}"
                )
        held.append((subnet, name))
    for subnet, _ in held:
        used_subnets.add(subnet)

    for index, raw in enumerate(links_in):
        source = str(raw.get("source") or "").upper()
        target = str(raw.get("target") or "").upper()
        if source not in by_id or target not in by_id:
            missing = source if source not in by_id else target
            raise DeployError(
                f"Link {source}–{target} refers to '{missing}', which is not a "
                f"router in this topology"
            )
        if source == target:
            raise DeployError(f"Link {source}–{target} connects a router to itself")

        cost = _clamp_int(raw.get("cost"), default=10, low=1, high=65535)
        # A link with no area of its own is in its source router's area, so
        # setting an area on a router in the designer gives every link it starts
        # that area unless the link overrides it.
        area = _normalise_area(
            raw.get("area", raw.get("source_area", by_id[source]["area"]))
        )

        subnet, source_ip, target_ip, address_class, mask = _addresses_for(
            raw, used_subnets, used_addresses, notes, reserved
        )
        _claim(source_ip, source, used_addresses)
        _claim(target_ip, target, used_addresses)

        links.append(
            {
                "id": str(raw.get("id") or f"link{index}"),
                "source": source,
                "target": target,
                "subnet": subnet,
                "mask": mask,
                "address_class": address_class,
                "source_ip": source_ip,
                "target_ip": target_ip,
                "cost": cost,
                "area": area,
                # Zero padded so alphabetical network ordering matches link
                # ordering, which is what makes ethN predictable.
                "network": f"n{index:02d}",
            }
        )

    if not links:
        raise DeployError("The topology has no links to deploy")

    orphans = sorted(set(by_id) - {d for l in links for d in (l["source"], l["target"])})
    if orphans:
        raise DeployError(
            f"These routers are not connected to anything: {', '.join(orphans)}"
        )

    # Give every router one headline address for the designer to show. All
    # interface addresses are already unique; this additionally guarantees two
    # routers never present the *same* address as their identity, which is what
    # "each router has a distinct IP" has to mean if the UI is to pick a single
    # address per router.
    primaries: dict[str, str] = {}
    for link in links:
        for router, address in (
            (link["source"], link["source_ip"]),
            (link["target"], link["target_ip"]),
        ):
            best = primaries.get(router)
            if best is None or _address_sort_key(address) < _address_sort_key(best):
                primaries[router] = address
    taken: dict[str, str] = {}
    for router, address in sorted(primaries.items()):
        if address in taken:
            raise DeployError(
                f"{router} and {taken[address]} would both be {address}; each "
                f"router needs a distinct address"
            )
        taken[address] = router
    for router in routers:
        router["ip"] = primaries.get(router["id"])

    return {
        "routers": routers,
        "links": links,
        "areas": sorted({r["area"] for r in routers} | {l["area"] for l in links}),
        "notes": notes,
    }


def _address_sort_key(address: str) -> tuple[int, ...]:
    try:
        return tuple(int(part) for part in str(address).split("."))
    except ValueError:
        return (999, 999, 999, 999)


def _normalise_area(value: Any) -> int:
    try:
        area = int(value)
    except (TypeError, ValueError) as exc:
        raise DeployError(f"'{value}' is not a valid OSPF area (use 0 or higher)") from exc
    if area < 0 or area > 0xFFFFFF:
        raise DeployError(f"OSPF area {area} is out of range")
    return area


def _clamp_int(value: Any, default: int, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def resolve_class(value: Any) -> str:
    """Normalise an address class, accepting 'a'/'A'/'class a'/'8' and friends."""
    if value is None or value == "":
        return DEFAULT_CLASS
    text = str(value).strip().upper()
    if text in (CLASS_A, CLASS_B, CLASS_C):
        return text
    for letter, bits in CLASS_PREFIX.items():
        if text in (f"CLASS {letter}", f"/{bits}", str(bits), f"CLASS{letter}"):
            return letter
    raise DeployError(
        f"'{value}' is not an address class. Use A (/8), B (/16) or C (/24)."
    )


def mask_for_class(address_class: str) -> str:
    """The dotted mask a class implies -- /8 -> 255.0.0.0 and so on."""
    return str(ipaddress.ip_network(f"0.0.0.0/{CLASS_PREFIX[address_class]}").netmask)


def _bridge_network(subnet: str, addresses: list[str]) -> ipaddress.IPv4Network:
    """The Docker bridge pool for a link, as a network.

    The routers must be numbered classfully -- a Class A link is 10/8, a Class B
    link is 172.16/16 -- but the *Docker bridge* must NOT be given that whole
    block. A bridge pool of 10.0.0.0/8 or 172.16.0.0/16 claims every address in
    the range, so the next such network on the daemon, or the root
    `netrouteai-app` stack, fails to create with "invalid pool request: Pool
    overlaps with other one on this address space". That is exactly what broke a
    deploy after a lab with a Class A or Class B link had once been up: the
    leftover `netrouteai_n06` held 10.0.0.0/8 and every later create collided.

    The smallest prefix that still contains the bridge gateway (.1) and both
    router endpoints is pinned, so the pool cannot reach outside this link's own
    range. A /24 or longer already spans only itself and is returned unchanged.

    This pool is also what becomes a route on the host, so it is the thing that
    has to be kept away from the machine's own network -- see host_networks.py.
    """
    network = ipaddress.ip_network(subnet, strict=False)
    if network.prefixlen >= 24:
        return network

    # Grow the prefix from /29 upwards until every endpoint and the .1 gateway
    # fall inside it. Taking a fixed /29 would fail the moment an endpoint was
    # typed at, say, 192.168.0.50 -- Docker rejects an ipv4_address outside the
    # network's pool.
    members = [ipaddress.ip_address(a) for a in addresses if a]
    members.append(ipaddress.ip_address(int(network.network_address) + 1))
    for prefix in range(29, network.prefixlen - 1, -1):
        candidate = ipaddress.ip_network((int(network.network_address), prefix))
        if all(address in candidate for address in members):
            return candidate
    return network


def _bridge_pool(subnet: str, addresses: list[str]) -> str:
    """The Docker bridge pool to pin for a link, holding every `addresses` entry."""
    return str(_bridge_network(subnet, addresses))


def _first_hosts(subnet: ipaddress.IPv4Network) -> tuple[str, str]:
    """The two addresses a link's ends are given, without listing the subnet.

    `list(subnet.hosts())` on a Class A link materialises sixteen million
    addresses: 1.7 GB of memory and four seconds for a single link, on the
    machine that is running the lab. The generator hands out the same two
    addresses without ever building the list.
    """
    hosts = subnet.hosts()
    picked: list[ipaddress.IPv4Address] = []
    try:
        for _ in range(_FIRST_HOST + 1):
            picked.append(next(hosts))
    except StopIteration:
        raise DeployError(
            f"{subnet} has too few usable addresses to carry a link"
        ) from None
    return str(picked[_FIRST_HOST - 1]), str(picked[_FIRST_HOST])


def _class_candidates(address_class: str) -> list[ipaddress.IPv4Network]:
    """Every subnet this class can hand out, in allocation order."""
    if address_class == CLASS_A:
        return [ipaddress.ip_network(f"{octet}.0.0.0/8") for octet in range(10, 100)]
    if address_class == CLASS_B:
        return [
            ipaddress.ip_network(f"172.{second}.0.0/16")
            for second in _CLASS_B_SECOND_OCTET
        ]
    return [ipaddress.ip_network(f"192.168.{third}.0/24") for third in _CLASS_C_THIRD_OCTET]


def _addresses_for(
    raw: dict[str, Any],
    used_subnets: set[ipaddress.IPv4Network],
    taken_by: dict,
    notes: list[str] | None = None,
    reserved: list[ipaddress.IPv4Network] | None = None,
) -> tuple[str, str, str, str, str]:
    """Resolve one link's subnet, its two addresses and its address class.

    A caller-supplied address always wins, so an IP the designer already shows
    is the IP the routers get. Only the blanks are filled in -- with one
    exception: a supplied address that lands on a network this machine is
    already using is moved, because Docker would put a competing route in
    front of the machine's own and take its wifi down with it.

    Allocation scans each class's candidates from the start and takes the first
    subnet that is free, which is what makes a deleted link's subnet reusable:
    nothing is held anywhere except in the topology being planned, so removing a
    link releases its address for the next one automatically.
    """
    supplied_source = str(raw.get("source_ip") or "").strip()
    supplied_target = str(raw.get("target_ip") or "").strip()
    supplied_subnet = str(raw.get("subnet") or "").strip()

    if reserved is None:
        reserved = reserved_networks(exclude_project=COMPOSE_PROJECT)

    supplied_class = ""
    if supplied_source or supplied_target or supplied_subnet:
        subnet = _subnet_from_supplied(supplied_subnet, supplied_source, supplied_target)
        address_class = _class_of(subnet)
        supplied_class = address_class
        if supplied_source or supplied_target:
            source_ip = _in_subnet(
                _to_interface(supplied_source or supplied_target, address_class).ip,
                subnet, supplied_source,
            )
            target_ip = _in_subnet(
                _to_interface(supplied_target or supplied_source, address_class).ip,
                subnet, supplied_target,
            )
        else:
            # Subnet given, addresses left blank: take the first two hosts.
            source_ip, target_ip = _first_hosts(subnet)
        if source_ip == target_ip:
            raise DeployError(
                f"Link {raw.get('source')}–{raw.get('target')}: both ends were "
                f"given the same address {source_ip}"
            )
        # The bridge pool is what becomes a route on the host, so this is the
        # network that has to be kept away from the machine's own. A supplied
        # address that lands on it is moved rather than honoured: honouring it
        # would put the lab's traffic in front of the machine's router.
        clash = conflict_for(_bridge_network(str(subnet), [source_ip, target_ip]), reserved)
        if clash is None:
            # Already reserved by the pre-pass, which is also where a genuine
            # duplicate is reported -- re-checking here would flag this link's
            # own subnet as a collision.
            used_subnets.add(subnet)
            return str(subnet), source_ip, target_ip, address_class, mask_for_class(address_class)
        if notes is not None:
            notes.append(
                f"Link {raw.get('source')}–{raw.get('target')} was given "
                f"{subnet} — {describe(clash)}. Docker puts a route for every "
                f"bridge network it creates, so that network would have taken "
                f"this machine's own route and left it without a connection. "
                f"The link was given a free address instead."
            )

    # The class the link is allocated from. A link that supplied its own
    # address keeps the class that address implies, so a link moved off a
    # clashing network keeps the shape it was drawn with.
    address_class = resolve_class(
        raw.get("address_class") or raw.get("ip_class") or supplied_class
    )
    for subnet in _class_candidates(address_class)[:_MAX_SUBNET_ATTEMPTS]:
        # Overlap, not just equality: a candidate /8 must not swallow a /24 some
        # other link already holds, or both links end up with the same host
        # addresses. The per-class blocks are disjoint by first octet, so the
        # only way to get here is a prefix boundary -- but a Class A link
        # renumbered next to a supplied /24 in the same first octet is enough.
        if any(subnet.overlaps(taken) for taken in used_subnets):
            continue
        source_ip, target_ip = _first_hosts(subnet)
        # The candidate's bridge pool is skipped when it lands on a network
        # this machine is already using. The pool, not the whole subnet, is
        # what the host is given a route for -- a Class A link's pool is a /29,
        # so it only has to keep away from the machine's own /29.
        if conflict_for(_bridge_network(str(subnet), [source_ip, target_ip]), reserved):
            continue
        used_subnets.add(subnet)
        return (
            str(subnet),
            source_ip,
            target_ip,
            address_class,
            mask_for_class(address_class),
        )
    raise DeployError(
        f"No free Class {address_class} subnet left for the links in this topology"
        + (
            f". Every Class {address_class} subnet is either already in this "
            f"topology or in use by this machine ("
            + ", ".join(str(network) for network in reserved[:4])
            + ")"
            if reserved
            else ""
        )
    )


def _subnet_from_supplied(
    supplied_subnet: str, supplied_source: str, supplied_target: str
) -> ipaddress.IPv4Network:
    if supplied_subnet:
        try:
            return ipaddress.ip_network(supplied_subnet, strict=False)
        except ValueError as exc:
            raise DeployError(f"'{supplied_subnet}' is not a valid subnet") from exc
    first = supplied_source or supplied_target
    try:
        address = ipaddress.ip_interface(first).ip
    except ValueError as exc:
        raise DeployError(f"'{first}' is not a valid IPv4 address") from exc
    # A bare address implies its classful network (10.0.0.2 -> 10.0.0.0/8),
    # the same derivation the designer does when a class is picked. Taking it
    # as a /32 instead produced a subnet no class could describe, and the
    # caller then died on a KeyError rather than planning anything.
    return ipaddress.ip_network(f"{address}/{CLASS_PREFIX[_class_of_address(address)]}", strict=False)


def _class_of_address(address: ipaddress.IPv4Address) -> str:
    """Address class by first octet -- the classful rule itself."""
    first = int(str(address).split(".")[0])
    if 1 <= first <= 126:
        return CLASS_A
    if 128 <= first <= 191:
        return CLASS_B
    if 192 <= first <= 223:
        return CLASS_C
    return DEFAULT_CLASS


def _class_of(subnet: ipaddress.IPv4Network) -> str:
    """The class a subnet belongs to.

    A classful prefix (/8, /16, /24) answers directly. Anything else -- the
    /29 the allocator hands out inside a class block, or a bare /32 -- falls
    back to the first octet of its network address. Returning "" here used to
    reach `CLASS_PREFIX[address_class]` and raise a bare KeyError, so *every*
    re-plan of an already-addressed canvas link 500'd instead of planning.
    """
    for letter, bits in CLASS_PREFIX.items():
        if subnet.prefixlen == bits:
            return letter
    return _class_of_address(subnet.network_address)


def _to_interface(value: str, address_class: str = DEFAULT_CLASS) -> ipaddress.IPv4Interface:
    text = value if "/" in value else f"{value}/{CLASS_PREFIX[address_class]}"
    try:
        return ipaddress.ip_interface(text)
    except ValueError as exc:
        raise DeployError(f"'{value}' is not a valid IPv4 address") from exc


def _in_subnet(address, subnet, supplied: str) -> str:
    if address in subnet and address not in (
        subnet.network_address,
        subnet.broadcast_address,
    ):
        return str(address)
    if supplied:
        raise DeployError(
            f"{supplied} is not a usable host address on subnet {subnet}"
        )
    return str(list(subnet.hosts())[_FIRST_HOST - 1])


def _claim(address: str, owner: str, used: dict[str, str]) -> None:
    if address in used:
        raise DeployError(
            f"{address} is assigned to both {used[address]} and {owner}"
        )
    used[address] = owner


# --------------------------------------------------------------------------- #
# Writing the lab
# --------------------------------------------------------------------------- #
def write_files(plan: dict[str, Any]) -> str:
    """Write daemons/vtysh.conf and the compose file. frr.conf comes later."""
    if os.path.isdir(LAB_DIR):
        shutil.rmtree(LAB_DIR)
    os.makedirs(os.path.join(LAB_DIR, "frr"), exist_ok=True)

    with open(os.path.join(LAB_DIR, "frr", "daemons"), "w") as handle:
        handle.write(DAEMONS)
    with open(os.path.join(LAB_DIR, "frr", "vtysh.conf"), "w") as handle:
        handle.write(VTYSH_CONF)

    # A placeholder frr.conf keeps the bind mount valid for the first start;
    # it is replaced with the measured interface map before the real restart.
    for router in plan["routers"]:
        directory = os.path.join(LAB_DIR, router["container"])
        os.makedirs(directory, exist_ok=True)
        with open(os.path.join(directory, "frr.conf"), "w") as handle:
            handle.write(FRR_HEADER.format(hostname=router["name"]) + "router ospf\n!\n")

    _write_compose(plan)
    return LAB_DIR


def _write_compose(plan: dict[str, Any]) -> None:
    lines: list[str] = ["services:"]
    for router in plan["routers"]:
        container = router["container"]
        # Router ids are upper case on the canvas ("R1") and lower case as
        # containers ("r1"); links name the canvas id, so compare against the
        # upper case form rather than the container name.
        router_id = router["id"].upper()
        lines += [
            f"  {container}:",
            "    image: frrouting/frr:latest",
            f"    container_name: {container}",
            "    privileged: true",
            "    command: /usr/lib/frr/docker-start",
            "    volumes:",
            "      - ./frr/daemons:/etc/frr/daemons",
            "      - ./frr/vtysh.conf:/etc/frr/vtysh.conf",
            f"      - ./{container}/frr.conf:/etc/frr/frr.conf",
            "    networks:",
        ]
        for link in plan["links"]:
            if router_id not in (link["source"], link["target"]):
                continue
            address = (
                link["source_ip"] if link["source"] == router_id else link["target_ip"]
            )
            lines += [f"      {link['network']}:", f"        ipv4_address: {address}"]

    # Networks must be declared with their subnet: Docker would otherwise pick
    # an arbitrary pool and the addresses the designer chose -- the ones this
    # module already handed back to the canvas -- would not be the ones the
    # routers end up with.
    #
    # The pool pinned here is NOT the link's classful subnet. A Class A link is
    # 10/8 and a Class B link is 172.16/16 for the *routers*, but a bridge
    # claiming 10.0.0.0/8 or 172.16.0.0/16 takes every address in the range and
    # the next create on the daemon fails with "Pool overlaps". The bridge only
    # carries the .1 gateway and the two endpoints, so the smallest pool that
    # still contains both is pinned instead -- see _bridge_pool.
    lines.append("")
    lines.append("networks:")
    for link in plan["links"]:
        lines += [
            f"  {link['network']}:",
            "    driver: bridge",
            "    ipam:",
            "      config:",
            f"        - subnet: {_bridge_pool(link['subnet'], [link['source_ip'], link['target_ip']])}",
        ]

    with open(os.path.join(LAB_DIR, "docker-compose.yml"), "w") as handle:
        handle.write("\n".join(lines) + "\n")


def _observed_interfaces(client, container: str) -> dict[str, str]:
    try:
        target = client.containers.get(container)
    except NotFound:
        return {}
    try:
        result = target.exec_run(["ip", "-o", "-4", "addr", "show"], demux=True)
    except DockerException:
        return {}
    # With `demux=True` the docker SDK puts a (stdout, stderr) tuple in
    # `.output`. Reading `result[0]` instead is wrong: ExecResult is itself a
    # namedtuple whose first field is `exit_code`, and 0 is falsy, so the
    # interface list silently came back empty on a perfectly healthy container.
    raw = getattr(result, "output", None)
    if isinstance(raw, (tuple, list)):
        raw = raw[0] if raw else None
    output = raw.decode() if isinstance(raw, bytes) else (raw or "")
    found: dict[str, str] = {}
    for line in output.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        name = parts[1].split("@")[0]
        if name == "lo":
            continue
        found[name] = parts[3].split("/")[0]
    return found


def _wait_for_interfaces(
    client, container: str, deadline: float, settle: float = 1.0
) -> dict[str, str]:
    """Poll a container until Docker has attached its networks.

    A container reports `running` before `/usr/lib/frr/docker-start` has
    finished and before Docker has moved it onto every bridge, so a single
    `exec_run` taken right after `up -d` can legitimately see no interface at
    all. Giving up on that first empty read produced a deploy failure on a lab
    that was in fact fine.
    """
    seen: dict[str, str] = {}
    while time.time() < deadline:
        seen = _observed_interfaces(client, container)
        if len(seen) >= _expected_interface_count(container, client):
            return seen
        time.sleep(settle)
    return seen


def _expected_interface_count(container: str, client) -> int:
    try:
        networks = client.containers.get(container).network_attrs["Networks"]
    except (NotFound, DockerException, KeyError, AttributeError):
        return 1
    return max(1, len(networks))


def _read_interfaces(client, plan: dict[str, Any], deadline: float) -> dict[str, dict[str, str]]:
    """Read {router_id: {iface: ip}} for every router, waiting for Docker to settle."""
    readings: dict[str, dict[str, str]] = {}
    for router in plan["routers"]:
        container = router["container"]
        observed = _wait_for_interfaces(client, container, deadline)
        if not observed:
            raise DeployError(
                f"Container '{container}' came up with no IPv4 interface; cannot "
                f"build its OSPF configuration"
            )
        readings[router["id"]] = dict(sorted(observed.items()))
    return readings


def _write_configs(plan: dict[str, Any], readings: dict[str, dict[str, str]]) -> bool:
    """Write every frr.conf from a measured iface -> ip reading.

    Returns whether any file actually changed.

    The "only write when it changes" rule is the whole point. FRR's `watchfrr`
    reacts to the config file's mtime by restarting the daemons, and a restart
    discards whatever `vtysh` was given a moment earlier. Rewriting a file
    whose content is already correct still bumps its mtime, so an unchanged
    rewrite restarts the daemons for nothing -- and a restart that lands
    between the push and the read-back is what made verification fail
    intermittently, with a different router missing its interfaces each time.
    """
    by_address = {
        ip: link
        for link in plan["links"]
        for ip in (link["source_ip"], link["target_ip"])
    }
    changed = False

    for router in plan["routers"]:
        container = router["container"]
        observed = readings.get(router["id"], {})

        body = ""
        for iface in sorted(observed, key=_iface_sort_key):
            link = by_address.get(observed[iface])
            if link is None:
                raise DeployError(
                    f"{container}:{iface} holds {observed[iface]}, which no link in "
                    f"the topology claims"
                )
            # A point-to-point segment with exactly two members is what
            # `ip ospf network point-to-point` describes; without it OSPF would
            # try to elect a DR on a link that has no other end.
            body += (
                f"interface {iface}\n"
                f" ip ospf area {link['area']}\n"
                f" ip ospf cost {link['cost']}\n"
                f" ip ospf network point-to-point\n"
                f"exit\n!\n"
            )

        config = (
            FRR_HEADER.format(hostname=router["name"])
            + body
            + f"router ospf\n ospf router-id {router['router_id']}\nexit\n!\n"
        )
        path = os.path.join(LAB_DIR, container, "frr.conf")
        try:
            with open(path) as handle:
                unchanged = handle.read() == config
        except OSError:
            unchanged = False
        if not unchanged:
            with open(path, "w") as handle:
                handle.write(config)
            changed = True
    return changed


def _area_to_int(text: str) -> int:
    """FRR prints areas dotted (`0.0.0.2`); the plan holds them as integers."""
    pieces = str(text).strip().split(".")
    try:
        return int(pieces[-1]) if len(pieces) == 4 else int(str(text).strip())
    except ValueError:
        return -1


def _exec_output(result) -> str:
    """Flatten an `exec_run` result into text.

    `exec_run` without `demux` returns bytes, but a caller may hand over a
    demultiplexed result whose output is a `(stdout, stderr)` tuple.
    """
    output = getattr(result, "output", b"") or b""
    if isinstance(output, (tuple, list)):
        output = output[0] if output else b""
    if isinstance(output, bytes):
        return output.decode(errors="replace")
    return str(output)


def _exec_in_container(client, container: str, cmd: list[str], timeout: int = 15):
    """Run a command in a container, returning (exit_code, output).

    Returns ``None`` when the container itself could not be reached, which is
    a different thing from a command that ran and failed.

    The Docker SDK has no timeout of its own -- `exec_run` refuses one and
    `exec_start` has no such argument either -- so a command that never
    returned would hold the whole HTTP request open until the daemon's own
    60-second read timeout fired. The limit is applied *inside* the container
    with `timeout`, which is what actually stops the process.

    Not every image ships a `timeout` binary. When it is missing the command
    never ran, so it is run again unwrapped rather than reporting a failure
    that has nothing to do with the command itself.
    """
    try:
        target = client.containers.get(container)
    except (DockerException, NotFound):
        return None
    try:
        result = target.exec_run(["timeout", "-k", "2", str(int(timeout))] + cmd)
        code = getattr(result, "exit_code", None)
        text = _exec_output(result)
        if code == 127 and "timeout" in text.lower():
            result = target.exec_run(cmd)
            code = getattr(result, "exit_code", None)
            text = _exec_output(result)
        return (code if code is not None else 1), text
    except (DockerException, NotFound):
        return None
    except Exception as exc:  # noqa: BLE001 - docker raises many shapes
        return 1, str(exc)


def _vtysh(client, container: str, commands: list[str]) -> tuple[int, str]:
    """Run a configuration script inside a router's vtysh.

    `vtysh -c "configure terminal" -c "..."` does not work: each `-c` runs as a
    separate exec-mode command, so the second one never enters config mode and
    FRR answers "Unknown command". The lines are therefore piped in on stdin,
    and stdin has to be piped *inside* the container because this docker SDK has
    no `exec_run(input=...)`.
    """
    script = "configure terminal\n" + "".join(f"{line}\n" for line in commands) + "end\n"
    # Safe as a printf format string: OSPF configuration contains no `%`.
    shell_command = f"printf '{script}' | vtysh"
    result = _exec_in_container(client, container, ["sh", "-c", shell_command])
    return result if result is not None else (1, "")


def _read_ospf_interfaces(client, container: str) -> dict[str, tuple[str, str]]:
    """Read {iface: (area, cost)} from `show ip ospf interface`."""
    result = _exec_in_container(client, container, ["vtysh", "-c", "show ip ospf interface"])
    text = result[1] if result is not None else ""

    found: dict[str, tuple[str, str]] = {}
    current: str | None = None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.endswith(" is up") or stripped.endswith(" is down"):
            current = stripped.split()[0]
            continue
        if current is None:
            continue
        if "Internet Address" in stripped and "Area" in stripped:
            area = stripped.rsplit("Area", 1)[1].strip()
            found.setdefault(current, (area, ""))
        elif stripped.startswith("Router ID") and current in found:
            pieces = stripped.split(",")
            if len(pieces) >= 3 and "Cost" in pieces[-1]:
                found[current] = (found[current][0], pieces[-1].split("Cost:")[-1].strip())
    return found


def configure(
    plan: dict[str, Any], client, max_attempts: int = 6
) -> dict[str, dict[str, str]]:
    """Put the planned OSPF configuration into the running routers and prove it.

    Interface names are the crux. `eth0..ethN` are not stable: restarting a
    container rebuilds its network namespace and Docker hands the names out
    again in a different order -- observed to change on every restart here. A
    config generated from a pre-restart reading therefore lands each area and
    cost on the **wrong interface**, and FRR accepts it without complaint, so
    the lab comes up looking healthy while OSPF silently runs on the wrong
    links. Chasing the mapping across restarts does not converge.

    So the lab is never restarted. The containers are created with a minimal
    frr.conf, the live `iface -> ip` mapping is read, and the real
    configuration is pushed into the running `vtysh` -- the router-id first,
    then each interface addressed by the link's address rather than by a
    guessed index. Finally the result is read back from `show ip ospf
    interface` and compared against the plan, so a mismatch is an error rather
    than a silently wrong lab.
    """
    readings = _read_interfaces(client, plan, time.time() + 60)

    # The bind-mounted frr.conf is written from the interface map actually
    # observed, before anything is pushed. FRR's `watchfrr` restarts a daemon
    # during startup and the daemon then re-reads that file, discarding
    # whatever vtysh was given a moment earlier -- which is how a router
    # ended up running with `router ospf` and no interfaces at all. With the
    # file already correct, a reload and a push converge on the same result.
    #
    # It is written once, here, and not again per attempt: a rewrite bumps the
    # file's mtime even when the content is identical, and every bump is
    # another daemon restart, and every restart is another chance to discard
    # the configuration that was just pushed. The interface map does not
    # change between attempts -- the lab is never restarted -- so there is
    # nothing to re-write.
    _write_configs(plan, readings)

    problems: list[str] = []
    for attempt in range(1, max_attempts + 1):
        problems = []
        for router in plan["routers"]:
            container = router["container"]
            observed = readings[router["id"]]

            iface_for_ip = {ip: iface for iface, ip in observed.items()}
            commands: list[str] = ["router ospf", f"ospf router-id {router['router_id']}"]
            # Read once per router rather than once per link.
            existing = _read_ospf_interfaces(client, container)

            for link in plan["links"]:
                if router["id"] not in (link["source"], link["target"]):
                    continue
                address = (
                    link["source_ip"] if link["source"] == router["id"] else link["target_ip"]
                )
                iface = iface_for_ip.get(address)
                if iface is None:
                    problems.append(
                        f"{container} has no interface holding {address} "
                        f"(link {link['source']}–{link['target']})"
                    )
                    continue
                commands += [
                    f"interface {iface}",
                    "ip ospf network point-to-point",
                ]
                # FRR refuses `ip ospf area` when the interface already has one
                # and still exits 0, so an existing area is removed first only
                # when it is actually wrong.
                current = existing.get(iface)
                if current and _area_to_int(current[0]) != int(link["area"]):
                    commands.append("no ip ospf area")
                commands += [
                    f"ip ospf area {link['area']}",
                    f"ip ospf cost {link['cost']}",
                    "exit",
                ]

            code, output = _vtysh(client, container, commands)
            if code != 0 or "%" in output.replace("% ", "", 1):
                problems.append(f"{container}: vtysh rejected the configuration: {output.strip()[:200]}")

        # A daemon that was restarting when the push arrived comes back with
        # whatever it re-read from frr.conf, so the router is correct again a
        # moment later. Reading back immediately would see the gap.
        time.sleep(_PUSH_SETTLE_SECONDS)

        applied = {
            router["id"]: _read_ospf_interfaces(client, router["container"])
            for router in plan["routers"]
        }
        _verify_applied(plan, readings, applied, problems)

        if not problems:
            return readings

        if attempt == max_attempts:
            break
        time.sleep(_SETTLE_SECONDS)

    raise DeployError(
        "The generated OSPF configuration did not match the running lab: "
        + "; ".join(problems)
    )


def _verify_applied(
    plan: dict[str, Any],
    readings: dict[str, dict[str, str]],
    applied: dict[str, dict[str, tuple[str, str]]],
    problems: list[str],
) -> None:
    """Compare what the routers report against what was asked for."""
    by_address = {
        ip: link
        for link in plan["links"]
        for ip in (link["source_ip"], link["target_ip"])
    }
    for router in plan["routers"]:
        container = router["container"]
        observed = readings.get(router["id"], {})
        report = applied.get(router["id"], {})
        for link in plan["links"]:
            if router["id"] not in (link["source"], link["target"]):
                continue
            address = (
                link["source_ip"] if link["source"] == router["id"] else link["target_ip"]
            )
            iface = next((i for i, ip in observed.items() if ip == address), None)
            if iface is None or iface not in report:
                problems.append(
                    f"{container}: link {link['source']}–{link['target']} "
                    f"({address}) is not in OSPF"
                )
                continue
            area, cost = report[iface]
            if _area_to_int(area) != int(link["area"]):
                problems.append(
                    f"{container}:{iface} ({address}) is in area {area}, "
                    f"expected area {link['area']}"
                )
            if cost != str(link["cost"]):
                problems.append(
                    f"{container}:{iface} ({address}) has cost {cost}, "
                    f"expected {link['cost']}"
                )
    if len(by_address) != 2 * len(plan["links"]):
        problems.append("duplicate addresses in the plan")


def _iface_sort_key(name: str) -> tuple[int, str]:
    digits = name[3:] if name.startswith("eth") else ""
    return (int(digits) if digits.isdigit() else 999, name)


# --------------------------------------------------------------------------- #
# Lifecycle
# --------------------------------------------------------------------------- #
def teardown() -> dict[str, Any]:
    """Remove the generated lab and everything it left on disk.

    Safe to call when nothing is running.

    The whole `labs/current` tree goes, not just the containers: the compose
    file, every router's `frr.conf` and `plan.json` are output of *this*
    topology, and leaving them behind meant a torn-down lab still answered
    `GET /api/lab/deploy` with the topology that no longer existed -- so a
    freshly drawn canvas was compared against a stale plan and reported as
    "out of step with this canvas" before anything had been deployed.

    Deleting `plan.json` is also what frees the addresses. Allocation is
    stateless (`resolve_plan` holds nothing outside the topology it is given,
    and scans each class from the start), so a link's subnet is "taken" only by
    the plan currently on disk and the canvas in front of you. Remove the plan
    and the same subnet is handed straight back to the next link that asks,
    which is what makes deleting a link or a router free its IPs.
    """
    compose_file = os.path.join(LAB_DIR, "docker-compose.yml")
    had_files = os.path.isdir(LAB_DIR)
    detail = ""

    if os.path.exists(compose_file):
        result = _compose("down", "--volumes", "--remove-orphans")
        detail = (result.stderr or result.stdout or "").strip()[-400:]
        if result.returncode != 0:
            return {"removed": False, "detail": detail or "docker compose down failed"}

    # `compose down` only knows the services in the compose file that is on
    # disk, so containers from an older topology survive it as orphans, and
    # their networks survive with them -- holding their old subnets. Remove
    # every container and network this project ever created.
    try:
        _remove_lab_resources(_client())
    except DeployError:
        pass

    if had_files:
        shutil.rmtree(LAB_DIR, ignore_errors=True)

    if not had_files and not detail:
        return {"removed": False, "detail": "no generated lab on disk"}
    return {
        "removed": True,
        "detail": detail or "generated lab, its files and its networks were removed",
    }


def _remove_lab_resources(client) -> list[str]:
    """Remove every container and network belonging to this lab's project.

    Selection is by the compose project *label*, not by name, and that
    distinction is load-bearing. The name filter `"netrouteai"` is a
    substring match, and the application stack's own project is called
    `netrouteai-app` -- so a name match also picks up `netrouteai-app_default`
    and tears down the network the running UI depends on. The label
    `com.docker.compose.project` is exact: it is `netrouteai` for the lab and
    `netrouteai-app` for the stack, and they never collide.

    Containers are removed before networks because Docker refuses to delete a
    network that still has an endpoint attached, and a container that survived
    `compose down` (an orphan from an older topology) is exactly such an
    endpoint.

    Best-effort by design: a resource that cannot be removed is skipped
    rather than raising, because the caller has already asked for the lab to
    go and an error here would hide that the teardown otherwise succeeded.
    """
    removed: list[str] = []
    label = f"{COMPOSE_PROJECT_LABEL}={COMPOSE_PROJECT}"

    try:
        containers = client.containers.list(all=True, filters={"label": label})
    except DockerException:
        containers = []
    for container in containers:
        try:
            container.remove(force=True)
            removed.append(container.name)
        except DockerException:
            continue

    try:
        networks = client.networks.list(filters={"label": label})
    except DockerException:
        networks = []
    for network in networks:
        try:
            network.remove()
            removed.append(network.name)
        except DockerException:
            continue
    return removed


def _wait_for_frr(client, containers: list[str], deadline: float) -> None:
    """Wait until every router's vtysh actually answers OSPF commands.

    `status == "running"` only means the container process started. FRR's
    `docker-start` then goes on to load /etc/frr/frr.conf and start the
    daemons, and configuration pushed inside that window is read and then
    thrown away when the daemon finishes its own load. The symptom was a
    deploy that pushed correct configuration, read `show ip ospf interface`
    back empty, retried for `_SETTLE_SECONDS`, and then failed verification
    while the running-config still looked perfect.
    """
    for container in containers:
        while True:
            result = _exec_in_container(client, container, ["vtysh", "-c", "show ip ospf"])
            text = result[1] if result is not None else ""
            if "OSPF Routing Process" in text or "not enabled" in text:
                break
            if time.time() >= deadline:
                raise DeployError(
                    f"{container} did not answer 'show ip ospf' in time; "
                    "FRR never finished starting, so configuring it would be "
                    "silently discarded."
                )
            time.sleep(1.0)


def deployed_lab_running() -> bool:
    try:
        client = _client()
    except DeployError:
        return False
    try:
        names = {
            c.name
            for c in client.containers.list(all=False)
        }
    except DockerException:
        return False
    plan = load_plan()
    if not plan:
        return False
    return all(r["container"] in names for r in plan["routers"])


# --------------------------------------------------------------------------- #
# Convergence
# --------------------------------------------------------------------------- #

# How long to wait for OSPF to finish computing routes before the lab is
# declared ready. Two clocks are in play: OSPF's hello interval is 10 s, so an
# adjacency cannot form sooner than that after the configuration is pushed, and
# the SPF then needs a few more seconds to flood the LSAs and install the
# routes. 90 s covers a full reconvergence of a large topology with room to
# spare, and the deploy's own container-start budget is separate.
_CONVERGE_TIMEOUT = 90.0

# How often to look at the routing tables while waiting.
_CONVERGE_POLL = 2.0

# How long the routing tables have to stop changing before the lab is called
# converged.
#
# This is not a guess about how long OSPF takes -- it is the window that
# separates "the SPF has finished" from "the SPF has not started yet". A
# freshly configured router shows only its directly connected routes (3 of
# them for a router with three links) and *that count does not change* for
# several seconds while the adjacencies are still forming. A wait that only
# asked "have the counts moved since the last poll?" therefore returned while
# the network had learned nothing at all. Measured on this lab, the counts
# were 3 from t+6s to t+12s while the adjacencies only reached Full at t+10s,
# with the real route counts arriving at t+15s.
#
# So the wait has two parts, and both have to hold:
#
#   * every router has formed all of its adjacencies (the plan says how many
#     it should have), and
#   * the routing tables have not changed for this long, counting from the
#     moment the last adjacency appeared.
_CONVERGE_SETTLE = 8.0


def _ospf_route_count(client, container: str) -> int:
    """How many OSPF routes a router currently has in its table.

    This is the convergence signal, and it is deliberately a *count* rather
    than a set of prefixes: how many routes a router should have depends on
    which areas it can see, and that is a property of the topology (a stub
    area's router legitimately has fewer routes than its neighbours). Counting
    the entries that are there says "has it stopped changing yet?", which is
    the question that actually matters.

    The count includes the "is directly connected" entries, because those are
    OSPF's own view of an interface it is running on -- and their absence is
    how a router that is not running OSPF on every one of its links gives
    itself away.
    """
    return _vtysh_count(client, container, "show ip route ospf", _is_ospf_route_line)


def _ospf_neighbour_count(client, container: str) -> int:
    """How many OSPF neighbours a router has reached the Full state.

    An adjacency is the precondition for learning anything at all: a router
    with no Full neighbour has nothing to run the SPF over, so its routing
    table can look "stable" while the network is still coming up. Counting
    the Full neighbours is how the wait knows the network is actually running
    rather than merely configured.
    """
    return _vtysh_count(client, container, "show ip ospf neighbor", _is_ospf_neighbour_line)


def _vtysh_count(client, container: str, command: str, matcher) -> int:
    """Run `vtysh -c <command>` in a container and count the lines that match.

    Returns -1 when the container cannot be reached, which is how "no answer"
    is told apart from "an answer of zero".
    """
    result = _exec_in_container(client, container, ["vtysh", "-c", command])
    if result is None:
        # The container could not be reached at all.
        return -1
    _, text = result
    return sum(1 for line in text.splitlines() if matcher(line))


def _is_ospf_route_line(line: str) -> bool:
    """Is this line an OSPF route in `show ip route ospf`?

    Every route line starts with "O" in the route-code column and carries the
    "[distance/metric]" bracket. The "Codes:" legend that vtysh prints above
    the table starts with "C" and has neither, so it is not counted.
    """
    stripped = line.lstrip()
    return stripped.startswith("O") and "[" in stripped and "/" in stripped


def _is_ospf_neighbour_line(line: str) -> bool:
    """Is this line a neighbour in the Full state?

    A neighbour row starts with the neighbour's router-id, so it begins with
    a digit; the column heading does not. Only "Full" counts: a neighbour
    that is still "2-Way" or "Init" has not exchanged database descriptions
    and the SPF cannot use it yet.
    """
    stripped = line.strip()
    return bool(stripped) and stripped[0].isdigit() and "Full" in stripped


def _expected_adjacency_counts(plan: dict[str, Any]) -> dict[str, int]:
    """How many OSPF adjacencies each router should form, from the plan.

    One adjacency per link whose *both* ends are routers: the plan gives a
    link's two ends the same area, and OSPF only forms an adjacency between
    interfaces in the same area, so every router-router link yields exactly
    one adjacency. A link to a host -- a PC or a switch on a LAN -- has no
    OSPF on the far end and must not be counted, or the wait would never
    finish.

    The same number is also the number of "is directly connected" OSPF routes
    the router should have, which is why it doubles as a floor for the route
    count.
    """
    routers = plan.get("routers", [])
    by_id = {r["id"]: r for r in routers}
    degree: dict[str, int] = {r["id"]: 0 for r in routers}
    for link in plan.get("links", []):
        source = link.get("source")
        target = link.get("target")
        if source in degree and target in degree:
            degree[source] += 1
            degree[target] += 1
    return {by_id[rid]["container"]: count for rid, count in degree.items()}


def wait_for_convergence(
    client, plan: dict[str, Any], timeout: float = _CONVERGE_TIMEOUT
) -> dict[str, Any]:
    """Wait until the routers have finished learning the topology.

    **Why this exists.** A deploy that returns while OSPF is still computing
    routes reports a lab that is ready, and the Analytics page measures it
    immediately -- and gets "R1 cannot reach R10 at all", because R1's table
    does not have R10's subnet *yet*. That is a false negative produced by
    asking a network that has not finished starting. It looked like a routing
    fault: the same pair measured perfectly a minute later.

    **What "finished" means here.** Two conditions, both of which have to hold
    at the same moment:

    1. *Every adjacency is up.* The plan says how many neighbours each router
       should have -- one per router-to-router link -- and each of them must
       have reached the Full state. A router that is not running OSPF on a
       link can never satisfy this, which is what makes a misconfigured lab
       (the kind `reapply()` exists to fix) fail the wait instead of quietly
       reporting itself as converged.

    2. *The routing tables have stopped changing.* A router's route count is
       compared with the count from the previous poll; when no router's count
       has moved for `_CONVERGE_SETTLE` seconds, the SPF has installed
       everything it is going to install.

    The settle window is counted from the later of the two events -- the last
    change in the tables, and the moment the last adjacency appeared -- so
    "the tables were already quiet before OSPF started" cannot be mistaken
    for "the tables have finished".

    The alternative -- "wait until every router has N routes" -- cannot be
    written, because N is a property of the area layout rather than of the
    topology: a router in a stub area legitimately has fewer routes than one
    in the backbone, and a topology with no area boundaries has a different
    number again.

    The timeout is a bound, not an expectation: if the tables are still
    moving when it expires, the lab is returned anyway with the state it
    reached, because a lab that is up and slowly settling is more useful than
    no lab.
    """
    routers = plan.get("routers", [])
    containers = [r["container"] for r in routers]
    expected = _expected_adjacency_counts(plan)
    started = time.time()
    deadline = started + timeout
    previous: dict[str, int] = {}
    last_change = started
    adjacencies_up_since: float | None = None
    routes: dict[str, int] = {}
    neighbours: dict[str, int] = {}

    while True:
        now = time.time()
        routes = {}
        neighbours = {}
        for container in containers:
            count = _ospf_route_count(client, container)
            if count >= 0:
                routes[container] = count
            nbrs = _ospf_neighbour_count(client, container)
            if nbrs >= 0:
                neighbours[container] = nbrs

        if routes != previous:
            previous = dict(routes)
            last_change = now

        # Every router answered, every router has formed all the adjacencies
        # the plan says it should have, and every router is running OSPF on
        # every one of its links (which is what the directly-connected routes
        # in the table prove).
        adjacency_ready = (
            bool(containers)
            and len(routes) == len(containers)
            and len(neighbours) == len(containers)
            and all(
                neighbours[container] >= expected.get(container, 0)
                and routes[container] >= expected.get(container, 0)
                for container in containers
            )
        )
        if adjacency_ready and adjacencies_up_since is None:
            adjacencies_up_since = now

        quiet_since = max(last_change, adjacencies_up_since or last_change)
        if adjacency_ready and (now - quiet_since) >= _CONVERGE_SETTLE:
            return {
                "converged": True,
                "waited_seconds": round(now - started, 1),
                "settled_seconds": round(now - quiet_since, 1),
                "routes": routes,
                "neighbours": neighbours,
                "expected_neighbours": expected,
            }

        if now >= deadline:
            return {
                "converged": False,
                "waited_seconds": round(now - started, 1),
                "settled_seconds": round(now - quiet_since, 1),
                "routes": routes,
                "neighbours": neighbours,
                "expected_neighbours": expected,
                "detail": (
                    f"The routers did not finish learning the topology within "
                    f"{timeout:.0f}s. The lab is running, but its routing "
                    "tables may still be settling."
                ),
            }

        time.sleep(_CONVERGE_POLL)


def load_record() -> dict[str, Any] | None:
    """The full on-disk record: {"plan": ..., "interfaces": ...}."""
    path = os.path.join(LAB_DIR, "plan.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path) as handle:
            record = json.load(handle)
    except (OSError, ValueError):
        return None
    return record if isinstance(record, dict) and "plan" in record else None


def load_plan() -> dict[str, Any] | None:
    """The address/cost/area plan the running lab was built from."""
    record = load_record()
    return record["plan"] if record else None


def save_plan(plan: dict[str, Any], assignments: dict[str, dict[str, str]]) -> None:
    with open(os.path.join(LAB_DIR, "plan.json"), "w") as handle:
        json.dump({"plan": plan, "interfaces": assignments}, handle, indent=2)


def _free_container_names(names: list[str], client) -> list[str]:
    """Stop and remove any container that already owns one of these names.

    Container names are derived from router ids, so a lab built from a new
    drawing wants `r1`, `r2`, ... and anything already running under those
    names has to go first. The collision is resolved here rather than surfaced
    as an opaque Docker error.
    """
    removed: list[str] = []
    for name in names:
        try:
            existing = client.containers.get(name)
        except NotFound:
            continue
        except DockerException as exc:
            raise DeployError(f"Could not inspect container '{name}': {exc}") from exc
        try:
            existing.remove(force=True)
            removed.append(name)
        except DockerException as exc:
            raise DeployError(
                f"Container '{name}' is still running and could not be replaced. "
                f"Stop it first ({exc})."
            ) from exc
    return removed


def _check_plan_against_host(
    plan: dict[str, Any], reserved: list[ipaddress.IPv4Network]
) -> None:
    """Refuse a plan that would put a route in front of the machine's own.

    Every bridge network Docker creates becomes a route on the host, and that
    route has metric 0 -- a better route than the metric 600 a laptop's wifi
    gets from DHCP. So a lab link that lands on the network the machine is
    using does not merely coexist with it: it takes the machine's own traffic
    away from its router, and the machine is left with no connection.
    """
    for link in plan["links"]:
        pool = _bridge_network(
            str(link["subnet"]), [link["source_ip"], link["target_ip"]]
        )
        clash = conflict_for(pool, reserved)
        if clash is None:
            continue
        raise DeployError(
            f"Link {link['source']}–{link['target']} would use {link['subnet']} "
            f"— {describe(clash)}. Docker adds a route to the host for every "
            f"network it creates, so that link would have taken this machine's "
            f"own route and left it without a connection. Give the link an "
            f"address outside {clash} and deploy again."
        )


def deploy(topology: dict[str, Any], wait_seconds: float = 90.0) -> dict[str, Any]:
    """Build, start and configure the lab for `topology`.

    Any container already holding a planned router name is replaced, because
    container names come from router ids and two labs cannot share them.
    """
    # The machine's networks are read afresh before the plan is resolved. The
    # cached reading can be a minute old, and the machine may have joined a
    # different network since -- a phone hotspot instead of the office wifi --
    # and a plan built from the old reading would claim the new one.
    reserved_networks(exclude_project=COMPOSE_PROJECT, refresh=True)

    plan = resolve_plan(topology)

    # Nothing is created until the plan is known to be safe on this machine.
    _check_plan_against_host(
        plan, reserved_networks(exclude_project=COMPOSE_PROJECT)
    )

    client = _client()

    # A redeploy has to start from nothing. Docker Compose identifies a
    # resource by project + *name*, so the compose file for a new topology
    # reuses the networks the previous topology left behind -- and a reused
    # network keeps its old subnet, because Compose does not reconfigure the
    # IPAM of a network that already exists. The routers are then configured
    # with the new plan's addresses, which are not on the network they are
    # attached to, and verification fails with "link R5-R6 (192.168.4.3) is
    # not in OSPF". Docker can also refuse outright with "invalid pool
    # request: Pool overlaps with other one on this address space" when the
    # new pool lands inside a survivor's.
    #
    # Removing first also means a failed deploy leaves *no* lab rather than a
    # lab built from a different topology, which is what the analytics page
    # would otherwise be measuring.
    _remove_lab_resources(client)

    write_files(plan)

    replaced = _free_container_names([r["container"] for r in plan["routers"]], client)

    up = _compose("up", "-d")
    if up.returncode != 0:
        raise DeployError(
            "docker compose could not start the lab: "
            + (up.stderr or up.stdout or "").strip()[-500:]
        )

    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        if all(
            c.status == "running"
            for c in (client.containers.get(r["container"]) for r in plan["routers"])
        ):
            break
        time.sleep(1.0)
    else:
        raise DeployError("The generated containers did not all reach 'running'")

    # The record is written before configuring, not after. `write_files` has
    # already removed LAB_DIR, and `configure` can still fail verification, so
    # saving only on success left a running lab with no plan on disk --
    # `deployed_lab_running()` then reported False and GET /api/lab/deploy
    # reported no lab at all for a lab that was plainly running.
    save_plan(plan, {})

    # FRR is still loading its own config at this point; pushing now would be
    # discarded rather than applied.
    _wait_for_frr(client, [r["container"] for r in plan["routers"]], deadline)

    assignments = configure(plan, client)
    save_plan(plan, assignments)

    # OSPF needs a moment to form adjacencies *and to compute the routes
    # from them*. A fixed sleep was not enough: the deploy returned while the
    # SPF was still running, and the Analytics page measured the lab straight
    # away and reported the pair as unreachable -- a false negative from a
    # network that had not finished starting. The wait is for the routers to
    # have finished learning the topology, so "deployed" means "ready to
    # measure".
    convergence = wait_for_convergence(client, plan)
    return {
        "ok": True,
        "lab_dir": LAB_DIR,
        "replaced_containers": replaced,
        "routers": [{"id": r["id"], "container": r["container"], "area": r["area"]} for r in plan["routers"]],
        "links": plan["links"],
        "areas": plan["areas"],
        "interfaces": assignments,
        "notes": plan.get("notes", []),
        "convergence": convergence,
    }


def reapply() -> dict[str, Any]:
    """Re-push the planned OSPF configuration onto the lab that is running now.

    Interface names are not stable across a container restart. Docker hands
    `eth0..ethN` out again in a different order, so a saved frr.conf lands each
    area and cost on the **wrong interface** -- and FRR accepts that without
    complaint. The lab then looks perfectly healthy while OSPF is running on
    the wrong links: the adjacencies never form, the routers learn no routes,
    and the analytics page measures a network that has not converged. This is
    not a cosmetic problem; it silently changes every path and every figure.

    `configure()` is the answer to it: it reads the live interface map and
    addresses each interface by the address its link is supposed to hold,
    rather than by a guessed index. This function is that same path with no
    container recreated -- so it is safe to run against a lab that is already
    up, and it is what a machine restart needs.
    """
    plan = load_plan()
    if not plan:
        raise DeployError(
            "No lab has been built from the designer, so there is no "
            "configuration to re-apply. Deploy one first."
        )

    client = _client()

    # The containers must all be up: a router that is still starting has no
    # interfaces to read, and the configuration would be built from a reading
    # taken before Docker had finished attaching the bridges.
    missing = [
        r["container"]
        for r in plan["routers"]
        if not _container_is_running(client, r["container"])
    ]
    if missing:
        raise DeployError(
            "The lab is not fully up: " + ", ".join(missing) + " "
            + ("is" if len(missing) == 1 else "are") + " not running."
        )

    assignments = configure(plan, client)
    save_plan(plan, assignments)

    # The same wait as a deploy: pushing the configuration makes OSPF recompute
    # its tables, so the lab is only ready to measure once they have settled.
    convergence = wait_for_convergence(client, plan)

    return {
        "ok": True,
        "lab_dir": LAB_DIR,
        "routers": [
            {"id": r["id"], "container": r["container"], "area": r["area"]}
            for r in plan["routers"]
        ],
        "links": plan["links"],
        "areas": plan["areas"],
        "interfaces": assignments,
        "convergence": convergence,
    }


def _container_is_running(client, name: str) -> bool:
    try:
        return client.containers.get(name).status == "running"
    except Exception:  # noqa: BLE001 - a missing container is simply not running
        return False
