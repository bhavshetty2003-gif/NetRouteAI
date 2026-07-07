#!/usr/bin/env python3

from mininet.net import Containernet
from mininet.node import Docker, OVSKernelSwitch
from mininet.link import TCLink
from mininet.cli import CLI


class NetRouteTopology:

    def __init__(self):
        self.net = Containernet(
            controller=None,
            link=TCLink
        )

    def create(self):

        BASE_DIR = "/home/bhavesh-shetty/NetRouteAI/network"

        print("*** Creating Hosts")

        self.h1 = self.net.addHost(
            "h1",
            ip="10.0.1.10/24"
        )

        self.h2 = self.net.addHost(
            "h2",
            ip="10.0.2.10/24"
        )

        print("*** Creating Routers")

        self.r1 = self.net.addDocker(
            "r1",
            dimage="frrouting/frr:latest",
            ip=None,
            cap_add=[
                "NET_ADMIN",
                "NET_RAW",
                "SYS_ADMIN"
            ],
            volumes=[
                f"{BASE_DIR}/routers/r1:/etc/frr"
            ]
        )

        self.r2 = self.net.addDocker(
            "r2",
            dimage="frrouting/frr:latest",
            ip=None,
            cap_add=[
                "NET_ADMIN",
                "NET_RAW",
                "SYS_ADMIN"
            ],
            volumes=[
                f"{BASE_DIR}/routers/r2:/etc/frr"
            ]
        )

        print("*** Creating Switches")

        self.s1 = self.net.addSwitch(
            "s1",
            cls=OVSKernelSwitch
        )

        self.s2 = self.net.addSwitch(
            "s2",
            cls=OVSKernelSwitch
        )

        print("*** Creating Links")

        self.net.addLink(self.h1, self.s1)
        self.net.addLink(self.s1, self.r1)

        self.net.addLink(
            self.r1,
            self.r2,
            cls=TCLink,
            bw=100,
            delay="2ms",
            loss=0
        )

        self.net.addLink(self.r2, self.s2)
        self.net.addLink(self.s2, self.h2)

    def start(self):

        print("*** Starting Network")
        self.net.start()
        self.s1.cmd("ovs-ofctl add-flow s1 actions=normal")
        self.s2.cmd("ovs-ofctl add-flow s2 actions=normal")
        print("*** Starting FRR")

        self.r1.cmd("/usr/lib/frr/docker-start &")
        self.r2.cmd("/usr/lib/frr/docker-start &")

        self.r1.cmd("sysctl -w net.ipv4.ip_forward=1")
        self.r2.cmd("sysctl -w net.ipv4.ip_forward=1")

        # Bring interfaces up
        self.r1.cmd("ip link set r1-eth0 up")
        self.r1.cmd("ip link set r1-eth1 up")
        self.r2.cmd("ip link set r2-eth0 up")
        self.r2.cmd("ip link set r2-eth1 up")

        # Router IPs
        self.r1.cmd("ip addr add 10.0.1.1/24 dev r1-eth0")
        self.r1.cmd("ip addr add 192.168.12.1/30 dev r1-eth1")

        self.r2.cmd("ip addr add 192.168.12.2/30 dev r2-eth0")
        self.r2.cmd("ip addr add 10.0.2.1/24 dev r2-eth1")

        # Host routes
        self.h1.cmd("ip route add default via 10.0.1.1")
        self.h2.cmd("ip route add default via 10.0.2.1")

        print("*** Network Ready")

    def cli(self):
        CLI(self.net)

    def stop(self):
        self.net.stop()


if __name__ == "__main__":
    topo = NetRouteTopology()
    topo.create()
    topo.start()
    topo.cli()
    topo.stop()
