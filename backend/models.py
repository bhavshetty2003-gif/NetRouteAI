from typing import Optional
from pydantic import BaseModel
from typing import Optional


class Device(BaseModel):
    id: str
    type: str

    x: float
    y: float


class Link(BaseModel):
    source: str
    target: str

    cable: str

    source_ip: Optional[str] = None
    target_ip: Optional[str] = None


class Topology(BaseModel):
    devices: list[Device]

    links: list[Link]

    auto_ip: bool = True