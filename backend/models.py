from typing import Any, Optional
from pydantic import BaseModel, Field


class Device(BaseModel):
    id: str
    type: str
    name: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    ip_address: Optional[str] = None
    gateway: Optional[str] = None


class Link(BaseModel):
    source: str
    target: str
    source_ip: Optional[str] = None
    source_subnet: Optional[str] = None
    target_ip: Optional[str] = None
    target_subnet: Optional[str] = None
    cost: Optional[int] = 1
    # Bandwidth, latency and loss default to None, which means *unknown*.
    # They used to default to 100 Mbps / 10 ms / 1%, so a link drawn on the
    # canvas -- which carries a cost and nothing else -- arrived wearing three
    # invented figures, and every metric derived from it repeated them. An
    # unknown value stays unknown until something measures it.
    bandwidth: Optional[float] = None
    latency: Optional[float] = None
    loss_probability: Optional[float] = None


class Topology(BaseModel):
    devices: list[Device]
    links: list[Link]
    auto_ip: bool = True


class UploadTopologyRequest(BaseModel):
    topology: Topology


class UploadTopologyResponse(BaseModel):
    status: str
    topology_id: str
    validation: dict


class RouteRecommendationRequest(BaseModel):
    topology_id: str
    source: str
    destination: str


class RouteRecommendationResponse(BaseModel):
    algorithm: str
    best_route: list[str]
    #: End-to-end latency in ms, measured by real ICMP echo requests against the
    #: running lab. None when there is no lab to measure -- never a modelled
    #: per-hop sum presented as an observation.
    latency: Optional[float] = None
    confidence: int
    hop_count: int
    total_cost: int
    metrics: dict
    path: list[str] = []
    model: str = "RandomForestClassifier"
    quality_score: float = 0.0
    path_ranking: list[dict] = []
    #: What the numbers above are derived from. "live lab" means every figure
    #: came from a command run inside a container; "canvas topology" means only
    #: the drawn graph was available and nothing was measured.
    measurement_basis: str = "canvas topology"
    measurement_note: str = ""
    #: Which rows the Random Forest was fitted on.
    training_basis: str = "unknown"
    #: How far ahead of the runner-up the recommended path is.
    margin: float = 0.0
    #: The raw measurement behind the figures above, including the command that
    #: produced them. None when nothing was measured.
    measured: Optional[dict] = None


# --------------------------------------------------------------------------- #
# Live lab request models
# --------------------------------------------------------------------------- #
class MeasureRequest(BaseModel):
    source: str
    destination: str
    count: int = 5
    skip_traceroute: bool = False
    duration: float = 2.0


class RawPingRequest(BaseModel):
    """Ping an arbitrary IP from a lab router's container.

    `device` names a lab device (so the CLI's own router can be the source) and
    `target` is a literal address. This exists because the designer's CLI used to
    print a fabricated `!!!!!` / "Success rate is 100 percent (5/5)" pair for
    every target, which was both invented and self-contradictory.
    """

    device: str
    target: str
    count: int = Field(default=5, ge=1, le=20)


class LiveAnalyticsRequest(BaseModel):
    source: str = "R1"
    destination: str = "R11"
    include_convergence: bool = False
    max_pairs: int = 12
    method: str = "ospf"
    # How many ICMP echo requests to send between the endpoints. The loss
    # percentage is only meaningful above a handful: 6 packets cannot resolve
    # 1%, and 6 is what the endpoint used to send unconditionally. Capped
    # because each packet is a real `ping` inside a container and the call
    # blocks on all of them.
    packet_count: int = Field(default=12, ge=1, le=50)


class RouteSteerRequest(BaseModel):
    """Install or remove the static route that puts a chosen path in effect."""

    source: str
    destination: str
    method: str = "ai"
    apply: bool = True


class DeployRequest(BaseModel):
    """Build the measurable lab from the topology drawn in the designer.

    `routers` and `links` mirror the canvas verbatim. Addresses, OSPF costs and
    areas the designer already holds are sent as-is so the running lab uses the
    same values the UI shows; anything left blank is filled in by the backend
    and returned for the designer to adopt.
    """

    topology: dict[str, Any]
    wait_seconds: float = 90.0


class TrafficRequest(BaseModel):
    """Start or stop continuous background traffic in a lab device."""

    device: str
    #: Ping spacing in seconds. 0.2 is the floor: ping drops privileges and
    #: cannot use a shorter interval without CAP_NET_RAW.
    interval: float = 0.2
    running: bool = True


class OspfAreaRequest(BaseModel):
    """Preview or apply an OSPF interface area change on a live router.

    `preview` must be sent first. Applying without it is refused rather than
    defaulted, so the caller cannot black-hole the backbone by skipping the
    blast-radius report -- moving an interface between areas re-floods summary
    LSAs and can drop currently-reachable pairs.
    """

    device: str
    interface: str
    #: Target area. Accepts `2`, `2.0.0.0` or `0.0.0.2`. Area 0 is the backbone
    #: and is rejected by the backend, not merely hidden in the UI.
    area: str
    preview: bool = False


class ImpairRequest(BaseModel):
    device: str
    interface: str = "eth0"
    delay: Optional[float] = None       # ms
    loss: Optional[float] = None        # %
    jitter: Optional[float] = None      # ms
    corrupt: Optional[float] = None     # %
    duplicate: Optional[float] = None   # %
    reorder: Optional[float] = None     # %
    bandwidth: Optional[float] = None   # mbit (tbf)
    clear: bool = False


class LinkStateRequest(BaseModel):
    device: str
    interface: str = "eth0"
    up: bool = True


class ConvergenceRequest(BaseModel):
    source: str
    destination: str
    container: str
    interface: str = "eth0"
    timeout: float = 60.0
