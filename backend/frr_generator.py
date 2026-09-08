import os


def generate_frr_configs(topology, ip_map):
    """
    Generates FRR configuration for every router.
    """

    os.makedirs("generated", exist_ok=True)

    for device in topology["devices"]:

        if device["type"] != "router":
            continue

        router = device["id"]
        router_dir = f"generated/{router}"

        os.makedirs(router_dir, exist_ok=True)

        ##################################################
        # frr.conf
        ##################################################

        config = []

        config.append("frr version 8.4")
        config.append("frr defaults traditional")
        config.append(f"hostname {router}")
        config.append("service integrated-vtysh-config")
        config.append("!")

        interface_number = 0

        for _, ip in ip_map[router].items():

            config.append(f"interface eth{interface_number}")
            config.append(f" ip address {ip}")
            config.append("!")
            interface_number += 1

        config.append("router ospf")

        for ip in ip_map[router].values():
            config.append(f" network {ip.split('/')[0]}/32 area 0")

        config.append("!")
        config.append("line vty")
        config.append("!")

        with open(f"{router_dir}/frr.conf", "w") as f:
            f.write("\n".join(config))

        ##################################################
        # daemons
        ##################################################

        daemons = """
zebra=yes
bgpd=no
ospfd=yes
ospf6d=no
ripd=no
ripngd=no
isisd=no
pimd=no
ldpd=no
nhrpd=no
eigrpd=no
babeld=no
sharpd=no
staticd=yes
pbrd=no
bfdd=no
fabricd=no
vrrpd=no
pathd=no
"""

        with open(f"{router_dir}/daemons", "w") as f:
            f.write(daemons.strip() + "\n")

        ##################################################
        # vtysh.conf
        ##################################################

        with open(f"{router_dir}/vtysh.conf", "w") as f:
            f.write("service integrated-vtysh-config\n")

    print("FRR configs generated.")