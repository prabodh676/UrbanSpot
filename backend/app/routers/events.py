from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.occupancy import record_occupancy_event

router = APIRouter(prefix="/api/events", tags=["events"])

class EventIngestPayload(BaseModel):
    lot_id: str
    event_type: str # 'entry' or 'exit'
    slot_id: Optional[str] = None
    source: Optional[str] = "sensor"

@router.post("")
async def ingest_event(
    payload: EventIngestPayload,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")
):
    if payload.event_type not in ("entry", "exit"):
        raise HTTPException(status_code=400, detail="event_type must be 'entry' or 'exit'")

    result = await record_occupancy_event(
        lot_id=payload.lot_id,
        event_type=payload.event_type,
        slot_id=payload.slot_id,
        source=payload.source or "sensor",
        idem_key=idempotency_key
    )
    return result
