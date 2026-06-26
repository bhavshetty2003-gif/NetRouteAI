from mininet.net import Mininet
from mininet.topo import Topo
from mininet.node import OVSKernelSwitch
from mininet.cli import CLI

class SimpleTopo(Topo):
    def build(self):
        h1 = self.addHost('h1', ip='10.0.0.1/24')
        h2 = self.addHost('h2', ip='10.0.0.2/24')

        s1 = self.addSwitch('s1')

        self.addLink(h1, s1)
        self.addLink(h2, s1)

topo = SimpleTopo()

net = Mininet(
    topo=topo,
    switch=OVSKernelSwitch,
    controller=None
)

net.start()

print("Network Started Successfully!")

CLI(net)

net.stop()
