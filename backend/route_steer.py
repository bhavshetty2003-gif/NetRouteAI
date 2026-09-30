"""Steer the running lab's data plane onto a chosen path.

The routing-method selector has to do something real, not just relabel a
column. FRR will forward whatever its OSPF table says, so to make the lab
actually carry the AI (or Dijkstra) path a static route has to be installed on
the source router pinning the destination to that path's next hop.

Two things make this safe enough to expose on a page:

* The next hop must be in a subnet the source router is itself attached to. A
  next hop that is only reachable *through* OSPF would make zebra resolve the
  static route recursively back onto the OSPF path, silently achieving nothing.
  `steer_plan` rejects that case instead of pretending it worked.
* Every install is reversible with the exact same triple, and `static_routes`
  lets the caller see what is currently pinned so it can be reverted.

Nothing is written to disk. The lab's `frr.conf` is root-owned and bind
mounted, and `write memory` fails with "Resource busy"; more to the point a
live-only change disappears on restart, which is the right default for a
measurement control.
"""

from __future__ import annotations

import re
from typing import Any

from metrics_collector import LabUnavailable, _exec


def _ip_to_int(ip: str) -> int:
    parts = ip.split(".")
    if len(parts) != 4:
        raise ValueError(f"not an IPv4 address: {ip}")
    value = 0
    for part in parts:
        byte = int(part)
        if not 0 <= byte <= 255:
            raise ValueError(f"not an IPv4 address: {ip}")
        value = (value << 8) | byte
    return value


