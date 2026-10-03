import re
import json
from typing import Dict, Any, List, Optional
from app.services.discovery import discover_lots
from app.services.forecasting import forecast_lot_occupancy
from app.services.routing import get_route
from app.services.reservations import create_reservation_hold, confirm_reservation
from app.config import settings

# Available Tools Definition
TOOLS_METADATA = [
    {
        "name": "search_lots",
        "description": "Geo + filter search over live parking lot state (price, covered, ev, etc.)",
        "parameters": {"user_lat": "float", "user_lng": "float", "max_price": "float", "features": "list[str]"}
    },
    {
        "name": "get_eta",
        "description": "Calculates driving distance, polyline and ETA to target parking facility",
        "parameters": {"start_lat": "float", "start_lng": "float", "dest_lat": "float", "dest_lng": "float"}
    },
    {
        "name": "check_forecast",
        "description": "Predicts probability of lot saturation at driver's arrival time using EWMA surge rates",
        "parameters": {"lot_id": "str", "driver_eta_minutes": "float"}
    },
    {
        "name": "reserve_slot",
        "description": "Creates an atomic hold lock and confirms slot reservation",
        "parameters": {"lot_id": "str", "user_id": "str", "duration_hours": "float"}
    }
]

async def execute_agent_chat(
    prompt: str,
    user_id: str = "usr-rahul-01",
    user_lat: float = settings.DEFAULT_LAT,
    user_lng: float = settings.DEFAULT_LNG
) -> Dict[str, Any]:
    """
    Intelligent Agentic AI execution engine.
    1. Interprets natural language constraints (price, features like covered/ev, duration, booking intent).
    2. Runs tool pipeline: search_lots -> check_forecast -> (optional) reserve_slot.
    3. Reasonably skips lots that turned red (>90% full or predicted full before arrival) and explains why!
    """
    p_lower = prompt.lower()
    tool_calls_executed = []

    # 1. Parameter extraction
    # Max price
    max_price = None
    price_match = re.search(r'(?:under|below|less than|max)\s*(?:₹|rs\.?|inr)?\s*(\d+)', p_lower)
    if price_match:
        max_price = float(price_match.group(1))

    # Features
    features = []
    if "covered" in p_lower or "underground" in p_lower or "shade" in p_lower:
        features.append("covered")
    if "ev" in p_lower or "electric" in p_lower or "charging" in p_lower:
        features.append("ev")
    if "valet" in p_lower:
        features.append("valet")
    if "disabled" in p_lower or "handicap" in p_lower:
        features.append("disabled")

    # Duration
    duration_hours = 2.0
    dur_match = re.search(r'(\d+)\s*(?:hour|hr|hours|hrs)', p_lower)
    if dur_match:
        duration_hours = float(dur_match.group(1))

    is_booking_request = any(word in p_lower for word in ["reserve", "book", "hold", "lock", "grab"])

    # Step 1 Tool: search_lots
    tool_calls_executed.append({
        "tool": "search_lots",
        "args": {"user_lat": user_lat, "user_lng": user_lng, "max_price": max_price, "features": features}
    })
    lots = await discover_lots(
        user_lat=user_lat,
        user_lng=user_lng,
        radius_m=8000.0,
        required_features=features if features else None,
        max_price=max_price,
        min_free_slots=1
    )

    if not lots:
        return {
            "response": f"I couldn't find any parking facilities matching your criteria ({', '.join(features) if features else 'any'} under ₹{int(max_price) if max_price else 'unlimited'}/hr). Try relaxing filters or expanding search distance.",
            "tool_calls": tool_calls_executed,
            "recommended_lot": None,
            "alternative_lots": []
        }

    # Step 2 Tool: check_forecast on top candidates to verify arrival availability
    evaluated_candidates = []
    for lot in lots[:4]:
        forecast = await forecast_lot_occupancy(lot["id"], float(lot["eta_minutes"]))
        tool_calls_executed.append({
            "tool": "check_forecast",
            "args": {"lot_id": lot["id"], "driver_eta_minutes": lot["eta_minutes"]},
            "result_summary": f"P(full)={forecast['p_full_at_arrival']}, Status={lot['status_color']}"
        })
        evaluated_candidates.append({
            "lot": lot,
            "forecast": forecast
        })

    # Filter out lots that are red (occupancy >= 90%) or forecasted to be full before arrival
    viable_candidates = [
        c for c in evaluated_candidates
        if c["lot"]["status_color"] != "red" and c["forecast"]["p_full_at_arrival"] < 0.85
    ]

    skipped_red_lots = [
        c for c in evaluated_candidates
        if c["lot"]["status_color"] == "red" or c["forecast"]["p_full_at_arrival"] >= 0.85
    ]

    selected_cand = viable_candidates[0] if viable_candidates else evaluated_candidates[0]
    best_lot = selected_cand["lot"]
    best_forecast = selected_cand["forecast"]

    # Step 3 Tool: get_eta routing
    tool_calls_executed.append({
        "tool": "get_eta",
        "args": {"start": [user_lat, user_lng], "dest": [best_lot["lat"], best_lot["lng"]]}
    })
    route_info = await get_route(user_lat, user_lng, best_lot["lat"], best_lot["lng"])

    # Step 4: If user explicitly asked to book/reserve, invoke reserve_slot
    reservation_result = None
    if is_booking_request:
        tool_calls_executed.append({
            "tool": "reserve_slot",
            "args": {"lot_id": best_lot["id"], "user_id": user_id, "duration_hours": duration_hours}
        })
        hold = await create_reservation_hold(user_id=user_id, lot_id=best_lot["id"], duration_hours=duration_hours)
        if hold.get("status") == "held":
            confirm = await confirm_reservation(hold["reservation_id"], user_id)
            reservation_result = {**hold, **confirm}

    # Synthesize intelligent explanation
    skip_reasoning = ""
    if skipped_red_lots:
        skipped_names = [f"{s['lot']['name']} ({s['lot']['occupancy_pct']}% full)" for s in skipped_red_lots]
        skip_reasoning = f"\n\n⚡ *Note:* I intentionally skipped {', '.join(skipped_names)} because live IoT telemetry shows they are either saturated or surging to capacity before you arrive."

    if reservation_result and reservation_result.get("status") == "confirmed":
        response_text = (
            f"✅ **Slot Confirmed!** I have reserved a spot at **{best_lot['name']}**.\n\n"
            f"• **Slot:** {reservation_result.get('slot_id')} (Passcode: `{reservation_result.get('pin_code')}`)\n"
            f"• **Rate:** ₹{best_lot['price_per_hr']}/hr | **ETA:** {best_lot['eta_minutes']} mins ({best_lot['distance_km']} km)\n"
            f"• **Live Status:** {best_lot['free_slots']} free slots ({best_lot['occupancy_pct']}% occupied)\n"
            f"• **Forecast:** {best_forecast['explanation']}"
            f"{skip_reasoning}\n\nYour QR pass is ready for offline entry."
        )
    else:
        response_text = (
            f"🎯 **Best Match:** I recommend **{best_lot['name']}**.\n\n"
            f"• **Rate:** ₹{best_lot['price_per_hr']}/hr | **Distance:** {best_lot['distance_km']} km (~{best_lot['eta_minutes']} mins)\n"
            f"• **Live Availability:** {best_lot['free_slots']} of {best_lot['total_slots']} slots free\n"
            f"• **Amenities:** {', '.join(best_lot['features'])}\n"
            f"• **Occupancy Forecast:** {best_forecast['explanation']}"
            f"{skip_reasoning}\n\nWould you like me to hold a slot here for you?"
        )

    return {
        "response": response_text,
        "recommended_lot": best_lot,
        "forecast": best_forecast,
        "route": route_info,
        "reservation": reservation_result,
        "tool_calls": tool_calls_executed,
        "alternative_lots": [c["lot"] for c in evaluated_candidates if c["lot"]["id"] != best_lot["id"]]
    }
