from mininet.net import Mininet
from mininet.node import OVSBridge
from mininet.cli import CLI

net = Mininet(switch=OVSBridge)

# Routers
r1 = net.addHost('r1')
r2 = net.addHost('r2')
r3 = net.addHost('r3')
r4 = net.addHost('r4')
r5 = net.addHost('r5')
r6 = net.addHost('r6')
r7 = net.addHost('r7')
r8 = net.addHost('r8')

# Switches
sw1 = net.addSwitch('sw1')
sw2 = net.addSwitch('sw2')
sw3 = net.addSwitch('sw3')
sw4 = net.addSwitch('sw4')

# PCs
pc1 = net.addHost('pc1', ip='192.168.10.11/24', defaultRoute='via 192.168.10.1')
pc2 = net.addHost('pc2', ip='192.168.10.12/24', defaultRoute='via 192.168.10.1')

pc3 = net.addHost('pc3', ip='192.168.20.11/24', defaultRoute='via 192.168.20.1')
pc4 = net.addHost('pc4', ip='192.168.20.12/24', defaultRoute='via 192.168.20.1')

pc5 = net.addHost('pc5', ip='192.168.30.11/24', defaultRoute='via 192.168.30.1')
pc6 = net.addHost('pc6', ip='192.168.30.12/24', defaultRoute='via 192.168.30.1')

pc7 = net.addHost('pc7', ip='192.168.40.11/24', defaultRoute='via 192.168.40.1')

# PC to switch
net.addLink(pc1, sw1)
net.addLink(pc2, sw1)

net.addLink(pc3, sw2)
net.addLink(pc4, sw2)

net.addLink(pc5, sw3)
net.addLink(pc6, sw3)

net.addLink(pc7, sw4)

# Switch to routers
net.addLink(sw1, r5)
net.addLink(sw2, r6)
net.addLink(sw3, r7)
net.addLink(sw4, r8)

# Core links
net.addLink(r1, r2)
net.addLink(r1, r3)
net.addLink(r1, r4)
net.addLink(r2, r3)
net.addLink(r3, r4)

# Branch links
net.addLink(r2, r5)
net.addLink(r3, r6)
net.addLink(r3, r7)
net.addLink(r4, r8)

net.start()

# Enable IP forwarding
routers = [r1,r2,r3,r4,r5,r6,r7,r8]
for r in routers:
    r.cmd('sysctl -w net.ipv4.ip_forward=1')

print('Big network started')
CLI(net)
net.stop()