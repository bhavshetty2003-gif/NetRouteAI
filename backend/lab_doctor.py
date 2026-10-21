#!/usr/bin/env python3
"""Report -- and repair -- the Docker networks that are stealing this machine's own.

Every Docker bridge network becomes a route on the host, and that route has
metric 0. The route a laptop's wifi gets from DHCP has metric 600. So a
network whose subnet is the one the machine is already on does not sit next
to it: the kernel prefers Docker's route, the machine sends its traffic to
its router through the bridge, the router stops answering, and the desktop
shows an unidentified network -- a question mark on the wifi icon, with no
internet on the machine that is running the lab.

This finds the networks doing that, and can remove the ones the lab created.

It also does the second half of the repair, which is the half that is easy
to forget: the machine's DHCP request failed while the bad route was in
place, so it is associated with the access point and has no address. Putting
the route right does not make the lease arrive by itself; the request has to
be made again. `--fix` does both.

Usage:
    python lab_doctor.py           report what is wrong
    python lab_doctor.py --fix     remove the lab's conflicting networks too
    python lab_doctor.py --reseat  only ask the network for an address again
"""

from __future__ import annotations

import ipaddress
import os
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import host_networks
from host_networks import conflict_for

# The lab's own compose project. Its networks are the lab's, and they are
# removed on every deploy -- so they are the ones this tool may remove.
LAB_PROJECT = "netrouteai"

# The application stack's compose project. Its network is created before the
# backend starts and lives until the stack is brought down.
APP_PROJECT = "netrouteai-app"

# The label Docker Compose puts on every container and network it creates.
COMPOSE_PROJECT_LABEL = "com.docker.compose.project"


def _client():
    try:
        import docker

        return docker.from_env()
    except Exception as exc:  # pragma: no cover - depends on the machine
        print(f"Could not reach Docker: {exc}")
        return None


def _pools(network) -> list[str]:
    config = (network.attrs.get("IPAM") or {}).get("Config") or []
    return [entry.get("Subnet") for entry in config if entry.get("Subnet")]


def _project(network) -> str:
    labels = network.attrs.get("Labels") or {}
    return labels.get(COMPOSE_PROJECT_LABEL) or ""


def _is_lab_network(network) -> bool:
    """Whether a network is one the lab created.

    Compose names the lab's networks `netrouteai_n00`, `netrouteai_n01` and
    labels them with the lab's project. Either mark is enough: a network made
    by an older version of the lab, or by hand, has the name but not the
    label.

    The application stack's own network is `netrouteai-app_default` -- a
    different project, and a different name -- so neither mark catches it.
    """
    return _project(network) == LAB_PROJECT or network.name.startswith(
        f"{LAB_PROJECT}_n"
    )


def _advice(network) -> list[str]:
    """How to move a network this tool will not remove.

    The doctor removes the lab's own networks and nothing else: somebody
    else's network is not this repository's business. But a network that stays
    in place keeps taking the machine's route, so the report has to say what
    to do about it rather than only naming it.
    """
    project = _project(network)
    name = network.name

    if project == APP_PROJECT or name.startswith(f"{APP_PROJECT}_"):
        return [
            f"{name} belongs to the application stack (docker-compose.yml).",
            "Its subnet comes from APP_SUBNET, which now defaults to "
            "198.18.0.0/15 because Docker's automatic pool can land on a "
            "network a laptop is already using.",
            "Give it a subnet of its own and bring the stack back up:",
            f"    APP_SUBNET={_free_suggestion()} docker compose up -d --build",
            "(from the repository root). The old network is removed by that "
            "command, and with it the route that was hiding the machine's own.",
        ]

    if name in ("bridge", "docker0"):
        return [
            f"{name} is Docker's own default bridge network.",
            "Docker creates it from the address pools in /etc/docker/daemon.json, "
            "and it is the one network this tool must not remove: every "
            "container's default bridge is attached to it.",
            "Stop Docker and give the pools a range that is not on this "
            "machine's network, then start it again:",
            "    # /etc/docker/daemon.json",
            '    { "default-address-pools": [ { "base": 198.18.0.0/15", "size": 24 } ] }',
            "    sudo systemctl restart docker",
        ]

    return [
        f"{name} was not created by this project, so the doctor will not "
        "remove it.",
        "It has to be moved to a subnet this machine is not using. Whatever "
        "created it -- another compose file, or Docker directly -- needs to "
        "be given a different subnet.",
    ]


