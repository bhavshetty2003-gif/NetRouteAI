import subprocess

from generator import generate_docker_compose
from ip_generator import generate_ip_addresses
from frr_generator import generate_frr_configs


def deploy_topology(topology):
    # topology is already a dictionary
    topology_dict = topology

    # Generate IP addresses
    ip_map = generate_ip_addresses(topology_dict)

    # Generate FRR configuration
    generate_frr_configs(topology_dict, ip_map)

    # Generate Docker Compose file
    generate_docker_compose(topology_dict, ip_map)

    # Start Docker containers
    subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            "generated/docker-compose.yml",
            "up",
            "-d"
        ],
        check=True
    )

    return {
        "status": "Deployment successful"
    }