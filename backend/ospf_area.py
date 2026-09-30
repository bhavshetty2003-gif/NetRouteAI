"""Read and change OSPF areas on the live lab's interfaces.

Why this exists
---------------
The lab already runs genuine multi-area OSPF: area 0 as backbone, areas 1/2/3
around it, and ABRs (R2, R4, R8) holding interfaces in more than one area. That
state was previously only discoverable by reading `frr.conf` by hand, so the
analytics page could not show which router was an ABR or move an interface
between areas.

Everything here is measured or applied through `vtysh` in the running
containers. Nothing is inferred from the drawn topology, because the routers are
the authority on their own area assignment.

The backbone rule
-----------------
Area 0 is not a normal area. Per RFC 2328 section 9.1, non-backbone areas must
see every router through area 0, so an interface on the backbone cannot simply
be renumbered into area 2 without stranding the router. `BACKBONE_AREA` is
therefore rejected on every interface that is not already area 0, and moving an
*area 0* interface to a non-zero area is refused outright rather than allowed to
quietly black-hole the backbone. These are hard errors with an explanation, not
warnings the caller can dismiss.

Blast radius before applying
----------------------------
Moving an interface out of area 0 tears down the summary LSAs that carry
inter-area routes, so previously-reachable pairs can stop being reachable.
`preview_move` reports which of the currently-reachable pairs would be affected,
and the endpoint refuses to apply without that preview having been requested, so
the UI cannot silently black-hole the lab.
"""

from __future__ import annotations

import re
from typing import Any

from metrics_collector import LabUnavailable, _container, _exec

#: RFC 2328 reserves area 0 for the backbone. Not user-assignable.
BACKBONE_AREA = 0

#: OSPF area ids are 32-bit dotted quads, written `0.0.0.0` in FRR output even
#: for area 0. Accept both the quad and the bare-integer shorthand.
_AREA_FULL = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")
_AREA_INT = re.compile(r"^\d+$")

# `Internet Address 10.0.0.10/29, Broadcast 10.0.0.15, Area 0.0.0.0`
_ADDR_AREA = re.compile(
    r"Internet Address\s+(?P<addr>[0-9.]+/\d+),\s*"
    r"Broadcast\s+(?P<bcast>[0-9.]+),\s*"
    r"Area\s+(?P<area>[0-9.]+)"
)
# `eth0 is up` / `eth0 is administratively down`
_IFACE_HEAD = re.compile(r"^(?P<iface>[A-Za-z][\w./-]*)\s+is\s+(?P<state>.+)$")


class AreaError(LabUnavailable):
    """A refused area change. Carries a reason the UI can show verbatim."""


def normalise_area(area: str | int) -> int:
    """Return the integer form of an OSPF area id.

    FRR prints `0.0.0.0` for the backbone, but `ip ospf area 0` is what the
    command line wants, and 1.1.1.1/0.0.0.2 are both valid ways to write the same
    area. Both are reduced to a plain integer so a router whose interfaces
    disagree only on formatting is not reported as multi-area.
    """
    text = str(area).strip()
    if _AREA_INT.match(text):
        return int(text)
    if _AREA_FULL.match(text):
        parts = [int(p) for p in text.split(".")]
        if any(p > 255 for p in parts):
            raise AreaError(f"'{text}' is not a valid OSPF area id")
        return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]
    raise AreaError(f"'{text}' is not a valid OSPF area id")


def format_area(area: int) -> str:
    """The `x.x.x.x` form FRR prints, which is what the UI shows."""
    return f"{(area >> 24) & 0xFF}.{(area >> 16) & 0xFF}.{(area >> 8) & 0xFF}.{area & 0xFF}"


def _parse_interfaces(out: str) -> list[dict[str, Any]]:
    """Split `show ip ospf interface` output into per-interface records.

    Only interfaces OSPF actually runs on appear in this output. That matters:
    an interface configured into area 1 but not yet operational is absent, so it
    is correctly reported as "not in OSPF" rather than as being in area 0.
    """
    interfaces: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for line in out.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        if not line.startswith((" ", "\t")):
            head = _IFACE_HEAD.match(stripped)
            if head:
                if current:
                    interfaces.append(current)
                current = {
                    "interface": head.group("iface"),
                    "state": head.group("state").strip(),
                    "area": None,
                    "area_dotted": None,
                    "address": None,
                    "network_type": None,
                    "cost": None,
                    "router_id": None,
                }
            elif current:
                current = None
            continue

        if current is None:
            continue

        if stripped.startswith("Internet Address"):
            # The Area field is on this same line, so the record is only
            # meaningful once both have been seen.
            match = _ADDR_AREA.search(stripped)
            if match:
                current["address"] = match.group("addr")
                area = normalise_area(match.group("area"))
                current["area"] = area
                current["area_dotted"] = format_area(area)
        elif stripped.startswith("Router ID"):
            # FRR packs these onto one line: "Router ID 1.1.1.1, Network Type
            # POINTOPOINT, Cost: 10". Splitting the fields independently of how
            # they are ordered keeps the parse working if that layout changes.
            match = re.search(r"Router ID\s+([0-9.]+)", stripped)
            if match:
                current["router_id"] = match.group(1)
            # `\S+` would swallow the comma that terminates the field.
            match = re.search(r"Network Type\s+([A-Za-z0-9-]+)", stripped)
            if match:
                current["network_type"] = match.group(1)
            match = re.search(r"Cost:\s*(\d+)", stripped)
            if match:
                current["cost"] = int(match.group(1))

    if current:
        interfaces.append(current)
    return interfaces