def _free_suggestion() -> str:
    """A subnet to suggest for a network that has to be moved.

    The benchmarking range is the obvious candidate: no consumer router, no
    phone hotspot and none of the lab's own address classes use it.
    """
    return "198.18.0.0/15"


def _wireless_interface() -> str:
    """The machine's own wireless interface, if it has one.

    Used only to print a reconnect command the reader can paste without
    editing it. The route table says which interface carries the machine's
    network; the wireless ones are named `wl*` by the kernel.
    """
    try:
        details = host_networks.host_network_details()
    except Exception:  # pragma: no cover - depends on the machine
        return ""
    for entry in details:
        iface = (entry.get("iface") or "").strip()
        if iface.startswith("wl"):
            return iface
    return ""


def _run(command: list[str]) -> tuple[int, str]:
    """Run a command and return its exit status and output."""
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=30
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, str(exc)
    return result.returncode, (result.stdout or "") + (result.stderr or "")


def _interface_has_address(iface: str) -> bool:
    """Whether the interface currently holds an IPv4 address.

    This is the difference between a working connection and the question mark
    on the wifi icon: the machine is associated with the access point either
    way, but without an address it has no lease and no route, and nothing
    works.
    """
    # An interface that is not there at all has no address. That is a known
    # answer, not a question that cannot be answered, and the two have to be
    # told apart: the first is a fault, the second is not.
    if not os.path.isdir(os.path.join("/sys/class/net", iface)):
        return False
    code, out = _run(["ip", "-4", "-o", "addr", "show", "dev", iface])
    if code != 0:
        return True  # Cannot tell. Do not claim a fault that may not exist.
    return "inet " in out


def _active_profile(iface: str) -> str:
    """The NetworkManager profile the interface is currently using."""
    code, out = _run(["nmcli", "-t", "-f", "NAME,DEVICE", "con", "show", "--active"])
    if code != 0:
        return ""
    for line in out.splitlines():
        name, _, device = line.partition(":")
        if device == iface and name:
            return name
    return ""


def _reseat_connection(iface: str) -> tuple[bool, list[str]]:
    """Ask the machine's own network for a lease again.

    A question mark on the wifi icon is not the same fault as a wrong route,
    and fixing the route does not always finish the job.

    While Docker's route was in front, the machine's DHCP request went out
    through the bridge and never reached the router. NetworkManager timed it
    out, so the machine is associated with the access point and has no
    address -- which is exactly what the question mark means. Removing the
    bad route puts the machine's own route back, but the request that failed
    has to be made again before the machine has an address.

    Bringing the profile down and up again makes NetworkManager repeat the
    request, and this time it leaves by the machine's own route.
    """
    notes: list[str] = []
    problems: list[str] = []
    if not iface:
        return False, ["No wireless interface was found, so nothing was reconnected."]
    if shutil.which("nmcli") is None:
        return False, [
            "NetworkManager's nmcli is not installed, so the connection was "
            "not reconnected. Turn the wifi off and on again instead."
        ]

    profile = _active_profile(iface)
    if profile:
        _run(["nmcli", "con", "down", profile])
        time.sleep(1)
        code, out = _run(["nmcli", "con", "up", profile])
        if code != 0:
            # The profile may not be able to come up by name -- a connection
            # that was made by hand has no profile of its own. Falling back to
            # the device is the same thing done the other way round, and it
            # often works where the profile does not.
            problems.append(f"Could not bring '{profile}' up: {out.strip()}")
            _run(["nmcli", "device", "disconnect", iface])
            time.sleep(1)
            code, out = _run(["nmcli", "device", "connect", iface])
            if code != 0:
                problems.append(f"Could not connect {iface}: {out.strip()}")
    else:
        _run(["nmcli", "device", "disconnect", iface])
        time.sleep(1)
        code, out = _run(["nmcli", "device", "connect", iface])
        if code != 0:
            problems.append(f"Could not connect {iface}: {out.strip()}")

    # Give the lease a moment to arrive before reporting.
    for _ in range(10):
        if _interface_has_address(iface):
            # The address is what matters. A step that failed on the way to
            # getting it is not reported as a fault once it has arrived.
            return True, notes
        time.sleep(1)

    if problems:
        notes.extend(problems)
    notes.append(
        f"{iface} still has no address. The router may be slow to answer, "
        "or the connection needs to be selected by hand."
    )
    return False, notes


