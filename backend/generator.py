import os
import yaml
from ipaddress import ip_interface


def generate_docker_compose(topology, ip_map):
    """
    Generates docker-compose.yml for the network topology.
    """

    compose = {
        "services": {},
        "networks": {}
    }

    # -----------------------------------
    # STEP 1: Create Docker services
    # -----------------------------------
    for device in topology["devices"]:

        if device["type"] == "router":

            compose["services"][device["id"]] = {
                "image": "frrouting/frr:latest",
                "container_name": device["id"],
                "privileged": True,
                "command": "/usr/lib/frr/docker-start",
                "volumes": [
                    f"./{device['id']}:/etc/frr"
                ],
                "networks": {}
            }

        else:

            compose["services"][device["id"]] = {
                "image": "alpine",
                "container_name": device["id"],
                "command": "sleep infinity",
                "networks": {}
            }

    # -----------------------------------
    # STEP 2: Create Docker networks
    # -----------------------------------
    network_number = 1

    for link in topology["links"]:

        network_name = f"net{network_number}"

        source_ip = ip_map[link["source"]][network_name]
        target_ip = ip_map[link["target"]][network_name]

        subnet = str(ip_interface(source_ip).network)

        compose["networks"][network_name] = {
            "driver": "bridge",
            "ipam": {
                "config": [
                    {
                        "subnet": subnet
                    }
                ]
            }
        }

        compose["services"][link["source"]]["networks"][network_name] = {
            "ipv4_address": source_ip.split("/")[0]
        }

        compose["services"][link["target"]]["networks"][network_name] = {
            "ipv4_address": target_ip.split("/")[0]
        }

        network_number += 1

    # -----------------------------------
    # STEP 3: Save docker-compose.yml
    # -----------------------------------
    os.makedirs("generated", exist_ok=True)

    with open("generated/docker-compose.yml", "w") as file:
        yaml.dump(compose, file, sort_keys=False)

    print("Docker Compose generated.")