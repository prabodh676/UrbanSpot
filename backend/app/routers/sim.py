from fastapi import APIRouter
from pydantic import BaseModel
from app.services.simulator import simulator

router = APIRouter(prefix="/api/sim", tags=["simulator"])

class SimStartRequest(BaseModel):
    scenario: str # 'rush_hour', 'event_ends', 'lot_full', 'street_wave'
    speed_multiplier: float = 5.0

@router.post("/start")
async def start_sim(payload: SimStartRequest):
    await simulator.start_scenario(payload.scenario, payload.speed_multiplier)
    return {"status": "started", "simulation": simulator.get_status()}

@router.post("/stop")
async def stop_sim():
    await simulator.stop()
    return {"status": "stopped", "simulation": simulator.get_status()}

@router.get("/status")
async def get_sim_status():
    return {"simulation": simulator.get_status()}