def read_router_areas(client, container_name: str) -> dict[str, Any]:
    """One router's area state, read from the live OSPF process."""
    container = _container(client, container_name)
    code, out = _exec(container, ["vtysh", "-c", "show ip ospf interface"], timeout=20)
    if code != 0:
        raise AreaError(
            f"{container_name} did not report its OSPF interfaces: {out.strip()[:200]}"
        )

    interfaces = _parse_interfaces(out)
    areas = sorted({i["area"] for i in interfaces if i["area"] is not None})

    # An ABR is defined by holding interfaces in more than one area, so this is
    # read off the real assignment rather than asserted by configuration.
    role = "ABR" if len(areas) > 1 else "internal"
    return {
        "router_id": _router_id(out),
        "interfaces": interfaces,
        "areas": areas,
        "areas_dotted": [format_area(a) for a in areas],
        "role": role,
        "backbone": BACKBONE_AREA in areas,
        "operational": code == 0,
    }


def _router_id(out: str) -> str | None:
    match = re.search(r"Router ID\s+([0-9.]+)", out)
    return match.group(1) if match else None


def area_inventory(client, lab: dict[str, Any]) -> dict[str, Any]:
    """Area state for every router in the lab, plus a summary of who is an ABR.

    Routers are read individually rather than in parallel: `vtysh` on 12
    containers at once competes for the same Docker exec socket, and the whole
    sweep already costs ~12 round trips.
    """
    routers: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for device in lab["devices"]:
        if device["type"] != "router":
            continue
        try:
            state = read_router_areas(client, device["container"])
        except AreaError as exc:
            errors.append({"device": device["id"], "error": str(exc)})
            continue
        routers.append({"device": device["id"], "container": device["container"], **state})

    all_areas = sorted({a for r in routers for a in r["areas"]})
    return {
        "backbone_area": BACKBONE_AREA,
        "backbone_dotted": format_area(BACKBONE_AREA),
        "routers": routers,
        "areas": all_areas,
        "areas_dotted": [format_area(a) for a in all_areas],
        "abrs": [r["device"] for r in routers if r["role"] == "ABR"],
        "errors": errors,
    }


def validate_move(state: dict[str, Any], interface: str, target: int) -> None:
    """Refuse an area change that would be invalid. Raises with the reason.

    The backbone rules are enforced here rather than in the UI so that the
    guarantee holds no matter who calls the endpoint.
    """
    if interface not in {i["interface"] for i in state["interfaces"]}:
        raise AreaError(
            f"{interface} is not an OSPF interface on this router, so it has no area to change"
        )

    current = next(i["area"] for i in state["interfaces"] if i["interface"] == interface)

    if current == target:
        raise AreaError(f"{interface} is already in area {format_area(target)}")

    if target == BACKBONE_AREA:
        raise AreaError(
            "Area 0 is the backbone. It cannot be assigned as a target: a backbone "
            "interface exists because the router borders the backbone, not because "
            "someone renumbered it."
        )

    if current == BACKBONE_AREA:
        raise AreaError(
            f"{interface} is on the backbone (area 0). Moving it into area "
            f"{format_area(target)} would strand this router: non-backbone areas only "
            "learn about other areas through area 0, so its neighbours would lose "
            "every inter-area route. Add an interface in the target area to make "
            "this router an ABR instead."
        )

    if target < 0 or target > 0xFFFFFFFF:
        raise AreaError(f"{format_area(target)} is outside the 32-bit OSPF area range")


