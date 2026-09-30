from typing import Optional
from pydantic import BaseModel


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
    bandwidth: Optional[int] = 100
    latency: Optional[int] = 10
    loss_probability: Optional[float] = 0.01


class Topology(BaseModel):
    devices: list[Device]
    links: list[Link]
    auto_ip: bool = True


class TopologyCreateRequest(BaseModel):
    topology: Topology


class TopologyCreateResponse(BaseModel):
    status: str
    topology_id: str
    validation: dict


class RoutingRequest(BaseModel):
    topology_id: str
    source: str
    destination: str


class RoutingResponse(BaseModel):
    algorithm: str
    path: list[str]
    hop_count: int
    total_cost: int
    routing_table: dict
    frr_config: str
    metrics: dict


class SimulationRequest(BaseModel):
    topology_id: str
    source: str
    destination: str
    packet_count: int = 100
    packet_size: int = 1024
    algorithm: str = "dijkstra"


class SimulationResponse(BaseModel):
    simulation_id: str
    packets_sent: int
    packets_received: int
    packet_loss_count: int
    simulation_trace: list[dict]


class AnalyticsCompareRequest(BaseModel):
    topology_id: str
    source: str
    destination: str


class AnalyticsCompareResponse(BaseModel):
    comparison: dict


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
    latency: float
    confidence: int
    hop_count: int
    total_cost: int
    metrics: dict
    path: list[str] = []
    frr_config: str = ""
    model: str = "RandomForestClassifier"
    quality_score: float = 0.0
    path_ranking: list[dict] = []


# --------------------------------------------------------------------------- #
# Live lab request models
# --------------------------------------------------------------------------- #
class MeasureRequest(BaseModel):
    source: str
    destination: str
    count: int = 5
    skip_traceroute: bool = False
    duration: float = 2.0


class LiveAnalyticsRequest(BaseModel):
    source: str = "R1"
    destination: str = "R11"
    include_convergence: bool = False
    max_pairs: int = 12
    method: str = "ospf"


class RouteSteerRequest(BaseModel):
    """Install or remove the static route that puts a chosen path in effect."""

    source: str
    destination: str
    method: str = "ai"
    apply: bool = True


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
