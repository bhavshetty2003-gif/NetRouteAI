from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class Device(BaseModel):
    # `allow_inf_nan=False` rejects a coordinate that is NaN or infinite.
    # Python's json module accepts both, so a client could send `x: NaN` and
    # have it sail through validation into the layout maths, where it poisons
    # every coordinate computed from it.
    model_config = ConfigDict(allow_inf_nan=False)

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
    #: OSPF cost. Bounded because the cost is written into the routers' config
    #: and is used as a graph weight: a negative or absurd cost produced a
    #: nonsense shortest path rather than an error.
    cost: Optional[int] = Field(default=1, ge=1, le=65535)
    # Bandwidth, latency and loss default to None, which means *unknown*.
    # They used to default to 100 Mbps / 10 ms / 1%, so a link drawn on the
    # canvas -- which carries a cost and nothing else -- arrived wearing three
    # invented figures, and every metric derived from it repeated them. An
    # unknown value stays unknown until something measures it.
    bandwidth: Optional[float] = Field(default=None, gt=0, le=100000)
    latency: Optional[float] = Field(default=None, ge=0, le=600000)
    loss_probability: Optional[float] = Field(default=None, ge=0, le=100)


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
    #: ICMP echo requests to send. Bounded: each one is a real `ping` inside a
    #: container and the call blocks on all of them.
    count: int = Field(default=5, ge=1, le=50)
    skip_traceroute: bool = False
    #: Throughput sample window in seconds.
    duration: float = Field(default=2.0, ge=0.2, le=30.0)


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
    max_pairs: int = Field(default=12, ge=1, le=200)
    method: str = "ospf"
    # How many ICMP echo requests to send between the endpoints. The loss
    # percentage is only meaningful above a handful: 6 packets cannot resolve
    # 1%, and 6 is what the endpoint used to send unconditionally. Capped
    # because each packet is a real `ping` inside a container and the call
    # blocks on all of them.
    packet_count: int = Field(default=12, ge=1, le=50)
    # `include_convergence` used to be a flag on this request, which made every
    # measurement that asked for it take a link down and wait up to 60 seconds
    # for OSPF to re-converge -- so one slow, destructive figure held up the
    # whole comparison. Convergence is now its own endpoint and its own button
    # on the page, because it changes the network while it measures it. The
    # field is still accepted so an older client does not get a 422; it is
    # simply not acted on.
    include_convergence: bool = False


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
    #: How long to wait for the routers to converge before verifying. Bounded
    #: so a request cannot hold a deployment open indefinitely.
    wait_seconds: float = Field(default=90.0, ge=0.0, le=600.0)


class TrafficRequest(BaseModel):
    """Start or stop continuous background traffic in a lab device."""

    device: str
    #: Ping spacing in seconds. 0.2 is the floor: ping drops privileges and
    #: cannot use a shorter interval without CAP_NET_RAW.
    interval: float = Field(default=0.2, ge=0.2, le=60.0)
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
    # Percentages are 0-100, delays and jitter are milliseconds, and the tbf
    # rate is mbit. The bounds are the kernel's own: netem rejects a loss or
    # corruption percentage above 100, and a negative delay is meaningless.
    delay: Optional[float] = Field(default=None, ge=0, le=60000)       # ms
    loss: Optional[float] = Field(default=None, ge=0, le=100)          # %
    jitter: Optional[float] = Field(default=None, ge=0, le=60000)      # ms
    corrupt: Optional[float] = Field(default=None, ge=0, le=100)       # %
    duplicate: Optional[float] = Field(default=None, ge=0, le=100)     # %
    reorder: Optional[float] = Field(default=None, ge=0, le=100)       # %
    bandwidth: Optional[float] = Field(default=None, gt=0, le=100000)  # mbit (tbf)
    clear: bool = False


class LinkStateRequest(BaseModel):
    device: str
    interface: str = "eth0"
    up: bool = True


class ConvergenceRequest(BaseModel):
    source: str
    destination: str
    # Which link to break. Left optional so the caller does not have to know
    # the topology: the endpoint picks the first transit interface on the
    # path between the two routers, which is the link whose failure the
    # convergence figure is about.
    container: str | None = None
    interface: str | None = None
    #: How long to wait for OSPF to re-converge, in seconds. Bounded because
    #: the endpoint holds a link *down* for this long.
    timeout: float = Field(default=60.0, ge=5.0, le=300.0)
