#!/usr/bin/env python3
"""
Test the addressing rules that keep the lab off the machine's own network.

Docker turns every bridge network it creates into a route on the host, and
that route beats the one a laptop's wifi got from DHCP. So a link that takes
the subnet the machine is already on does not merely sit next to it -- it
takes the machine's connection away, and the desktop shows an unidentified
network: a question mark on the wifi icon.

This script checks that:

  1. the machine's routing table is read and parsed correctly
  2. a link is never given a network the machine is already using
  3. a link that was *given* a clashing address is moved, and says so
  4. allocating a Class A link does not cost a gigabyte of memory

Usage:
    python test_host_networks.py
"""

import ipaddress
import os
import resource
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import host_networks
import lab_doctor
from lab_deploy import DeployError, resolve_plan

FAILURES: list[str] = []


def check(condition: bool, message: str) -> None:
    if condition:
        print(f"  ok    {message}")
    else:
        print(f"  FAIL  {message}")
        FAILURES.append(message)


def topology(*links: dict) -> dict:
    """A two-router topology carrying the given links."""
    return {
        "routers": [{"id": "R1", "area": 0}, {"id": "R2", "area": 0}],
        "links": list(links),
    }


def test_route_parsing():
    print("\n== the machine's routing table ==")
    sample = (
        "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\t"
        "Window\tIRTT\n"
        "wlp3s0\t00000000\t011FA8C0\t0003\t0\t0\t600\t00000000\t0\t0\t0\n"
        "docker0\t000011AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0\n"
        "wlp3s0\t001FA8C0\t00000000\t0001\t0\t0\t600\t00FFFFFF\t0\t0\t0\n"
        "tun0\t0000A8C0\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0\n"
    )
    parsed = host_networks._parse_route_table(sample)
    found = {iface: str(network) for iface, network in parsed}
    check(
        found.get("wlp3s0") == "192.168.31.0/24",
        f"the wifi's own network is read as 192.168.31.0/24 (got {found.get('wlp3s0')})",
    )
    check(
        found.get("tun0") == "192.168.0.0/16",
        f"a tunnel's network is read as 192.168.0.0/16 (got {found.get('tun0')})",
    )
    check(
        "docker0" not in found,
        "a Docker bridge is left out of the machine's own networks",
    )
    check(
        len(parsed) == 2,
        f"the default route and the Docker bridge are both left out (read {len(parsed)} of 2)",
    )


def test_machine_networks():
    print("\n== the machine this is running on ==")
    networks = host_networks.host_networks()
    check(bool(networks), "the machine's networks could be read")
    print(f"        {', '.join(str(n) for n in networks)}")


def test_allocation_avoids_the_machine():
    print("\n== a link never takes the machine's network ==")
    import lab_deploy

    original = lab_deploy.reserved_networks
    original_details = host_networks.host_network_details

    def with_reserved(networks):
        """Plan as if the machine were on the given networks."""

        def reserved(**kwargs):
            return list(networks)

        def details(**kwargs):
            return [
                {"network": str(network), "iface": "wlp3s0"} for network in networks
            ]

        lab_deploy.reserved_networks = reserved
        host_networks.host_network_details = details

    try:
        with_reserved([])
        plan = resolve_plan(topology({"id": "l1", "source": "R1", "target": "R2"}))
        first = plan["links"][0]["subnet"]
        check(
            first == "192.168.0.0/24",
            f"with nothing in the way the first link takes 192.168.0.0/24 (got {first})",
        )

        # Now pretend the machine is on 192.168.0.0/24 -- the default on most
        # home routers -- and plan again.
        clash = ipaddress.ip_network("192.168.0.0/24")
        with_reserved([clash])
        plan = resolve_plan(topology({"id": "l1", "source": "R1", "target": "R2"}))
        chosen = plan["links"][0]["subnet"]
        check(
            chosen != "192.168.0.0/24",
            f"the link moved off the machine's own network (got {chosen})",
        )
        check(
            not ipaddress.ip_network(chosen).overlaps(clash),
            "the chosen subnet does not overlap the machine's network",
        )

        print("\n== a link that was given a clashing address is moved ==")
        plan = resolve_plan(
            topology(
                {
                    "id": "l1",
                    "source": "R1",
                    "target": "R2",
                    "subnet": "192.168.0.0/24",
                    "source_ip": "192.168.0.2",
                    "target_ip": "192.168.0.3",
                }
            )
        )
        chosen = plan["links"][0]["subnet"]
        check(
            chosen != "192.168.0.0/24",
            f"the supplied address was moved off the machine's network (got {chosen})",
        )
        check(
            bool(plan.get("notes")),
            "the move is reported rather than done quietly",
        )
        note = plan["notes"][0] if plan.get("notes") else ""
        check(
            "wlp3s0" in note,
            "the note says which of the machine's networks was in the way",
        )
        if note:
            print(f"        {note}")

        print("\n== a link the machine is using is refused at deploy time ==")
        plan = resolve_plan(
            topology(
                {
                    "id": "l1",
                    "source": "R1",
                    "target": "R2",
                    "subnet": "192.168.0.0/24",
                    "source_ip": "192.168.0.2",
                    "target_ip": "192.168.0.3",
                }
            )
        )
        # Force the plan back onto the clashing network and check the guard
        # that runs just before anything is created.
        plan["links"][0]["subnet"] = "192.168.0.0/24"
        try:
            lab_deploy._check_plan_against_host(plan, [clash])
            check(False, "a plan on the machine's own network is refused")
        except DeployError as exc:
            check(True, f"a plan on the machine's own network is refused ({exc})")
    finally:
        lab_deploy.reserved_networks = original
        host_networks.host_network_details = original_details