def _detach(client, network_name: str) -> list[str]:
    """Remove the containers attached to a network.

    Docker refuses to delete a network that still has an endpoint attached, so
    the routers on it have to go first. They are the lab's, and the lab is
    being taken down because it was taking the machine's network with it.
    """
    removed: list[str] = []
    try:
        containers = client.containers.list(
            all=True, filters={"network": network_name}
        )
    except Exception:
        return removed
    for container in containers:
        try:
            container.remove(force=True)
            removed.append(container.name)
        except Exception:
            continue
    return removed


def main(argv: list[str]) -> int:
    fix = "--fix" in argv
    reseat_only = "--reseat" in argv

    print("This machine's own networks:")
    details = host_networks.host_network_details(refresh=True)
    for entry in details:
        print(f"  {entry['network']:<20} on {entry['iface']}")

    iface = _wireless_interface()

    if reseat_only:
        # The route may already be right and the lease still wrong, so this
        # asks the network for an address again without touching Docker.
        print("\nAsking the machine's own network for an address again...")
        ok, notes = _reseat_connection(iface)
        for note in notes:
            print(f"  {note}")
        if ok:
            print(f"\n{iface} has an address again.")
            return 0
        print(f"\n{iface} still has no address. The steps below apply.")
        return 1

    client = _client()
    if client is None:
        return 1

    try:
        networks = client.networks.list()
    except Exception as exc:
        print(f"Could not list Docker's networks: {exc}")
        return 1

    machine = host_networks.host_networks()
    clashes: list[tuple[str, str, str]] = []
    for network in networks:
        for pool in _pools(network):
            try:
                subnet = ipaddress.ip_network(pool, strict=False)
            except ValueError:
                continue
            clash = conflict_for(subnet, machine)
            if clash is not None:
                clashes.append((network.name, pool, str(clash)))

    if not clashes:
        print("\nNo Docker network is using this machine's own network.")
        # The route can be right while the lease is still wrong: the question
        # mark means no address, and a DHCP request that failed while the bad
        # route was in place has to be made again.
        if iface and not _interface_has_address(iface):
            print(f"\nBut {iface} has no address, so the connection is not usable yet.")
            if fix:
                ok, notes = _reseat_connection(iface)
                for note in notes:
                    print(f"  {note}")
                if ok:
                    print(f"\n{iface} has an address again.")
                    return 0
                print(f"\n{iface} still has no address.")
                return 1
            print("Reconnect it with:  ./start.sh --doctor --reseat")
        return 0

    print("\nThese Docker networks are using a network this machine is on:")
    for name, pool, clash in clashes:
        print(f"  {name}  {pool}  (this machine's {clash})")

    removed: list[str] = []
    kept: list[str] = []
    for name, _pool, _clash in clashes:
        network = next((n for n in networks if n.name == name), None)
        if network is None:
            continue
        if not _is_lab_network(network):
            # Not the lab's. Removing somebody else's network is not this
            # tool's business.
            kept.append(name)
            continue
        if not fix:
            continue
        for container in _detach(client, name):
            removed.append(container)
        try:
            network.remove()
            removed.append(name)
        except Exception as exc:
            kept.append(f"{name} ({exc})")

    if not fix:
        print("\nRun this again with --fix to remove the lab's conflicting networks.")
        print("The route they added is why the machine has no connection right now.")
        for name in kept:
            network = next((n for n in networks if n.name == name), None)
            if network is None:
                continue
            print(f"\n{name} is not the lab's, so --fix will leave it alone:")
            for line in _advice(network):
                print(f"    {line}")
        return 1

    if removed:
        print("\nRemoved:")
        for name in removed:
            print(f"  {name}")
        print("\nThe route those networks added is gone. The machine's own route is back.")
        # The route being right is half the repair. The other half is the
        # lease: the DHCP request that failed while the bad route was in
        # place has to be made again before the machine has an address.
        if iface:
            ok, notes = _reseat_connection(iface)
            for note in notes:
                print(f"  {note}")
            if ok:
                print(f"\n{iface} has an address again, and the connection is usable.")
            else:
                print(f"\n{iface} still has no address. Turn the wifi off and on again,")
                print(f"or run:  nmcli device disconnect {iface} && nmcli device connect {iface}")
    if kept:
        print("\nLeft alone (not the lab's to remove):")
        for name in kept:
            print(f"  {name}")
            network = next((n for n in networks if n.name == name), None)
            if network is None:
                continue
            for line in _advice(network):
                print(f"    {line}")
    return 0 if removed or not kept else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
