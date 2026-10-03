import time
import uuid
from typing import Dict, Any, List, Optional
from app.database import get_db_connection, haversine_distance
from app.cache import cache
from app.config import settings

async def report_vacating_spot(
    reporter_id: str,
    lat: float,
    lng: float,
    street_name: str,
    accuracy_m: float = 10.0
) -> Dict[str, Any]:
    """
    Driver broadcasts they are vacating an on-street parking spot.
    Anti-abuse: Reject if GPS accuracy is poor (> 35m).
    Sets 4-minute TTL.
    """
    if accuracy_m > 35.0:
        return {"status": "error", "message": f"GPS accuracy too low ({accuracy_m:.1f}m). Please ensure high-precision GPS."}

    now = time.time()
    expires_at = now + settings.STREET_REPORT_TTL_SECONDS
    spot_id = f"spot-{uuid.uuid4().hex[:10]}"

    async with await get_db_connection() as db:
        await db.execute("""
            INSERT INTO street_reports (
                id, reporter_id, lat, lng, accuracy_m, street_name,
                created_at, expires_at, status, claimer_id, points_awarded
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, 0)
        """, (
            spot_id, reporter_id, lat, lng, accuracy_m,
            street_name, now, expires_at
        ))
        await db.commit()

    spot_payload = {
        "id": spot_id,
        "reporter_id": reporter_id,
        "lat": lat,
        "lng": lng,
        "accuracy_m": accuracy_m,
        "street_name": street_name,
        "created_at": now,
        "expires_at": expires_at,
        "ttl_remaining": int(settings.STREET_REPORT_TTL_SECONDS),
        "status": "open"
    }

    # Broadcast to all nearby seekers via WebSocket
    await cache.publish("street_spot_new", spot_payload)

    return {"status": "success", "spot": spot_payload}

async def claim_street_spot(spot_id: str, claimer_id: str) -> Dict[str, Any]:
    """
    Atomic claim of an on-street spot.
    Guarantees only one driver gets the claim navigation lock.
    """
    now = time.time()
    async with await get_db_connection() as db:
        async with db.execute("SELECT * FROM street_reports WHERE id = ?", (spot_id,)) as cursor:
            spot = await cursor.fetchone()
            if not spot:
                return {"status": "error", "message": "Spot report not found"}
            if spot["status"] != "open":
                return {"status": "error", "message": f"Spot already {spot['status']}"}
            if now > spot["expires_at"]:
                return {"status": "error", "message": "Spot report has expired"}
            if spot["reporter_id"] == claimer_id:
                return {"status": "error", "message": "Cannot claim your own reported spot"}

        # Atomic claim lock in cache
        claim_key = f"claim:{spot_id}"
        acquired = await cache.set_nx_ex(claim_key, claimer_id, int(spot["expires_at"] - now))
        if not acquired:
            return {"status": "error", "message": "Another driver claimed this spot a split-second ago"}

        await db.execute("""
            UPDATE street_reports
            SET status = 'claimed', claimer_id = ?
            WHERE id = ?
        """, (claimer_id, spot_id))
        await db.commit()

    payload = {
        "id": spot_id,
        "status": "claimed",
        "claimer_id": claimer_id,
        "lat": spot["lat"],
        "lng": spot["lng"],
        "street_name": spot["street_name"]
    }
    await cache.publish("street_spot_claimed", payload)

    return {"status": "claimed", "spot": payload}