def test_class_a_is_cheap():
    print("\n== a Class A link ==")
    before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    started = time.time()
    plan = resolve_plan(
        topology(
            {
                "id": "l1",
                "source": "R1",
                "target": "R2",
                "address_class": "A",
            }
        )
    )
    elapsed = time.time() - started
    after = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    grew_mb = (after - before) / 1024
    link = plan["links"][0]
    check(
        link["subnet"] == "10.0.0.0/8",
        f"a Class A link is 10.0.0.0/8 (got {link['subnet']})",
    )
    check(
        link["source_ip"] == "10.0.0.2" and link["target_ip"] == "10.0.0.3",
        f"its ends are 10.0.0.2 and 10.0.0.3 (got {link['source_ip']} and {link['target_ip']})",
    )
    check(
        elapsed < 1.0,
        f"planning it took {elapsed:.2f}s (listing a /8 once took 4.2s and 1.7GB)",
    )
    check(
        grew_mb < 100,
        f"planning it grew the process by {grew_mb:.0f}MB",
    )


def test_bridge_pools():
    print("\n== the pools Docker is given ==")
    from lab_deploy import _bridge_network

    # A Class C link keeps its whole /24: that is the mask the routers are
    # given, and the canvas shows it.
    pool = _bridge_network("192.168.3.0/24", ["192.168.3.2", "192.168.3.3"])
    check(str(pool) == "192.168.3.0/24", f"a Class C pool is the /24 (got {pool})")

    # A Class A link is given a /29, not the whole /8 -- otherwise the bridge
    # would claim every address in 10/8.
    pool = _bridge_network("10.0.0.0/8", ["10.0.0.2", "10.0.0.3"])
    check(str(pool) == "10.0.0.0/29", f"a Class A pool is a /29 (got {pool})")

    # An endpoint typed far from the gateway still has to fit in the pool.
    pool = _bridge_network("192.168.0.0/24", ["192.168.0.50", "192.168.0.51"])
    check(
        ipaddress.ip_address("192.168.0.50") in pool,
        f"a typed endpoint is inside the pool ({pool})",
    )


# The networks a laptop is actually on when it runs this, and the class of
# link that would collide with each one.
#
#   an Android hotspot            192.168.43.0/24   (Class C)
#   an iPhone hotspot             172.20.10.0/28    (Class B)
#   a home router, most of them   192.168.0.0/24    (Class C)
#   a home router, the rest       192.168.1.0/24    (Class C)
#
# The iPhone one is the interesting case: it is a /28 inside 172.20.0.0/16,
# which is one of the lab's own Class B candidates, and it is *not* one of
# the lab's own subnets -- it is a range inside one. So the allocator has to
# notice the overlap rather than compare addresses.
#
# The third column reserves the candidates that come *before* the colliding
# one, so the allocator is forced to walk as far as the collision instead of
# stopping at the first free candidate.
MACHINES = (
    ("an Android hotspot", "192.168.43.0/24", "C", ()),
    (
        "an iPhone hotspot",
        "172.20.10.0/28",
        "B",
        ("172.16.0.0/16", "172.18.0.0/16", "172.19.0.0/16"),
    ),
    ("a home router on 192.168.0.0/24", "192.168.0.0/24", "C", ()),
    ("a home router on 192.168.1.0/24", "192.168.1.0/24", "C", ()),
)


