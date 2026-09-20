import subprocess


def run(cmd):
    result = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True
    )
    return result.stdout.strip()


def verify_topology():
    return {
        "containers": run("docker ps"),
        "ospf_neighbors_r1": run('docker exec r1 vtysh -c "show ip ospf neighbor"'),
        "ospf_neighbors_r2": run('docker exec r2 vtysh -c "show ip ospf neighbor"'),
        "routes_r1": run('docker exec r1 vtysh -c "show ip route"'),
        "routes_r2": run('docker exec r2 vtysh -c "show ip route"'),
        "ping": run("docker exec r1 ping -c 3 10.0.1.3")
    }