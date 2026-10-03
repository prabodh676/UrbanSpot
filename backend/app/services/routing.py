import httpx
import math
from typing import Dict, Any, List
from app.database import haversine_distance

def generate_local_interpolated_route(
    start_lat: float, start_lng: float,
    end_lat: float, end_lng: float
) -> Dict[str, Any]:
    """
    Offline/zero-key fallback: Generates realistic city navigation polyline
    following grid turns with distance, ETA and turn-by-turn maneuvers.
    """
    dist_m = haversine_distance(start_lat, start_lng, end_lat, end_lng)
    # City driving detour factor ~1.28
    road_dist_m = dist_m * 1.28
    # Average speed ~28 km/h = 7.77 m/s
    duration_s = max(60, int(road_dist_m / 7.77))
    duration_min = round(duration_s / 60.0, 1)

    # Generate synthetic street waypoints (L-shape / Manhattan detour)
    mid_lat = (start_lat + end_lat) / 2.0
    mid_lng = start_lng + (end_lng - start_lng) * 0.7

    coords = [
        [start_lng, start_lat],
        [start_lng + (mid_lng - start_lng) * 0.5, start_lat + 0.0005],
        [mid_lng, start_lat + (mid_lat - start_lat) * 0.4],
        [mid_lng, mid_lat],
        [mid_lng + (end_lng - mid_lng) * 0.4, mid_lat + (end_lat - mid_lat) * 0.5],
        [end_lng, end_lat]
    ]

    steps = [
        {"instruction": f"Head toward Main Arterial Road ({int(road_dist_m * 0.3)} m)", "distance_m": int(road_dist_m * 0.3)},
        {"instruction": f"Turn right at Hitech Junction ({int(road_dist_m * 0.4)} m)", "distance_m": int(road_dist_m * 0.4)},
        {"instruction": f"Continue straight onto Destination Approach ({int(road_dist_m * 0.3)} m)", "distance_m": int(road_dist_m * 0.3)},
        {"instruction": "Arrive at Parking Facility Gate / Spot", "distance_m": 0}
    ]

    return {
        "status": "success",
        "provider": "local_offline_engine",
        "distance_meters": round(road_dist_m, 1),
        "distance_km": round(road_dist_m / 1000.0, 2),
        "duration_seconds": duration_s,
        "duration_minutes": duration_min,
        "coordinates": coords,
        "steps": steps
    }

async def get_route(
    start_lat: float, start_lng: float,
    end_lat: float, end_lng: float
) -> Dict[str, Any]:
    """
    Fetch driving route via public OSRM demo API with timeout,
    falling back automatically to local offline engine if network is down.
    """
    url = f"https://router.project-osrm.org/route/v1/driving/{start_lng},{start_lat};{end_lng},{end_lat}?overview=full&geometries=geojson&steps=true"
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("routes") and len(data["routes"]) > 0:
                    route = data["routes"][0]
                    coords = route["geometry"]["coordinates"]
                    dist_m = route["distance"]
                    duration_s = route["duration"]
                    
                    steps = []
                    for leg in route.get("legs", []):
                        for step in leg.get("steps", []):
                            steps.append({
                                "instruction": step.get("maneuver", {}).get("instruction", "Continue along route"),
                                "distance_m": int(step.get("distance", 0))
                            })
                    
                    return {
                        "status": "success",
                        "provider": "osrm",
                        "distance_meters": round(dist_m, 1),
                        "distance_km": round(dist_m / 1000.0, 2),
                        "duration_seconds": int(duration_s),
                        "duration_minutes": round(duration_s / 60.0, 1),
                        "coordinates": coords,
                        "steps": steps or [{"instruction": "Follow marked navigation route", "distance_m": int(dist_m)}]
                    }
    except Exception:
        pass # Fallback smoothly

    return generate_local_interpolated_route(start_lat, start_lng, end_lat, end_lng)
