"""Deploy the topology drawn in the designer as a real FRR lab.

This is the piece that makes the analytics page honest. Until now the only
measurable lab was the hand-committed `enterprise-ospf-lab`, so the designer and
the measurements could disagree about the network. Here the drawn topology
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

LAB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "labs", "current")
COMPOSE_PROJECT = "netrouteai"

# Routers are named after the designer's ids so the existing live discovery
# (`^r\d+$` in lab_topology) keeps working unchanged and so a canvas id and a
# container name never drift apart.
_ROUTER_ID = re.compile(r"^r(\d+)$", re.IGNORECASE)

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
# interfaces across a restart, and long enough for OSPF adjacencies to form.
_SETTLE_SECONDS = 6
_CONVERGE_SECONDS = 12

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
    return subprocess.run(
        ["docker", "compose", "-p", COMPOSE_PROJECT, *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=300,
    )


def _client() -> docker.DockerClient:
    try:
        return docker.from_env()
    except DockerException as exc:
        raise DeployError(f"Docker daemon unreachable: {exc}") from exc


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
        routers.append(
            {
                "id": key,
                "container": f"r{match.group(1)}",
                "name": str(raw.get("name") or key),
                "area": _normalise_area(raw.get("area", 0)),
                "router_id": str(raw.get("router_id") or "").strip(),
            }
        )
    if not routers:
        raise DeployError("The topology has no routers to deploy")
    if len(routers) < 2:
        raise DeployError("Deploy needs at least two routers")

    # Canonical order so eth assignment and container numbering are stable.
    routers.sort(key=lambda r: int(r["container"][1:]))
    for index, router in enumerate(routers, start=1):
        router["router_id"] = router["router_id"] or f"{index}.{index}.{index}.{index}"

    by_id = {r["id"]: r for r in routers}

    links: list[dict[str, Any]] = []
    used_addresses: dict[str, str] = {}
    used_subnets: set[ipaddress.IPv4Network] = set()

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
            raw, used_subnets, used_addresses
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
    raw: dict[str, Any], used_subnets: set[ipaddress.IPv4Network], taken_by: dict
) -> tuple[str, str, str, str, str]:
    """Resolve one link's subnet, its two addresses and its address class.

    A caller-supplied address always wins, so an IP the designer already shows
    is the IP the routers get. Only the blanks are filled in.

    Allocation scans each class's candidates from the start and takes the first
    subnet that is free, which is what makes a deleted link's subnet reusable:
    nothing is held anywhere except in the topology being planned, so removing a
    link releases its address for the next one automatically.
    """
    supplied_source = str(raw.get("source_ip") or "").strip()
    supplied_target = str(raw.get("target_ip") or "").strip()
    supplied_subnet = str(raw.get("subnet") or "").strip()

    if supplied_source or supplied_target or supplied_subnet:
        subnet = _subnet_from_supplied(supplied_subnet, supplied_source, supplied_target)
        address_class = _class_of(subnet)
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
            hosts = list(subnet.hosts())
            source_ip, target_ip = str(hosts[_FIRST_HOST - 1]), str(hosts[_FIRST_HOST])
        if source_ip == target_ip:
            raise DeployError(
                f"Link {raw.get('source')}–{raw.get('target')}: both ends were "
                f"given the same address {source_ip}"
            )
        # Already reserved by the pre-pass, which is also where a genuine
        # duplicate is reported -- re-checking here would flag this link's own
        # subnet as a collision.
        used_subnets.add(subnet)
        return str(subnet), source_ip, target_ip, address_class, mask_for_class(address_class)

    address_class = resolve_class(raw.get("address_class") or raw.get("ip_class"))
    for subnet in _class_candidates(address_class)[:_MAX_SUBNET_ATTEMPTS]:
        # Overlap, not just equality: a candidate /8 must not swallow a /24 some
        # other link already holds, or both links end up with the same host
        # addresses. The per-class blocks are disjoint by first octet, so the
        # only way to get here is a prefix boundary -- but a Class A link
        # renumbered next to a supplied /24 in the same first octet is enough.
        if any(subnet.overlaps(taken) for taken in used_subnets):
            continue
        used_subnets.add(subnet)
        hosts = list(subnet.hosts())
        return (
            str(subnet),
            str(hosts[_FIRST_HOST - 1]),
            str(hosts[_FIRST_HOST]),
            address_class,
            mask_for_class(address_class),
        )
    raise DeployError(
        f"No free Class {address_class} subnet left for the links in this topology"
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
    return ipaddress.ip_network(f"{address}/32")


def _class_of(subnet: ipaddress.IPv4Network) -> str:
    for letter, bits in CLASS_PREFIX.items():
        if subnet.prefixlen == bits:
            return letter
    return ""


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
    lines.append("")
    lines.append("networks:")
    for link in plan["links"]:
        lines += [
            f"  {link['network']}:",
            "    driver: bridge",
            "    ipam:",
            "      config:",
            f"        - subnet: {link['subnet']}",
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


def _write_configs(plan: dict[str, Any], readings: dict[str, dict[str, str]]) -> None:
    """Write every frr.conf from a measured iface -> ip reading."""
    by_address = {
        ip: link
        for link in plan["links"]
        for ip in (link["source_ip"], link["target_ip"])
    }

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
        with open(os.path.join(LAB_DIR, container, "frr.conf"), "w") as handle:
            handle.write(config)


def _area_to_int(text: str) -> int:
    """FRR prints areas dotted (`0.0.0.2`); the plan holds them as integers."""
    pieces = str(text).strip().split(".")
    try:
        return int(pieces[-1]) if len(pieces) == 4 else int(str(text).strip())
    except ValueError:
        return -1


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
    result = client.containers.get(container).exec_run(["sh", "-c", shell_command])
    output = getattr(result, "output", b"") or b""
    if isinstance(output, (tuple, list)):
        output = output[0] if output else b""
    return result.exit_code, output.decode() if isinstance(output, bytes) else str(output)


def _read_ospf_interfaces(client, container: str) -> dict[str, tuple[str, str]]:
    """Read {iface: (area, cost)} from `show ip ospf interface`."""
    result = client.containers.get(container).exec_run(
        ["vtysh", "-c", "show ip ospf interface"]
    )
    output = getattr(result, "output", b"") or b""
    if isinstance(output, (tuple, list)):
        output = output[0] if output else b""
    text = output.decode() if isinstance(output, bytes) else str(output)

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
    plan: dict[str, Any], client, max_attempts: int = 3
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
    by_address = {
        ip: link
        for link in plan["links"]
        for ip in (link["source_ip"], link["target_ip"])
    }

    problems: list[str] = []
    for attempt in range(1, max_attempts + 1):
        readings = _read_interfaces(client, plan, time.time() + 60)
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

        applied = {
            router["id"]: _read_ospf_interfaces(client, router["container"])
            for router in plan["routers"]
        }
        _verify_applied(plan, readings, applied, problems)

        if not problems:
            _write_configs(plan, readings)
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
    """Remove the generated lab. Safe to call when nothing is running."""
    if not os.path.exists(os.path.join(LAB_DIR, "docker-compose.yml")):
        return {"removed": False, "detail": "no generated lab on disk"}
    result = _compose("down", "--volumes", "--remove-orphans")
    return {
        "removed": result.returncode == 0,
        "detail": (result.stderr or result.stdout or "").strip()[-400:],
    }


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


ENTERPRISE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "enterprise-ospf-lab"
)


def _free_container_names(names: list[str], client) -> list[str]:
    """Stop and remove any container that already owns one of these names.

    Container names are derived from router ids, so a freshly designed lab and
    the fixed `enterprise-ospf-lab` both want `r1`, `r2`, ... and the second one
    to start would fail outright. The collision is resolved here rather than
    surfaced as an opaque Docker error.
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


