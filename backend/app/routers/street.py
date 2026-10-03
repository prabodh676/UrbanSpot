from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.services.spotter import (
    report_vacating_spot,
    claim_street_spot,
    record_spot_outcome,
    get_active_street_spots,
    get_user_points_and_trust
)
from app.config import settings

router = APIRouter(prefix="/api/street", tags=["street"])

class VacatingReportRequest(BaseModel):
    reporter_id: str = "usr-priya-02"
    lat: float
    lng: float
    street_name: str
    accuracy_m: float = 8.0

class ClaimSpotRequest(BaseModel):
    claimer_id: str = "usr-rahul-01"

class OutcomeRequest(BaseModel):
    user_id: str
    outcome: str # 'confirmed' or 'not_there'

@router.get("/active")
async def list_active_street_spots(
    lat: float = Query(settings.DEFAULT_LAT),
    lng: float = Query(settings.DEFAULT_LNG),
    radius: float = Query(8000.0)
):
    spots = await get_active_street_spots(lat, lng, radius)
    return {"spots": spots, "count": len(spots)}

@router.post("/report")
async def report_spot(payload: VacatingReportRequest):
    result = await report_vacating_spot(
        reporter_id=payload.reporter_id,
        lat=payload.lat,
        lng=payload.lng,
        street_name=payload.street_name,
        accuracy_m=payload.accuracy_m
    )
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@router.post("/{spot_id}/claim")
async def claim_spot(spot_id: str, payload: ClaimSpotRequest):
    result = await claim_street_spot(spot_id, payload.claimer_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@router.post("/{spot_id}/outcome")
async def submit_outcome(spot_id: str, payload: OutcomeRequest):
    result = await record_spot_outcome(spot_id, payload.user_id, payload.outcome)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@router.get("/user/{user_id}/trust")
async def user_trust_info(user_id: str):
    info = await get_user_points_and_trust(user_id)
    return info
