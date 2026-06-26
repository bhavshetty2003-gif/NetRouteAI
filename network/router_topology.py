from mininet.net import Mininet
from mininet.topo import Topo
from mininet.node import OVSKernelSwitch
from mininet.cli import CLI

class RouterTopo(Topo):
    def build(self):

        h1 = self.addHost('h1', ip='10.0.1.10/24')
        h2 = self.addHost('h2', ip='10.0.2.10/24')

        r1 = self.addHost('r1')
        r2 = self.addHost('r2')

        s1 = self.addSwitch('s1')
        s2 = self.addSwitch('s2')

        self.addLink(h1, s1)
        self.addLink(s1, r1)

        self.addLink(r1, r2)

        self.addLink(r2, s2)
        self.addLink(s2, h2)

topo = RouterTopo()

net = Mininet(
    topo=topo,
    switch=OVSKernelSwitch,
    controller=None
)

net.start()

print("Router topology started!")

CLI(net)

net.stop()