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
def get_links():
    links = []

    for network in client.networks.list():
        network.reload()   # Refresh network details

        containers = network.attrs.get("Containers", {})

        if len(containers) < 2:
            continue

        names = []

        for cid in containers:
            try:
                names.append(client.containers.get(cid).name)
            except:
                pass

        # Create a link between every pair of containers
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                links.append({
                    "source": names[i],
                    "target": names[j],
                    "network": network.name
                })

    return links