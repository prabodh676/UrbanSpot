import time
import uuid
import json
from typing import Dict, Any, List, Optional
from app.database import get_db_connection
from app.cache import cache

async def initialize_occupancy_cache():
    """Sync live free-slot counts into fast cache upon server startup"""
    async with await get_db_connection() as db:
        async with db.execute("""
            SELECT l.id, l.total_slots,
                   COUNT(CASE WHEN s.status = 'free' THEN 1 END) as free_count
            FROM lots l
            LEFT JOIN slots s ON l.id = s.lot_id
            GROUP BY l.id
        """) as cursor:
            rows = await cursor.fetchall()
            for row in rows:
                lot_id = row["id"]
                free_slots = row["free_count"]
                cache.set_lot_availability(lot_id, free_slots)

async def get_lot_live_status(lot_id: str) -> Optional[Dict[str, Any]]:
    """Get live free slots and occupancy status derived from slots and event cache"""
    async with await get_db_connection() as db:
        async with db.execute("""
            SELECT l.*,
                   COUNT(CASE WHEN s.status = 'free' THEN 1 END) as free_slots,
                   COUNT(CASE WHEN s.status = 'occupied' THEN 1 END) as occupied_slots,
                   COUNT(CASE WHEN s.status = 'held' THEN 1 END) as held_slots,
                   COUNT(CASE WHEN s.status = 'maintenance' THEN 1 END) as maintenance_slots
            FROM lots l
            LEFT JOIN slots s ON l.id = s.lot_id
            WHERE l.id = ?
            GROUP BY l.id
        """, (lot_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            
            total = row["total_slots"]
            free = row["free_slots"]
            cache.set_lot_availability(lot_id, free)
            occupancy_ratio = 1.0 - (free / total) if total > 0 else 1.0

            color = "green"
            if occupancy_ratio >= 0.90:
                color = "red"
            elif occupancy_ratio >= 0.70:
                color = "amber"

            return {
                "id": row["id"],
                "name": row["name"],
                "lat": row["lat"],
                "lng": row["lng"],
                "address": row["address"],
                "price_per_hr": row["price_per_hr"],
                "total_slots": total,
                "free_slots": free,
                "occupied_slots": row["occupied_slots"],
                "held_slots": row["held_slots"],
                "occupancy_ratio": round(occupancy_ratio, 3),
                "occupancy_pct": round(occupancy_ratio * 100, 1),
                "status_color": color,
                "features": json.loads(row["features"]) if isinstance(row["features"], str) else row["features"]
            }

async def record_occupancy_event(
    lot_id: str,
    event_type: str, # 'entry' or 'exit'
    slot_id: Optional[str] = None,
    source: str = "sensor",
    idem_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Append-only event-sourced ingestion endpoint.
    Guaranteed idempotency and real-time cache + WebSocket broadcast.
    """
    now = time.time()
    event_id = f"evt-{uuid.uuid4().hex[:12]}"
    if not idem_key:
        idem_key = f"auto-{event_id}"

    async with await get_db_connection() as db:
        # Check idempotency
        async with db.execute("SELECT id FROM occupancy_events WHERE idem_key = ?", (idem_key,)) as cursor:
            existing = await cursor.fetchone()
            if existing:
                return {"status": "deduplicated", "event_id": existing["id"]}

        # If slot_id is not specified, pick an appropriate slot
        if not slot_id:
            target_status = "free" if event_type == "entry" else "occupied"
            async with db.execute(
                "SELECT id FROM slots WHERE lot_id = ? AND status = ? LIMIT 1",
                (lot_id, target_status)
            ) as cursor:
                slot_row = await cursor.fetchone()
                if slot_row:
                    slot_id = slot_row["id"]

        # Append to occupancy_events log
        await db.execute("""
            INSERT INTO occupancy_events (id, lot_id, slot_id, event_type, ts, source, idem_key)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (event_id, lot_id, slot_id, event_type, now, source, idem_key))

        # Update slot status in slots table
        if slot_id:
            new_status = "occupied" if event_type == "entry" else "free"
            await db.execute(
                "UPDATE slots SET status = ? WHERE id = ?",
                (new_status, slot_id)
            )

        await db.commit()

    # Update EWMA velocity in cache
    cache.update_ewma_rates(lot_id, event_type)

    # Re-read live status and broadcast diff
    live_status = await get_lot_live_status(lot_id)
    if live_status:
        cache.set_lot_availability(lot_id, live_status["free_slots"])
        await cache.publish("lot_update", {
            "lot_id": lot_id,
            "event_type": event_type,
            "slot_id": slot_id,
            "source": source,
            "live_status": live_status
        })

    return {"status": "success", "event_id": event_id, "live_status": live_status}
