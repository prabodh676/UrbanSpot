import json
import math
from typing import List, Dict, Any, Optional
from app.database import get_db_connection, haversine_distance
from app.cache import cache

async def discover_lots(
    user_lat: float,
    user_lng: float,
    radius_m: float = 8000.0,
    required_features: Optional[List[str]] = None,
    max_price: Optional[float] = None,
    min_free_slots: int = 1,
    sort_by: str = "recommended" # 'recommended', 'distance', 'price', 'availability'
) -> List[Dict[str, Any]]:
    """
    Geo discovery with spatial filtering and multi-factor ranking algorithm:
    Ranking Score = (Distance Weight) + (Price Weight) + (Availability Score)
    """
    async with await get_db_connection() as db:
        async with db.execute("""
            SELECT l.*,
                   COUNT(CASE WHEN s.status = 'free' THEN 1 END) as free_slots,
                   COUNT(CASE WHEN s.status = 'occupied' THEN 1 END) as occupied_slots,
                   COUNT(CASE WHEN s.status = 'held' THEN 1 END) as held_slots
            FROM lots l
            LEFT JOIN slots s ON l.id = s.lot_id
            GROUP BY l.id
        """) as cursor:
            rows = await cursor.fetchall()

    results = []
    for r in rows:
        dist_m = haversine_distance(user_lat, user_lng, r["lat"], r["lng"])
        if dist_m > radius_m:
            continue

        free_slots = r["free_slots"]
        if free_slots < min_free_slots:
            continue

        price = r["price_per_hr"]
        if max_price is not None and price > max_price:
            continue

        lot_features = json.loads(r["features"]) if isinstance(r["features"], str) else r["features"]
        if required_features:
            if not all(feat in lot_features for feat in required_features):
                continue

        total = r["total_slots"]
        occupancy_ratio = 1.0 - (free_slots / total) if total > 0 else 1.0
        
        # Color coding
        if occupancy_ratio >= 0.90:
            color = "red"
        elif occupancy_ratio >= 0.70:
            color = "amber"
        else:
            color = "green"

        # Estimated travel time (average urban city speed ~25 km/h)
        speed_mps = 25.0 * 1000.0 / 3600.0
        eta_minutes = max(2, int(dist_m / speed_mps / 60.0))

        # Probability of free slot upon arrival
        # Higher occupancy ratio or long ETA reduces probability
        p_free = max(0.05, min(0.98, (free_slots / (total or 1)) * math.exp(-0.02 * eta_minutes)))

        # Composite ranking score (lower is better ranking):
        # normalize distance (km), price (per hr), and penalize low free slots
        score = (dist_m / 1000.0) * 1.5 + (price / 20.0) * 1.0 - (p_free * 4.0)

        results.append({
            "id": r["id"],
            "name": r["name"],
            "lat": r["lat"],
            "lng": r["lng"],
            "address": r["address"],
            "price_per_hr": price,
            "total_slots": total,
            "free_slots": free_slots,
            "occupied_slots": r["occupied_slots"],
            "held_slots": r["held_slots"],
            "occupancy_ratio": round(occupancy_ratio, 3),
            "occupancy_pct": round(occupancy_ratio * 100, 1),
            "status_color": color,
            "distance_m": round(dist_m, 1),
            "distance_km": round(dist_m / 1000.0, 2),
            "eta_minutes": eta_minutes,
            "p_free_at_arrival": round(p_free, 2),
            "features": lot_features,
            "ranking_score": round(score, 2)
        })

    if sort_by == "distance":
        results.sort(key=lambda x: x["distance_m"])
    elif sort_by == "price":
        results.sort(key=lambda x: x["price_per_hr"])
    elif sort_by == "availability":
        results.sort(key=lambda x: x["free_slots"], reverse=True)
    else: # recommended
        results.sort(key=lambda x: x["ranking_score"])

    return results