def in_subnet(ip: str, cidr: str) -> bool:
    """True when `ip` falls inside `cidr`. Local copy of the collector's check
    so this module does not depend on a private helper."""
    if "/" not in cidr:
        return False
    network, bits_text = cidr.split("/", 1)
    try:
        bits = int(bits_text)
        mask = (0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF if bits else 0
        return (_ip_to_int(ip) & mask) == (_ip_to_int(network) & mask)
    except ValueError:
        return False


def hop_plan(
    lab: dict[str, Any], a: str, b: str, dest_ip: str
) -> dict[str, Any] | None:
    """The static route that makes router `a` hand `dest_ip` to router `b`.

    Returns None when the pair cannot be steered, with the reason in `error`.
    """
    a_dev = next((d for d in lab["devices"] if d["id"] == a), None)
    b_dev = next((d for d in lab["devices"] if d["id"] == b), None)
    if not a_dev or not b_dev:
        return None

    adjacency = next(
        (
            l
            for l in lab["links"]
            if frozenset((l["source"], l["target"])) == frozenset((a, b))
        ),
        None,
    )
    if adjacency is None:
        return {"error": f"{b} is not directly connected to {a}"}

    subnet = adjacency.get("subnet") or ""
    ifaces = [
        (iface, addr)
        for iface, addr in a_dev["addresses"].items()
        if addr and in_subnet(addr.split("/", 1)[0], subnet)
    ]
    hop_addrs = [
        addr
        for addr in b_dev["addresses"].values()
        if addr and in_subnet(addr.split("/", 1)[0], subnet)
    ]
    if not ifaces or not hop_addrs:
        return {
            "error": (
                f"could not resolve {a}'s interface and {b}'s address within "
                f"their shared subnet {subnet}"
            )
        }

    iface, local_ip = ifaces[0]
    hop_ip = hop_addrs[0]
    prefix = f"{dest_ip}/32"
    return {
        "device": a,
        "container": a_dev["container"],
        "interface": iface,
        "subnet": subnet,
        "local_ip": local_ip,
        "next_hop_device": b,
        "next_hop": hop_ip,
        "prefix": prefix,
        "command": f"ip route {prefix} {hop_ip} {iface}",
    }


def steer_plan(
    method: str,
    path: list[str],
    lab: dict[str, Any],
    source: str,
    destination: str,
) -> dict[str, Any]:
    """Work out the static routes that would put `method`'s path in effect.

    Every transit hop needs its own route, not just the source. Pinning only
    the source router was tried and is not sufficient: sending R1's traffic to
    R2 produced R1 -> R2 -> R3 -> R12 -> R11, because R2's own OSPF still chose
    its own way onward and only the first hop was pinned.

    Returns a plan rather than acting, so the UI can show what would change and
    refuse, with a reason, when it cannot be done.
    """
    base: dict[str, Any] = {"method": method, "applicable": False, "hops": []}

    if method == "ospf":
        base["reason"] = (
            "OSPF is already in effect -- it is what the routers forward with "
            "nothing injected, so there is nothing to install."
        )
        base["already_in_effect"] = True
        return base

    if not path or len(path) < 2:
        base["reason"] = f"No {method} path between {source} and {destination}."
        return base

    dest_ip = lab["ip_index"].get(destination)
    if not dest_ip:
        base["reason"] = f"No address known for {destination}."
        return base

    hops: list[dict[str, Any]] = []
    for a, b in zip(path, path[1:]):
        hop = hop_plan(lab, a, b, dest_ip)
        if hop is None or hop.get("error"):
            base["reason"] = (
                f"Cannot steer {a} -> {b}: {hop.get('error') if hop else 'unknown device'}. "
                "A static route can only hand traffic to a directly connected "
                "neighbour, so every hop of the chosen path must be adjacent."
            )
            return base
        hops.append(hop)

    first = hops[0]
    base.update(
        {
            "applicable": True,
            "already_in_effect": False,
            "hops": hops,
            "device": first["device"],
            "container": first["container"],
            "interface": first["interface"],
            "subnet": first["subnet"],
            "next_hop_device": first["next_hop_device"],
            "next_hop": first["next_hop"],
            "prefix": first["prefix"],
            "command": first["command"],
            "commands": [h["command"] for h in hops],
            "path": path,
            "reason": (
                f"Installs {len(hops)} static route(s), one per transit hop, pinning "
                f"{destination} ({dest_ip}) along "
                + " then ".join(f"{h['device']}->{h['next_hop_device']}" for h in hops)
                + f". Static routes beat OSPF, so FRR forwards this path until they "
                "are removed."
            ),
        }
    )
    return base


# FRR prints one entry per line, for example:
#   S>* 10.0.0.58/32 [1/0] via 10.0.0.3, eth1, weight 1, 00:00:23
_STATIC_ENTRY = re.compile(
    r"^S[>*]*\s+(?P<prefix>[0-9a-fA-F:.]+/\d+)\s+\[[^\]]*\]\s+"
    r"via\s+(?P<next_hop>[0-9a-fA-F:.]+)(?:,\s*(?P<interface>[A-Za-z0-9_.-]+))?"
)


def static_routes(container: str) -> list[dict[str, Any]]:
    """Currently installed static routes, so a UI can offer an exact revert.

    The interface is kept because `no ip route` needs prefix, next hop and
    interface to match the entry exactly, otherwise FRR answers "Command
    incomplete" and the route survives.
    """
    code, out = _exec(container, ["vtysh", "-c", "show ip route static"], timeout=20)
    if code != 0:
        raise LabUnavailable(out.strip() or f"vtysh failed in {container}")

    routes: list[dict[str, Any]] = []
    for line in out.splitlines():
        m = _STATIC_ENTRY.match(line.strip())
        if m:
            routes.append(
                {
                    "prefix": m.group("prefix"),
                    "next_hop": m.group("next_hop"),
                    "interface": m.group("interface"),
                }
            )
    return routes


def apply_steer(plan: dict[str, Any]) -> dict[str, Any]:
    """Install every static route in `plan`.

    All routes go in one vtysh session so a partially applied path is not left
    behind: if any hop is rejected, the ones already accepted are removed again
    before the error is raised.
    """
    if not plan.get("applicable"):
        raise LabUnavailable(plan.get("reason") or "Nothing to install.")

    hops = plan.get("hops") or []
    if not hops:
        raise LabUnavailable("Steering plan contains no hops.")

    # One vtysh session per router. Sending every hop's command to a single
    # container silently installs the later hops on the wrong router.
    by_container: dict[str, list[dict[str, Any]]] = {}
    for hop in hops:
        by_container.setdefault(hop["container"], []).append(hop)

    commands = [h["command"] for h in hops]
    installed: list[dict[str, Any]] = []
    errors: list[str] = []

    for container, container_hops in by_container.items():
        script = (
            "configure terminal\n"
            + "\n".join(h["command"] for h in container_hops)
            + "\nend\n"
        )
        code, out = _exec(container, ["vtysh"], timeout=25, stdin=script)
        for line in out.splitlines():
            if line.strip().startswith("%"):
                errors.append(f"{container}: {line.strip().lstrip('% ').strip()}")
        if code != 0:
            errors.append(f"{container}: {out.strip() or f'vtysh exited {code}'}")
        else:
            installed.extend(container_hops)

    if errors:
        _rollback(installed)
        raise LabUnavailable("; ".join(e for e in errors if e))

    return {"ok": True, "commands": commands, "containers": sorted(by_container)}


def _rollback(hops: list[dict[str, Any]]) -> None:
    """Undo a partially applied plan so the lab is never left half-steered."""
    for hop in reversed(hops):
        prefix, next_hop, iface = hop["prefix"], hop["next_hop"], hop["interface"]
        _exec(
            hop["container"],
            ["vtysh"],
            timeout=20,
            stdin=f"configure terminal\nno ip route {prefix} {next_hop} {iface}\nend\n",
        )


def revert_steer(container: str, prefix: str, next_hop: str, interface: str) -> dict[str, Any]:
    """Remove a static route installed by `apply_steer`.

    FRR requires the next hop and interface to match the entry exactly; omitting
    them returns "Command incomplete", so they are always passed.
    """
    command = f"no ip route {prefix} {next_hop} {interface}"
    code, out = _exec(
        container, ["vtysh"], timeout=20,
        stdin=f"configure terminal\n{command}\nend\n",
    )

    if code != 0:
        raise LabUnavailable(out.strip() or f"vtysh exited {code}")
    if "%" in out and "non-existent" in out:
        raise LabUnavailable(f"No static route {prefix} via {next_hop} to remove.")
    if "%" in out:
        raise LabUnavailable(out.strip().splitlines()[0].lstrip("% "))

    return {"ok": True, "command": command, "output": out.strip()}