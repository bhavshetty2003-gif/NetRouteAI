"""Continuous background traffic inside the lab, so counters actually move.

Why this exists
---------------
Every "live matrix" on the analytics page is read from real interface counters
(`/proc/net/dev` via `ip -s link`). On an idle lab those counters are static:
byte totals sit still, qdisc drops stay at 0, and the page looks broken even
though it is reporting the truth. The fix is not to invent numbers, it is to
put real packets on the wire so the counters have something to count.

The generator is a `ping` loop inside a lab container, started detached. That
is the only stimulus guaranteed to exist in every lab image -- `iperf3` and
`ethtool` are absent from both the alpine and frr images -- so throughput
figures stay derived from byte-counter deltas rather than from a tool that
would need installing per image.

Two honesty constraints shape the API:

* A running generator is reported, not hidden. The UI shows that traffic is
  flowing and over which links, because a counter that only moves while a
  generator runs is a measurement condition, not a property of the network.
* Nothing is written to disk or to `frr.conf`, so the generator disappears on
  container restart. That is the right default for a lab control: it cannot
  leave a router in a steered state behind it.
"""

from __future__ import annotations

import threading
import time
from typing import Any

from metrics_collector import LabUnavailable, _container, _exec


class _Generator:
    """One detached ping loop in a lab container."""

    def __init__(self, device: str, container: str, targets: list[str], interval: float):
        self.device = device
        self.container = container
        self.targets = targets
        self.interval = interval
        self.started_at = time.time()
        self.pids: list[int] = []
        self.stopped = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "device": self.device,
            "container": self.container,
            "targets": self.targets,
            "interval_seconds": self.interval,
            "started_at": self.started_at,
            "running_seconds": round(time.time() - self.started_at, 1),
            "pids": self.pids,
            "running": not self.stopped,
        }


# One generator per source device. A dict keyed by device keeps "start" from
# stacking duplicate ping loops on the same router, which would inflate the
# counters without adding information.
_generators: dict[str, _Generator] = {}
_lock = threading.Lock()


def _targets_from_lab(lab: dict[str, Any], device: str) -> list[str]:
    """Addresses this device is adjacent to.

    Adjacency is the constraint that matters: a ping to a remote host still
    increments the local counters, but it exercises a different set of links
    than the ones the analytics page is reporting on, so the deltas would not
    line up with the displayed path.
    """
    peers: list[str] = []
    for link in lab["links"]:
        if link["source"] == device and link.get("kind") == "transit":
            target = link["target"]
        elif link["target"] == device and link.get("kind") == "transit":
            target = link["source"]
        else:
            continue
        address = lab["ip_index"].get(target)
        if address and address not in peers:
            peers.append(address)
    return peers


def start(client, lab: dict[str, Any], device: str, interval: float = 0.2) -> dict[str, Any]:
    """Begin continuous traffic from `device` towards its transit neighbours.

    `interval` is the ping spacing in seconds. 0.2s is the smallest value a
    non-root container may use, since ping drops privileges and cannot set
    intervals below 200ms without CAP_NET_RAW.
    """
    name = device.upper()
    container_name = lab["container_map"].get(name)
    if not container_name:
        raise LabUnavailable(f"'{device}' is not in the running lab")

    targets = _targets_from_lab(lab, name)
    if not targets:
        raise LabUnavailable(
            f"{name} has no directly connected transit neighbour to send traffic to"
        )

    interval = max(0.2, float(interval))

    with _lock:
        existing = _generators.get(name)
        if existing and not existing.stopped:
            # Already running: adjust the rate rather than stacking a second
            # loop, which would double the offered load and mislead the reader.
            _replace(existing, client, container_name, targets, interval)
            return {
                "ok": True,
                "already_running": True,
                "generator": existing.as_dict(),
                "message": (
                    f"Traffic from {name} was already running; retimed to one ping "
                    f"every {interval:g}s."
                ),
            }

        generator = _Generator(name, container_name, targets, interval)
        _replace(generator, client, container_name, targets, interval)
        _generators[name] = generator
        return {
            "ok": True,
            "already_running": False,
            "generator": generator.as_dict(),
            "message": (
                f"{name} is now sending a ping every {interval:g}s to "
                f"{', '.join(targets)}. Interface counters on the traversed links "
                "will advance while it runs."
            ),
        }


