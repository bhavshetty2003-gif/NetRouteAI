#!/usr/bin/env python3

import os 

from mininet.net import Containernet
from mininet.node import Docker, OVSKernelSwitch
from mininet.cli import CLI
from mininet.link import TCLink


net = Containernet(
    controller=None,
    link=TCLink
)

BASE_DIR = "/home/bhavesh-shetty/NetRouteAI/network"

print("*** Adding Hosts")
h1 = net.addHost("h1", ip="10.0.1.10/24")
h2 = net.addHost("h2", ip="10.0.2.10/24")

print("*** Adding FRR Routers")

r1 = net.addDocker(
    "r1",
    ip=None,
    dimage="frrouting/frr:latest",
   volumes=[
    f"{BASE_DIR}/routers/r1:/etc/frr"
],
    privileged=True
)

r2 = net.addDocker(
    "r2",
    ip=None,
    dimage="frrouting/frr:latest",
    volumes=[
    f"{BASE_DIR}/routers/r2:/etc/frr"
],
    privileged=True
)
print("*** Adding Switches")

s1 = net.addSwitch("s1", cls=OVSKernelSwitch)
s2 = net.addSwitch("s2", cls=OVSKernelSwitch)
print("*** Creating Links")

net.addLink(h1, s1)
net.addLink(s1, r1)

net.addLink(r1, r2)

net.addLink(r2, s2)
net.addLink(s2, h2)
print("*** Starting Network")

net.start()
print("*** Starting FRR")

r1.cmd("/usr/lib/frr/docker-start &")
r2.cmd("/usr/lib/frr/docker-start &")
print("*** Configuring Router Interfaces")
r1.cmd("sysctl -w net.ipv4.ip_forward=1")
r2.cmd("sysctl -w net.ipv4.ip_forward=1")

# r1
r1.cmd("ip addr add 10.0.1.1/24 dev r1-eth0")
r1.cmd("ip addr add 192.168.12.1/30 dev r1-eth1")

# r2
r2.cmd("ip addr add 192.168.12.2/30 dev r2-eth0")
r2.cmd("ip addr add 10.0.2.1/24 dev r2-eth1")
print("*** Configuring Host Routes")

r1.cmd("ip link set r1-eth0 up")
r1.cmd("ip link set r1-eth1 up")

r2.cmd("ip link set r2-eth0 up")
r2.cmd("ip link set r2-eth1 up")

h1.cmd("ip route add default via 10.0.1.1")
h2.cmd("ip route add default via 10.0.2.1")
print("*** Network Ready")

CLI(net)

net.stop()