def deploy_enterprise() -> dict[str, Any]:
    """Bring the fixed `enterprise-ospf-lab` back up.

    This is the fallback: it is the lab every measurement endpoint was built
    against, so it stays available when no designed topology has been deployed.
    """
    compose_file = os.path.join(ENTERPRISE_DIR, "docker-compose.yml")
    if not os.path.exists(compose_file):
        raise DeployError(f"No fixed lab compose file at {compose_file}")

    current = load_plan()
    if current:
        teardown()

    result = subprocess.run(
        ["docker", "compose", "up", "-d"],
        cwd=ENTERPRISE_DIR,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        raise DeployError(
            "Could not start the fixed lab: " + (result.stderr or result.stdout or "").strip()[-500:]
        )
    return {"ok": True, "lab": "enterprise-ospf-lab", "compose_file": compose_file}


def deploy(topology: dict[str, Any], wait_seconds: float = 90.0) -> dict[str, Any]:
    """Build, start and configure the lab for `topology`.

    Any container already holding a planned router name is replaced, because
    container names come from router ids and two labs cannot share them.
    """
    plan = resolve_plan(topology)

    write_files(plan)

    client = _client()
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

    assignments = configure(plan, client)
    save_plan(plan, assignments)

    # OSPF needs a moment to form adjacencies before anything is worth measuring.
    time.sleep(_CONVERGE_SECONDS)
    return {
        "ok": True,
        "lab_dir": LAB_DIR,
        "replaced_containers": replaced,
        "routers": [{"id": r["id"], "container": r["container"], "area": r["area"]} for r in plan["routers"]],
        "links": plan["links"],
        "areas": plan["areas"],
        "interfaces": assignments,
    }
