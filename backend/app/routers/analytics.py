import time
import datetime
from fastapi import APIRouter, Query
from app.database import get_db_connection

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/overview")
async def get_analytics_overview():
    now = time.time()
    dt = datetime.datetime.fromtimestamp(now)
    current_dow = dt.weekday()
    current_hour = dt.hour

    async with await get_db_connection() as db:
        # Total lots, total capacity, current live occupancy
        async with db.execute("""
            SELECT COUNT(DISTINCT l.id) as total_lots,
                   SUM(l.total_slots) as total_capacity,
                   COUNT(CASE WHEN s.status = 'occupied' THEN 1 END) as total_occupied,
                   COUNT(CASE WHEN s.status = 'held' THEN 1 END) as total_held,
                   COUNT(CASE WHEN s.status = 'free' THEN 1 END) as total_free
            FROM lots l
            LEFT JOIN slots s ON l.id = s.lot_id
        """) as cursor:
            summary = dict(await cursor.fetchone())

        total_cap = summary["total_capacity"] or 1
        total_occ = summary["total_occupied"] or 0
        overall_utilization = round((total_occ / total_cap) * 100, 1)

        # Total events logged today
        today_start = now - (dt.hour * 3600 + dt.minute * 60 + dt.second)
        async with db.execute("""
            SELECT COUNT(*) as events_today,
                   COUNT(CASE WHEN event_type = 'entry' THEN 1 END) as entries_today,
                   COUNT(CASE WHEN event_type = 'exit' THEN 1 END) as exits_today
            FROM occupancy_events
            WHERE ts >= ?
        """, (today_start,)) as cursor:
            events_today = dict(await cursor.fetchone())

        # Estimated daily revenue based on entries * average duration (2h) * avg rate (₹40)
        est_revenue = int(events_today["entries_today"] * 2.0 * 38.0)

        # Top utilized facilities
        async with db.execute("""
            SELECT l.id, l.name, l.total_slots, l.price_per_hr,
                   COUNT(CASE WHEN s.status = 'occupied' THEN 1 END) as occupied_count,
                   COUNT(CASE WHEN s.status = 'free' THEN 1 END) as free_count
            FROM lots l
            LEFT JOIN slots s ON l.id = s.lot_id
            GROUP BY l.id
            ORDER BY occupied_count DESC
            LIMIT 5
        """) as cursor:
            top_lots = [dict(r) for r in await cursor.fetchall()]

        for tl in top_lots:
            tl["occupancy_pct"] = round((tl["occupied_count"] / (tl["total_slots"] or 1)) * 100, 1)

        # 24-hour demand curve aggregated across all lots
        async with db.execute("""
            SELECT hour_of_day,
                   ROUND(AVG(avg_arrivals), 1) as avg_arrivals,
                   ROUND(AVG(avg_exits), 1) as avg_exits,
                   ROUND(AVG(avg_occupancy_ratio) * 100, 1) as avg_occupancy_pct
            FROM lot_stats_hourly
            WHERE day_of_week = ?
            GROUP BY hour_of_day
            ORDER BY hour_of_day ASC
        """, (current_dow,)) as cursor:
            hourly_demand = [dict(r) for r in await cursor.fetchall()]

        # Recent 10 events stream (audit trail)
        async with db.execute("""
            SELECT e.*, l.name as lot_name
            FROM occupancy_events e
            JOIN lots l ON e.lot_id = l.id
            ORDER BY e.ts DESC
            LIMIT 15
        """) as cursor:
            recent_events = [dict(r) for r in await cursor.fetchall()]

    return {
        "summary": {
            **summary,
            "overall_utilization_pct": overall_utilization,
            "est_revenue_today": est_revenue,
            "entries_today": events_today["entries_today"],
            "exits_today": events_today["exits_today"]
        },
        "top_lots": top_lots,
        "hourly_demand": hourly_demand,
        "recent_events": recent_events
    }
