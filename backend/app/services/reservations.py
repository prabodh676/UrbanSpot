import time
import uuid
import random
from typing import Dict, Any, Optional, List
from app.database import get_db_connection
from app.cache import cache
from app.config import settings

async def create_reservation_hold(
    user_id: str,
    lot_id: str,
    slot_id: Optional[str] = None,
    duration_hours: float = 2.0,
    idem_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Creates an atomic 10-minute hold (SET NX EX 600) on a slot.
    Guarantees no double-booking across concurrent drivers.
    """
    now = time.time()
    hold_expires_at = now + settings.HOLD_TTL_SECONDS
    reservation_id = f"res-{uuid.uuid4().hex[:10]}"
    pin_code = f"{random.randint(1000, 9999)}"

    async with await get_db_connection() as db:
        # Check idempotency
        if idem_key:
            async with db.execute("SELECT * FROM reservations WHERE idem_key = ?", (idem_key,)) as cursor:
                existing = await cursor.fetchone()
                if existing:
                    return {
                        "status": "existing",
                        "reservation_id": existing["id"],
                        "slot_id": existing["slot_id"],
                        "pin_code": existing["pin_code"],
                        "hold_expires_at": existing["hold_expires_at"],
                        "qr_payload": existing["qr_payload"]
                    }

        # If no slot specified, find first free slot
        if not slot_id:
            async with db.execute(
                "SELECT id, label FROM slots WHERE lot_id = ? AND status = 'free' LIMIT 1",
                (lot_id,)
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return {"status": "error", "message": "No available slots in this facility"}
                slot_id = row["id"]

        # Atomic hold lock in cache
        cache_hold_key = f"hold:{slot_id}"
        acquired = await cache.set_nx_ex(cache_hold_key, user_id, settings.HOLD_TTL_SECONDS)
        if not acquired:
            return {"status": "error", "message": "Slot was just held by another driver. Please choose another."}

        # Mark slot as held in DB
        await db.execute("UPDATE slots SET status = 'held' WHERE id = ?", (slot_id,))

        qr_payload = f"PARK-RES:{reservation_id}:{lot_id}:{slot_id}:{pin_code}"

        await db.execute("""
            INSERT INTO reservations (
                id, user_id, lot_id, slot_id, start_ts, end_ts, status,
                hold_expires_at, pin_code, qr_payload, idem_key, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'hold', ?, ?, ?, ?, ?)
        """, (
            reservation_id, user_id, lot_id, slot_id, now,
            now + (duration_hours * 3600), hold_expires_at,
            pin_code, qr_payload, idem_key, now
        ))
        await db.commit()

    # Broadcast lot update so map counters update immediately
    from app.services.occupancy import get_lot_live_status
    live_status = await get_lot_live_status(lot_id)
    await cache.publish("reservation_held", {
        "reservation_id": reservation_id,
        "lot_id": lot_id,
        "slot_id": slot_id,
        "hold_expires_at": hold_expires_at,
        "live_status": live_status
    })

    return {
        "status": "held",
        "reservation_id": reservation_id,
        "lot_id": lot_id,
        "slot_id": slot_id,
        "pin_code": pin_code,
        "qr_payload": qr_payload,
        "hold_expires_at": hold_expires_at,
        "ttl_seconds": settings.HOLD_TTL_SECONDS,
        "live_status": live_status
    }

async def confirm_reservation(reservation_id: str, user_id: str) -> Dict[str, Any]:
    """Confirms a held reservation into permanent booking"""
    now = time.time()
    async with await get_db_connection() as db:
        async with db.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,)) as cursor:
            res = await cursor.fetchone()
            if not res:
                return {"status": "error", "message": "Reservation not found"}
            if res["status"] == "confirmed":
                return {"status": "already_confirmed", "reservation": dict(res)}
            if res["status"] != "hold":
                return {"status": "error", "message": f"Cannot confirm reservation in status '{res['status']}'"}
            if now > res["hold_expires_at"]:
                return {"status": "error", "message": "Hold expired. Slot released."}

        lot_id = res["lot_id"]
        slot_id = res["slot_id"]

        await db.execute("""
            UPDATE reservations
            SET status = 'confirmed'
            WHERE id = ?
        """, (reservation_id,))
        await db.commit()

    from app.services.occupancy import get_lot_live_status
    live_status = await get_lot_live_status(lot_id)

    await cache.publish("reservation_confirmed", {
        "reservation_id": reservation_id,
        "lot_id": lot_id,
        "slot_id": slot_id,
        "live_status": live_status
    })

    return {
        "status": "confirmed",
        "reservation_id": reservation_id,
        "lot_id": lot_id,
        "slot_id": slot_id,
        "pin_code": res["pin_code"],
        "qr_payload": res["qr_payload"],
        "start_ts": res["start_ts"],
        "end_ts": res["end_ts"],
        "live_status": live_status
    }

async def cancel_reservation(reservation_id: str, user_id: str) -> Dict[str, Any]:
    """Cancels a reservation and releases the slot lock"""
    async with await get_db_connection() as db:
        async with db.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,)) as cursor:
            res = await cursor.fetchone()
            if not res:
                return {"status": "error", "message": "Reservation not found"}

        slot_id = res["slot_id"]
        lot_id = res["lot_id"]

        await db.execute("UPDATE reservations SET status = 'cancelled' WHERE id = ?", (reservation_id,))
        if slot_id:
            await db.execute("UPDATE slots SET status = 'free' WHERE id = ?", (slot_id,))
        await db.commit()

    if slot_id:
        await cache.delete(f"hold:{slot_id}")

    from app.services.occupancy import get_lot_live_status
    live_status = await get_lot_live_status(lot_id)

    await cache.publish("reservation_cancelled", {
        "reservation_id": reservation_id,
        "lot_id": lot_id,
        "slot_id": slot_id,
        "live_status": live_status
    })

    return {"status": "cancelled", "reservation_id": reservation_id, "live_status": live_status}

async def get_active_user_reservations(user_id: str) -> List[Dict[str, Any]]:
    async with await get_db_connection() as db:
        async with db.execute("""
            SELECT r.*, l.name as lot_name, l.address as lot_address, l.price_per_hr,
                   s.label as slot_label
            FROM reservations r
            JOIN lots l ON r.lot_id = l.id
            LEFT JOIN slots s ON r.slot_id = s.id
            WHERE r.user_id = ? AND r.status IN ('hold', 'confirmed')
            ORDER BY r.created_at DESC
        """, (user_id,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
