from ipaddress import IPv4Network, ip_interface


def generate_ip_addresses(topology):
    """
    Generates IP addresses for the topology.

    If auto_ip=True:
        Automatically assigns IP addresses.

    If auto_ip=False:
        Uses the IP addresses provided by the user.

    Returns:
    {
        "r1": {
            "net1": "10.0.1.2/29"
        },
        "r2": {
            "net1": "10.0.1.3/29",
            "net2": "10.0.2.2/29"
        }
    }
    """

    if topology.get("auto_ip", True):
        return automatic_ip_map(topology)

    validate_manual_ips(topology)
    return manual_ip_map(topology)


# =====================================================
# Automatic IP Assignment
# =====================================================

def automatic_ip_map(topology):

    ip_map = {}

    # Create an entry for every device
    for device in topology["devices"]:
        ip_map[device["id"]] = {}

    network_number = 1

    for link in topology["links"]:

        network_name = f"net{network_number}"

        # Use /29 subnet (8 addresses)
        subnet = IPv4Network(f"10.0.{network_number}.0/29")

        hosts = list(subnet.hosts())

        # hosts[0] = Docker gateway (10.0.x.1)
        # Start assigning from hosts[1]
        source_ip = f"{hosts[1]}/29"
        target_ip = f"{hosts[2]}/29"

        ip_map[link["source"]][network_name] = source_ip
        ip_map[link["target"]][network_name] = target_ip

        network_number += 1

    return ip_map


# =====================================================
# Manual IP Assignment
# =====================================================

def manual_ip_map(topology):

    ip_map = {}

    for device in topology["devices"]:
        ip_map[device["id"]] = {}

    network_number = 1

    for link in topology["links"]:

        network_name = f"net{network_number}"

        ip_map[link["source"]][network_name] = link["source_ip"]
        ip_map[link["target"]][network_name] = link["target_ip"]

        network_number += 1

    return ip_map


# =====================================================
# Validate Manual IPs
# =====================================================

def validate_manual_ips(topology):

    used_ips = set()

    for link in topology["links"]:

        source_ip = link.get("source_ip")
        target_ip = link.get("target_ip")

        # Check if IPs exist
        if not source_ip or not target_ip:
            raise ValueError(
                f"Missing IPs for {link['source']} <-> {link['target']}"
            )

        # Validate IP format
        try:
            src = ip_interface(source_ip)
            dst = ip_interface(target_ip)
        except ValueError:
            raise ValueError(
                f"Invalid IP format on link {link['source']} <-> {link['target']}"
            )

        # Check duplicate IPs
        if str(src.ip) in used_ips:
            raise ValueError(f"Duplicate IP: {src.ip}")

        if str(dst.ip) in used_ips:
            raise ValueError(f"Duplicate IP: {dst.ip}")

        used_ips.add(str(src.ip))
        used_ips.add(str(dst.ip))

        # Both ends must belong to the same subnet
        if src.network != dst.network:
            raise ValueError(
                f"{link['source']} and {link['target']} are not in the same subnet."
            )

        # Prevent using Docker gateway address
        gateway = list(src.network.hosts())[0]

        if src.ip == gateway or dst.ip == gateway:
            raise ValueError(
                f"Do not use {gateway}. It is reserved as the Docker gateway."
            )