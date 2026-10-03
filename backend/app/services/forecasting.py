import time
import math
import datetime
from typing import Dict, Any, Optional
from app.database import get_db_connection
from app.cache import cache

async def forecast_lot_occupancy(
    lot_id: str,
    driver_eta_minutes: float = 15.0
) -> Dict[str, Any]:
    """
    Blended Occupancy Forecasting:
    1. Dynamic rate projection from live EWMA arrival & exit rates
    2. Historical hour-of-week ML baseline
    Returns probability of lot being full at arrival, estimated time until full, and guidance.
    """
    now = time.time()
    dt = datetime.datetime.fromtimestamp(now)
    dow = dt.weekday() # 0-6
    hod = dt.hour # 0-23

    async with await get_db_connection() as db:
        # Get lot capacity and current free slots
        async with db.execute("""
            SELECT l.total_slots, l.name,
                   COUNT(CASE WHEN s.status = 'free' THEN 1 END) as free_slots
            FROM lots l
            LEFT JOIN slots s ON l.id = s.lot_id
            WHERE l.id = ?
            GROUP BY l.id
        """, (lot_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return {"status": "error", "message": "Lot not found"}
            total_slots = row["total_slots"]
            free_slots = row["free_slots"]
            lot_name = row["name"]

        # Fetch baseline historical stats for this hour of week
        async with db.execute("""
            SELECT avg_occupancy_ratio, peak_occupancy_ratio, avg_arrivals, avg_exits
            FROM lot_stats_hourly
            WHERE lot_id = ? AND day_of_week = ? AND hour_of_day = ?
        """, (lot_id, dow, hod)) as cursor:
            stat_row = await cursor.fetchone()
            if stat_row:
                ml_baseline_ratio = stat_row["avg_occupancy_ratio"]
                peak_ratio = stat_row["peak_occupancy_ratio"]
            else:
                ml_baseline_ratio = 0.65
                peak_ratio = 0.85

    # Live EWMA arrival & exit velocity (cars per minute)
    rates = cache.get_ewma_rates(lot_id)
    arrival_rate = rates.get("arrival_rate", 0.5)
    exit_rate = rates.get("exit_rate", 0.3)
    net_surge = arrival_rate - exit_rate # net cars arriving per min

    epsilon = 0.05
    if net_surge > epsilon:
        # Lot is filling up
        eta_full_minutes = free_slots / net_surge
    else:
        # Lot is stable or emptying
        eta_full_minutes = 999.0

    # Rate projection probability of being full at driver arrival
    if eta_full_minutes <= 0.1:
        rate_prob_full = 1.0
    elif eta_full_minutes <= driver_eta_minutes:
        # Likely full before driver arrives
        rate_prob_full = min(0.98, 0.70 + (0.28 * (1.0 - (eta_full_minutes / max(1.0, driver_eta_minutes)))))
    else:
        # Full after arrival or not filling
        rate_prob_full = max(0.05, 0.50 * math.exp(-0.03 * (eta_full_minutes - driver_eta_minutes)))

    # Blend baseline historical probability with real-time rate projection
    # Dynamic weight: if live surge is high, trust rate projection more (weight 0.75)
    surge_weight = 0.75 if abs(net_surge) > 0.3 else 0.50
    p_full_at_arrival = round((surge_weight * rate_prob_full) + ((1.0 - surge_weight) * ml_baseline_ratio), 2)
    p_free_at_arrival = round(max(0.02, min(0.98, 1.0 - p_full_at_arrival)), 2)

    # Human-readable explanation for UI and AI agent
    if free_slots <= 2:
        explanation = f"Critical: Almost full ({free_slots} slots remaining). Reserve immediately!"
        risk_level = "high"
    elif eta_full_minutes <= driver_eta_minutes:
        explanation = f"{lot_name} likely full in ~{int(eta_full_minutes)} min (you arrive in ~{int(driver_eta_minutes)} min)."
        risk_level = "high"
    elif eta_full_minutes <= driver_eta_minutes * 1.5:
        explanation = f"Filling up fast: ~{int(eta_full_minutes)} min until capacity. Good chance of slot on arrival."
        risk_level = "moderate"
    else:
        explanation = f"High availability: {free_slots} free slots ({round((free_slots/total_slots)*100)}% vacant). Safe to navigate."
        risk_level = "low"

    return {
        "lot_id": lot_id,
        "lot_name": lot_name,
        "total_slots": total_slots,
        "free_slots": free_slots,
        "driver_eta_minutes": driver_eta_minutes,
        "eta_full_minutes": round(eta_full_minutes, 1) if eta_full_minutes < 900 else None,
        "arrival_rate_per_min": round(arrival_rate, 2),
        "exit_rate_per_min": round(exit_rate, 2),
        "net_arrival_velocity": round(net_surge, 2),
        "ml_baseline_occupancy": round(ml_baseline_ratio, 2),
        "p_full_at_arrival": p_full_at_arrival,
        "p_free_at_arrival": p_free_at_arrival,
        "risk_level": risk_level,
        "explanation": explanation
    }