def test_real_machines():
    print("\n== the machines this has to work on ==")
    import lab_deploy

    original = lab_deploy.reserved_networks
    original_details = host_networks.host_network_details

    try:
        for label, network, address_class, before in MACHINES:
            clash = ipaddress.ip_network(network)
            reserved = [ipaddress.ip_network(text) for text in (*before, network)]

            def reserved_list(networks=reserved, **kwargs):
                return list(networks)

            def details(networks=reserved, **kwargs):
                return [{"network": str(n), "iface": "wlan0"} for n in networks]

            lab_deploy.reserved_networks = reserved_list
            host_networks.host_network_details = details

            plan = resolve_plan(
                topology(
                    {
                        "id": "l1",
                        "source": "R1",
                        "target": "R2",
                        "address_class": address_class,
                    }
                )
            )
            link = plan["links"][0]
            pool = lab_deploy._bridge_network(
                link["subnet"], [link["source_ip"], link["target_ip"]]
            )

            # The pool is the invariant, not the subnet. Docker is given the
            # pool, and the pool is what becomes a route on the host -- so the
            # pool is what has to keep off the machine's network. A Class A
            # link's own subnet is a whole /8 and a Class B link's is a whole
            # /16, so those legitimately contain networks the machine is on;
            # what matters is that the /29 Docker is actually given does not.
            check(
                not pool.overlaps(clash),
                f"{label}: the lab's pool {pool} keeps off {clash}",
            )

            # And the addresses the routers are given must be inside that
            # pool, or the route would not cover them.
            check(
                all(
                    ipaddress.ip_address(address) in pool
                    for address in (link["source_ip"], link["target_ip"])
                ),
                f"{label}: the link's own addresses are inside the pool {pool}",
            )
    finally:
        lab_deploy.reserved_networks = original
        host_networks.host_network_details = original_details


def test_fallback_lans():
    print("\n== when the machine's own table cannot be read ==")
    # The LANs almost every network is on, used when the routing table cannot
    # be read at all. Guessing wrong costs the lab a subnet; not guessing
    # costs the machine its wifi.
    for network in host_networks._FALLBACK_LANS:
        check(
            any(ipaddress.ip_network(network).overlaps(ipaddress.ip_network(other))
                for other in host_networks._FALLBACK_LANS),
            f"the fallback list holds {network}",
        )
    check(
        "192.168.0.0/24" in host_networks._FALLBACK_LANS
        and "192.168.1.0/24" in host_networks._FALLBACK_LANS,
        "the two commonest home-router networks are in the fallback list",
    )
    check(
        "192.168.43.0/24" in host_networks._FALLBACK_LANS
        and "172.20.10.0/28" in host_networks._FALLBACK_LANS,
        "both phone hotspots are in the fallback list",
    )


def test_doctor():
    print("\n== the doctor that repairs a machine that is already broken ==")
    # The doctor's second job: the lease. A question mark on the wifi icon
    # means the machine is associated with the access point and has no
    # address, because the DHCP request that failed while the bad route was
    # in place has to be made again. The doctor has to be able to tell those
    # two states apart, or it will claim a machine is fine when it is not.

    # An interface that holds an address is a working connection.
    iface = lab_doctor._wireless_interface()
    if not iface:
        print("  skip  no wireless interface on this machine")
        return
    check(
        lab_doctor._interface_has_address(iface),
        f"the live interface {iface} reports whether it holds an address",
    )

    # An interface that does not exist has no address, and must not be
    # mistaken for one that does.
    check(
        not lab_doctor._interface_has_address("nonexistent0"),
        "an interface that is not there does not claim to hold an address",
    )

    # The doctor's own network test must find the lab's networks and leave
    # everybody else's alone. The app stack is a different compose project,
    # and a name match on "netrouteai" would take the network the running UI
    # depends on with it.
    check(
        not lab_doctor._is_lab_network(_FakeNetwork("netrouteai-app_default", "netrouteai-app")),
        "the application stack's network is not the lab's",
    )
    check(
        lab_doctor._is_lab_network(_FakeNetwork("netrouteai_n07", "netrouteai")),
        "a lab network is the lab's",
    )
    check(
        lab_doctor._is_lab_network(_FakeNetwork("netrouteai_n07", "")),
        "a lab network made by an older version, with no label, is still caught",
    )
    check(
        not lab_doctor._is_lab_network(_FakeNetwork("br-1234", "")),
        "Docker's own default bridge is not the lab's to remove",
    )


class _FakeNetwork:
    """Just enough of a Docker network for the doctor's name tests."""

    def __init__(self, name: str, project: str) -> None:
        self.name = name
        self.attrs = {"Labels": {"com.docker.compose.project": project} if project else {}}


def main() -> int:
    print("=" * 68)
    print("Host network safety")
    print("=" * 68)
    test_route_parsing()
    test_machine_networks()
    test_allocation_avoids_the_machine()
    test_class_a_is_cheap()
    test_bridge_pools()
    test_real_machines()
    test_fallback_lans()
    test_doctor()

    print("\n" + "=" * 68)
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
