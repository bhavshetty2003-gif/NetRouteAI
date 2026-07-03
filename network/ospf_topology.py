#!/usr/bin/env python3

from mininet.net import Mininet
from mininet.topo import Topo
from mininet.node import Node, OVSKernelSwitch
from mininet.cli import CLI

import time


class LinuxRouter(Node):

    def config(self, **params):
        super().config(**params)
        self.cmd("sysctl -w net.ipv4.ip_forward=1")

    def terminate(self):
        self.cmd("sysctl -w net.ipv4.ip_forward=0")
        super().terminate()


class OSPFTopo(Topo):

    def build(self):

        # Hosts
        h1 = self.addHost("h1")
        h2 = self.addHost("h2")

        # Routers
        r1 = self.addNode("r1", cls=LinuxRouter)
        r2 = self.addNode("r2", cls=LinuxRouter)

        # Switches
        s1 = self.addSwitch("s1")
        s2 = self.addSwitch("s2")

        # Links
        self.addLink(h1, s1)
        self.addLink(s1, r1)

        self.addLink(r1, r2)

        self.addLink(r2, s2)
        self.addLink(s2, h2)


topo = OSPFTopo()

net = Mininet(
    topo=topo,
    switch=OVSKernelSwitch,
    controller=None,
    autoSetMacs=True,
    build=True
)

net.start()

# Make OVS behave like a normal learning switch
for sw in net.switches:
    sw.cmd(f"ovs-vsctl set-fail-mode {sw.name} standalone")

# Get nodes
h1 = net.get("h1")
h2 = net.get("h2")
r1 = net.get("r1")
r2 = net.get("r2")

print("Configuring Hosts...")

# Flush old addresses
for node in [h1, h2]:
    node.cmd(f"ip addr flush dev {node.name}-eth0")

# Configure host IPs
h1.cmd("ip addr add 10.0.1.10/24 dev h1-eth0")
h2.cmd("ip addr add 10.0.2.10/24 dev h2-eth0")

h1.cmd("ip link set h1-eth0 up")
h2.cmd("ip link set h2-eth0 up")

print("Configuring Routers...")

# Flush router interfaces
r1.cmd("ip addr flush dev r1-eth0")
r1.cmd("ip addr flush dev r1-eth1")

r2.cmd("ip addr flush dev r2-eth0")
r2.cmd("ip addr flush dev r2-eth1")

# Assign router IPs
r1.cmd("ip addr add 10.0.1.1/24 dev r1-eth0")
r1.cmd("ip addr add 192.168.12.1/30 dev r1-eth1")

r2.cmd("ip addr add 192.168.12.2/30 dev r2-eth0")
r2.cmd("ip addr add 10.0.2.1/24 dev r2-eth1")

# Bring interfaces up
r1.cmd("ip link set r1-eth0 up")
r1.cmd("ip link set r1-eth1 up")

r2.cmd("ip link set r2-eth0 up")
r2.cmd("ip link set r2-eth1 up")

# Default gateways
h1.cmd("ip route add default via 10.0.1.1")
h2.cmd("ip route add default via 10.0.2.1")

print("\n====================================")
print(" NetRouteAI with OSPF Started")
print("====================================\n")

CLI(net)

print("*** Stopping Network")
net.stop()