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

Usage:
    python lab_doctor.py           report what is wrong
    python lab_doctor.py --fix     remove the lab's conflicting networks too
"""

from __future__ import annotations

import ipaddress
import os
import sys

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

    print("This machine's own networks:")
    details = host_networks.host_network_details(refresh=True)
    for entry in details:
        print(f"  {entry['network']:<20} on {entry['iface']}")

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
        print("\nNo Docker network is using this machine's own network. Nothing to fix.")
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
        print("If the network is still unidentified, reconnect to it:")
        iface = _wireless_interface()
        if iface:
            print(f"    nmcli device disconnect {iface} && nmcli device connect {iface}")
        else:
            print("    nmcli device disconnect <wifi-interface> && nmcli device connect <wifi-interface>")
        print("or turn the wifi off and on again.")
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
