import docker

client = docker.from_env()

def get_routers():
    routers = []

    for container in client.containers.list():
        print(container.name)   # Debug

        routers.append({
            "id": container.name,
            "name": container.name,
            "status": container.status
        })

        

    return routers


client = docker.from_env()

def get_links():
    links = []

    for network in client.networks.list():
        containers = network.attrs.get("Containers", {})

        if len(containers) == 2:
            names = []

            for c in containers.values():
                names.append(c["Name"])

            links.append({
                "source": names[0],
                "target": names[1],
                "network": network.name
            })

    return links