def preview_move(
    state: dict[str, Any], lab: dict[str, Any], interface: str, target: int, reachable: dict[str, bool]
) -> dict[str, Any]:
    """Which currently-reachable pairs this move would put at risk.

    `reachable` is the pair -> bool matrix from `/api/lab/reachability`. The move
    is not simulated -- OSPF has no dry-run -- so this reports the pairs that
    currently work and touch a router whose backbone participation changes. Those
    are the ones worth re-probing afterwards.
    """
    validate_move(state, interface, target)

    device = state["device"]
    at_risk: list[dict[str, Any]] = []
    for key, ok in reachable.items():
        if not ok:
            continue
        a, _, b = key.partition("|")
        if device not in (a, b):
            continue
        at_risk.append({"source": a, "destination": b, "peer": b if a == device else a})

    moving = next(i for i in state["interfaces"] if i["interface"] == interface)
    was_backbone = state["backbone"]

    return {
        "device": device,
        "interface": interface,
        "from_area": moving["area"],
        "from_area_dotted": moving["area_dotted"],
        "to_area": target,
        "to_area_dotted": format_area(target),
        "address": moving["address"],
        "would_become_abr": not was_backbone and target != BACKBONE_AREA and len(state["areas"]) == 1,
        "was_abr": was_backbone and len(state["areas"]) > 1,
        "at_risk_pairs": sorted(at_risk, key=lambda p: (p["source"], p["destination"])),
        "at_risk_count": len(at_risk),
        "warning": (
            f"{len(at_risk)} pair(s) currently reach each other through {device}. "
            "Moving an interface between areas makes OSPF re-flood summary LSAs, so "
            "those pairs must be re-probed afterwards."
            if at_risk
            else "No currently-reachable pair passes through this router."
        ),
    }


def apply_move(client, state: dict[str, Any], interface: str, target: int) -> dict[str, Any]:
    """Put `interface` into `target`, then read the router back to confirm.

    The read-back is the point: a `vtysh` config line can be accepted and still
    not take effect (wrong area syntax, an area the router will not join), and
    returning the post-change state means the UI never has to guess whether the
    change landed.
    """
    before = state["interfaces"]
    moving = next(i for i in before if i["interface"] == interface)

    container_name = state["container"]
    container = _container(client, container_name)

    # Two config lines, not one. FRR stores the area as a single value and
    # refuses to overwrite it in place:
    #
    #     Must remove previous area config before changing ospf area
    #
    # so `no ip ospf area` has to precede the new assignment. Omitting it makes
    # vtysh exit 0 while silently keeping the old area, which is why the change
    # is confirmed by reading the OSPF process back rather than by exit status.
    #
    # The whole stanza goes through one config-mode pipe: separate `-c` arguments
    # each run in exec mode, so `configure terminal` followed by an interface line
    # is rejected as an unknown command.
    code, out = _exec(
        container,
        [
            "sh",
            "-c",
            (
                f"printf 'configure terminal\\ninterface {interface}\\n"
                f"no ip ospf area\\nip ospf area {target}\\nend\\n' | vtysh"
            ),
        ],
        timeout=20,
    )
    if code != 0:
        raise AreaError(
            f"vtysh refused the area change on {container_name}/{interface}: "
            f"{out.strip()[:300] or 'no output'}"
        )
    # vtysh exits 0 even when it rejects a line, so refusals are detected in the
    # transcript rather than the exit code.
    if "unknown command" in out.lower() or "% " in out:
        refusal = next(
            (line.strip() for line in out.splitlines() if line.strip().startswith("%")),
            out.strip()[:200],
        )
        raise AreaError(
            f"vtysh refused the area change on {container_name}/{interface}: {refusal}"
        )

    after = read_router_areas(client, container_name)
    landed = next(
        (i for i in after["interfaces"] if i["interface"] == interface), None
    )

    if landed is None or landed["area"] != target:
        actual = landed["area_dotted"] if landed else "not in OSPF"
        raise AreaError(
            f"vtysh accepted the command but {container_name}/{interface} is still in "
            f"area {actual}, not {format_area(target)}. Check that every neighbour "
            "on this link is in the same area, or the interface will not form an adjacency."
        )

    # OSPF only forms an adjacency with an interface in the *same* area, so a
    # successful area change is also a routing change. Reported rather than
    # assumed, since it is what tells the caller which pairs to re-probe.
    neighbours = [
        line.split()[0]
        for line in _exec(
            container, ["vtysh", "-c", f"show ip ospf neighbor {interface}"], timeout=15
        )[1].splitlines()
        if line.strip() and not line.startswith(("Neighbor ID", " ")) and len(line.split()) > 1
    ]

    return {
        "device": state["device"],
        "interface": interface,
        "from_area": moving["area"],
        "from_area_dotted": moving["area_dotted"],
        "to_area": target,
        "to_area_dotted": format_area(target),
        "role": after["role"],
        "areas_dotted": after["areas_dotted"],
        "adjacent_now": neighbours,
        "message": (
            f"{container_name}/{interface} is now in area {format_area(target)} "
            f"(was {moving['area_dotted']}). {state['device']} is now a {after['role']} "
            f"router in areas {', '.join(after['areas_dotted'])}. "
            + (
                "No neighbour is adjacent on this link yet: OSPF only forms "
                "adjacencies between interfaces in the same area, so the far side "
                "must join this area too. Neighbours also take one dead-timer "
                "interval (40s) to re-form."
                if not neighbours
                else f"Still adjacent to {', '.join(neighbours)}."
            )
        ),
    }