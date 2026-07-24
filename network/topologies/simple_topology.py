from mininet.net import Mininet
from mininet.node import OVSBridge
from mininet.cli import CLI
from mininet.link import TCLink

net = Mininet(switch=OVSBridge,link=TCLink)



h1 = net.addHost('h1', ip='10.0.0.1/24')
h2 = net.addHost('h2', ip='10.0.0.2/24')

s1 = net.addSwitch('s1')

net.addLink(h1, s1)
net.addLink(h2, s1)

net.start()

print("Testing connectivity...")
net.pingAll()

CLI(net)

net.stop()