async def record_spot_outcome(
    spot_id: str,
    user_id: str,
    outcome: str # 'confirmed' or 'not_there'
) -> Dict[str, Any]:
    """
    Outcome resolution:
    - If 'confirmed': Reporter gets +100 points, claimer gets +40 points. Trust scores improve.
    - If 'not_there': Reporter trust score penalized.
    """
    now = time.time()
    async with await get_db_connection() as db:
        async with db.execute("SELECT * FROM street_reports WHERE id = ?", (spot_id,)) as cursor:
            spot = await cursor.fetchone()
            if not spot:
                return {"status": "error", "message": "Spot report not found"}

        reporter_id = spot["reporter_id"]
        claimer_id = spot["claimer_id"]

        if outcome == "confirmed":
            new_status = "confirmed"
            # Add points to ledger
            rep_pts_id = f"pts-{uuid.uuid4().hex[:10]}"
            claim_pts_id = f"pts-{uuid.uuid4().hex[:10]}"
            await db.execute("""
                INSERT INTO points_ledger (id, user_id, delta, reason, ref_id, created_at)
                VALUES (?, ?, 100, 'Spot vacating broadcast verified by driver', ?, ?)
            """, (rep_pts_id, reporter_id, spot_id, now))
            if claimer_id:
                await db.execute("""
                    INSERT INTO points_ledger (id, user_id, delta, reason, ref_id, created_at)
                    VALUES (?, ?, 40, 'Spot claimed & parked successfully', ?, ?)
                """, (claim_pts_id, claimer_id, spot_id, now))

            # Update reporter trust
            await db.execute("""
                UPDATE user_trust
                SET score = MIN(100.0, score + 1.5),
                    total_reports = total_reports + 1,
                    accurate_reports = accurate_reports + 1,
                    updated_at = ?
                WHERE user_id = ?
            """, (now, reporter_id))

        else: # 'not_there'
            new_status = "disputed"
            # Penalize reporter trust score
            await db.execute("""
                UPDATE user_trust
                SET score = MAX(10.0, score - 8.0),
                    total_reports = total_reports + 1,
                    updated_at = ?
                WHERE user_id = ?
            """, (now, reporter_id))

        await db.execute("""
            UPDATE street_reports
            SET status = ?, points_awarded = ?
            WHERE id = ?
        """, (new_status, 100 if outcome == "confirmed" else 0, spot_id))
        await db.commit()

    payload = {"spot_id": spot_id, "status": new_status, "outcome": outcome}
    await cache.publish("street_spot_outcome", payload)

    return {"status": "success", "outcome": outcome, "new_status": new_status}

async def get_active_street_spots(user_lat: float, user_lng: float, radius_m: float = 6000.0) -> List[Dict[str, Any]]:
    """Returns active (non-expired) street reports with trust score and remaining TTL"""
    now = time.time()
    async with await get_db_connection() as db:
        async with db.execute("""
            SELECT s.*, u.score as reporter_trust_score, u.name as reporter_name
            FROM street_reports s
            LEFT JOIN user_trust u ON s.reporter_id = u.user_id
            WHERE s.expires_at > ? AND s.status IN ('open', 'claimed')
            ORDER BY s.created_at DESC
        """, (now,)) as cursor:
            rows = await cursor.fetchall()

    results = []
    for r in rows:
        dist_m = haversine_distance(user_lat, user_lng, r["lat"], r["lng"])
        if dist_m <= radius_m:
            results.append({
                "id": r["id"],
                "reporter_id": r["reporter_id"],
                "reporter_name": r["reporter_name"] or "Anonymous Driver",
                "reporter_trust_score": r["reporter_trust_score"] or 85.0,
                "lat": r["lat"],
                "lng": r["lng"],
                "street_name": r["street_name"],
                "accuracy_m": r["accuracy_m"],
                "created_at": r["created_at"],
                "expires_at": r["expires_at"],
                "ttl_remaining": max(0, int(r["expires_at"] - now)),
                "status": r["status"],
                "claimer_id": r["claimer_id"],
                "distance_m": round(dist_m, 1),
                "distance_km": round(dist_m / 1000.0, 2)
            })
    return results

async def get_user_points_and_trust(user_id: str) -> Dict[str, Any]:
    async with await get_db_connection() as db:
        async with db.execute("SELECT COALESCE(SUM(delta), 0) as total_points FROM points_ledger WHERE user_id = ?", (user_id,)) as cursor:
            total_points = (await cursor.fetchone())["total_points"]
        async with db.execute("SELECT * FROM user_trust WHERE user_id = ?", (user_id,)) as cursor:
            trust = await cursor.fetchone()
            trust_dict = dict(trust) if trust else {"score": 85.0, "total_reports": 0, "accurate_reports": 0}

    return {
        "user_id": user_id,
        "total_points": total_points,
        "trust_score": trust_dict.get("score", 85.0),
        "total_reports": trust_dict.get("total_reports", 0),
        "accurate_reports": trust_dict.get("accurate_reports", 0)
    }
