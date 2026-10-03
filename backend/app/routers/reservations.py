from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.services.reservations import (
    create_reservation_hold,
    confirm_reservation,
    cancel_reservation,
    get_active_user_reservations
)

router = APIRouter(prefix="/api/reservations", tags=["reservations"])

class ReservationHoldRequest(BaseModel):
    user_id: str = "usr-rahul-01"
    lot_id: str
    slot_id: Optional[str] = None
    duration_hours: float = 2.0

class ReservationConfirmRequest(BaseModel):
    user_id: str = "usr-rahul-01"

@router.post("")
async def create_hold(
    payload: ReservationHoldRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")
):
    result = await create_reservation_hold(
        user_id=payload.user_id,
        lot_id=payload.lot_id,
        slot_id=payload.slot_id,
        duration_hours=payload.duration_hours,
        idem_key=idempotency_key
    )
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@router.post("/{reservation_id}/confirm")
async def confirm(reservation_id: str, payload: ReservationConfirmRequest):
    result = await confirm_reservation(reservation_id, payload.user_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@router.delete("/{reservation_id}")
async def cancel(reservation_id: str, user_id: str = Query("usr-rahul-01")):
    result = await cancel_reservation(reservation_id, user_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@router.get("/user/{user_id}")
async def list_user_reservations(user_id: str):
    reservations = await get_active_user_reservations(user_id)
    return {"reservations": reservations}