def _replace(
    generator: _Generator,
    client,
    container_name: str,
    targets: list[str],
    interval: float,
) -> None:
    """(Re)start the detached ping loop for a generator."""
    container = _container(client, container_name)
    generator.targets = targets
    generator.interval = interval

    # Re-timing an already-running generator replaces its loops. The old PIDs
    # must die first: they are no longer tracked once `generator.pids` is
    # reassigned below, so leaving them alive would double the offered load on
    # the same links while the UI reported a single generator. Orphan loops are
    # invisible to `stop()` and would run until the container restarted.
    for pid in generator.pids:
        _exec(container, ["kill", str(pid)], timeout=10)
    generator.pids = []

    # Each ping is backgrounded *inside* the container with `&` rather than
    # started via exec_run(detach=True): the detached form returns `None` for
    # exit_code, so there is nothing to confirm the process started with and no
    # PID to stop later. Echoing `$!` gives the real one.
    pids: list[int] = []
    for address in targets:
        try:
            code, out = _exec(
                container,
                [
                    "sh",
                    "-c",
                    f"ping -i {interval} -W 1 {address} >/dev/null 2>&1 & echo $!",
                ],
                timeout=15,
            )
        except Exception:  # noqa: BLE001 - a dead peer must not abort the rest
            continue
        if code != 0:
            continue
        for line in out.split():
            if line.isdigit():
                pids.append(int(line))
                break

    if not pids:
        raise LabUnavailable(
            f"Could not start a ping loop in {container_name}; no neighbour answered"
        )

    # Clean up anything that did start before failing. A partially-started
    # generator that raises would otherwise leave an untracked ping running
    # forever: the caller never receives a PID list, so nothing can stop it, and
    # the counters it inflates are exactly the ones the analytics page reports.
    if len(pids) < len(targets):
        for pid in pids:
            _exec(container, ["kill", str(pid)], timeout=10)
        raise LabUnavailable(
            f"Started only {len(pids)} of {len(targets)} traffic flows in "
            f"{container_name}; the lab is left idle rather than half-loaded."
        )

    generator.pids = pids
    generator.started_at = time.time()
    generator.stopped = False


def stop(client, device: str) -> dict[str, Any]:
    """Stop a running generator, restoring the lab to idle."""
    name = device.upper()
    with _lock:
        generator = _generators.get(name)
        if not generator or generator.stopped:
            return {
                "ok": True,
                "was_running": False,
                "message": f"No traffic generator was running on {name}.",
            }
        _generators.pop(name, None)

    container = _container(client, generator.container)
    killed: list[str] = []
    # The PIDs came from the shell that started the loop, so they can be killed
    # directly. Matching on `ps` output was avoided because a lab image's ps
    # varies (busybox vs procps) and a missed match would leave traffic running
    # with the UI claiming it had stopped.
    for pid in generator.pids:
        _exec(container, ["kill", str(pid)], timeout=10)
        killed.append(str(pid))

    generator.stopped = True
    return {
        "ok": True,
        "was_running": True,
        "killed": killed,
        "message": (
            f"Stopped traffic from {name} ({len(killed)} process(es) killed). "
            "Interface counters will hold their final values and stop advancing."
        ),
    }


def stop_all(client) -> dict[str, Any]:
    """Stop every generator. Used when the lab is re-measured or torn down."""
    stopped = []
    for device in list(_generators):
        try:
            result = stop(client, device)
            if result["was_running"]:
                stopped.append(device)
        except LabUnavailable:
            continue
    return {"ok": True, "stopped": stopped}


def status() -> dict[str, Any]:
    """Which generators are running, so the UI never claims live counters that
    are static because nothing is generating them."""
    with _lock:
        return {"generators": [g.as_dict() for g in _generators.values()]}
