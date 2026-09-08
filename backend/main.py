from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from deploy_service import deploy_topology
from docker_service import get_routers, get_links
from models import Topology

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "NetRouteAI Backend Running"}

@app.get("/routers")
def routers():
    return get_routers()

@app.get("/links")
def links():
    return get_links()
CURRENT_TOPOLOGY = {}

@app.post("/topology")
def create_topology(topology: Topology):
    global CURRENT_TOPOLOGY
    CURRENT_TOPOLOGY = topology.model_dump()
    return {"status": "saved"}

@app.get("/topology")
def get_topology():
    return CURRENT_TOPOLOGY

@app.post("/validate")
def validate(topology: Topology):
    return {
        "valid": True,
        "errors": []
    }

@app.post("/deploy")
def deploy(topology: Topology):
    return deploy_topology(topology.model_dump())
