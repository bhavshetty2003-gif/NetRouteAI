from mininet.net import Mininet
from mininet.topo import Topo
from mininet.node import Controller
from mininet.cli import CLI

class SimpleTopo(Topo):
    def build(self):
        h1 = self.addHost('h1')
        h2 = self.addHost('h2')

        s1 = self.addSwitch('s1')

        self.addLink(h1, s1)
        self.addLink(h2, s1)

topo = SimpleTopo()

net = Mininet(
    topo=topo,
    controller=Controller
)

net.start()

print("Network Started Successfully!")

CLI(net)

net.stop(
