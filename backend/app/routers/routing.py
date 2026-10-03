from fastapi import APIRouter, Query, HTTPException
from app.services.routing import get_route

router = APIRouter(prefix="/api/route", tags=["routing"])

@router.get("")
async def fetch_route(
    start_lat: float = Query(...),
    start_lng: float = Query(...),
    dest_lat: float = Query(...),
    dest_lng: float = Query(...)
):
    route = await get_route(start_lat, start_lng, dest_lat, dest_lng)
    return route
