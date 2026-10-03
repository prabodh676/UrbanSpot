from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from app.services.discovery import discover_lots
from app.services.occupancy import get_lot_live_status
from app.services.forecasting import forecast_lot_occupancy
from app.database import get_db_connection
from app.config import settings

router = APIRouter(prefix="/api/lots", tags=["lots"])

@router.get("")
async def get_lots(
    lat: float = Query(settings.DEFAULT_LAT),
    lng: float = Query(settings.DEFAULT_LNG),
    radius: float = Query(50000.0),
    max_price: Optional[float] = Query(None),
    features: Optional[str] = Query(None), # Comma separated, e.g. "covered,ev"
    min_free_slots: int = Query(0),
    sort_by: str = Query("recommended")
):
    feature_list = [f.strip() for f in features.split(",") if f.strip()] if features else None
    lots = await discover_lots(
        user_lat=lat,
        user_lng=lng,
        radius_m=radius,
        required_features=feature_list,
        max_price=max_price,
        min_free_slots=min_free_slots,
        sort_by=sort_by
    )
    return {"lots": lots, "count": len(lots)}

@router.get("/{lot_id}")
async def get_lot(lot_id: str):
    live_status = await get_lot_live_status(lot_id)
    if not live_status:
        raise HTTPException(status_code=404, detail="Lot not found")
    
    # Also fetch individual slot statuses for slot map view
    async with await get_db_connection() as db:
        async with db.execute("SELECT id, label, slot_type, status FROM slots WHERE lot_id = ? ORDER BY label", (lot_id,)) as cursor:
            slots = [dict(s) for s in await cursor.fetchall()]

    return {"lot": live_status, "slots": slots}

@router.get("/{lot_id}/forecast")
async def get_forecast(lot_id: str, driver_eta: float = Query(15.0)):
    forecast = await forecast_lot_occupancy(lot_id, driver_eta)
    if forecast.get("status") == "error":
        raise HTTPException(status_code=404, detail=forecast["message"])
    return forecast
