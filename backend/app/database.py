import aiosqlite
import httpx
import json
import math
import random
import time
from typing import List, Dict, Any, Optional
from app.config import settings

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lng pairs"""
    R = 6371000  # meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

class DBContext:
    def __init__(self, conn: aiosqlite.Connection):
        self.conn = conn

    async def __aenter__(self) -> aiosqlite.Connection:
        return self.conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            await self.conn.commit()
        await self.conn.close()

async def get_db_connection() -> DBContext:
    conn = await aiosqlite.connect(settings.DB_PATH)
    conn.row_factory = aiosqlite.Row
    return DBContext(conn)

async def init_db():
    async with await get_db_connection() as db:
        await db.execute("PRAGMA journal_mode = WAL")
        await db.execute("PRAGMA foreign_keys = ON")

        # Lots table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS lots (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                address TEXT NOT NULL,
                price_per_hr REAL NOT NULL,
                total_slots INTEGER NOT NULL,
                features TEXT NOT NULL, -- JSON array ['covered', 'ev', 'disabled', 'valet']
                operator_id TEXT NOT NULL,
                created_at REAL NOT NULL
            )
        """)

        # Slots table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS slots (
                id TEXT PRIMARY KEY,
                lot_id TEXT NOT NULL,
                label TEXT NOT NULL,
                slot_type TEXT NOT NULL, -- 'standard', 'ev', 'handicap'
                status TEXT NOT NULL, -- 'free', 'held', 'occupied', 'maintenance'
                FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE
            )
        """)

        # Occupancy events (Append-only event log)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS occupancy_events (
                id TEXT PRIMARY KEY,
                lot_id TEXT NOT NULL,
                slot_id TEXT,
                event_type TEXT NOT NULL, -- 'entry', 'exit'
                ts REAL NOT NULL,
                source TEXT NOT NULL, -- 'sensor', 'operator', 'simulator'
                idem_key TEXT UNIQUE,
                FOREIGN KEY (lot_id) REFERENCES lots(id)
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_events_lot_ts ON occupancy_events(lot_id, ts)")

        # Reservations table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS reservations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                lot_id TEXT NOT NULL,
                slot_id TEXT,
                start_ts REAL NOT NULL,
                end_ts REAL NOT NULL,
                status TEXT NOT NULL, -- 'hold', 'confirmed', 'cancelled', 'expired'
                hold_expires_at REAL NOT NULL,
                pin_code TEXT NOT NULL,
                qr_payload TEXT NOT NULL,
                idem_key TEXT UNIQUE,
                created_at REAL NOT NULL,
                FOREIGN KEY (lot_id) REFERENCES lots(id)
            )
        """)

        # Street reports (Spot Spotter crowdsourcing)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS street_reports (
                id TEXT PRIMARY KEY,
                reporter_id TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                accuracy_m REAL NOT NULL,
                street_name TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                status TEXT NOT NULL, -- 'open', 'claimed', 'confirmed', 'expired', 'disputed'
                claimer_id TEXT,
                points_awarded INTEGER DEFAULT 0
            )
        """)

        # Points Ledger (Append-only)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS points_ledger (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                delta INTEGER NOT NULL,
                reason TEXT NOT NULL,
                ref_id TEXT,
                created_at REAL NOT NULL
            )
        """)

        # User trust
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_trust (
                user_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                score REAL DEFAULT 85.0,
                total_reports INTEGER DEFAULT 0,
                accurate_reports INTEGER DEFAULT 0,
                updated_at REAL NOT NULL
            )
        """)

        # Hourly rollups for 30-day analytics and forecasting baseline
        await db.execute("""
            CREATE TABLE IF NOT EXISTS lot_stats_hourly (
                lot_id TEXT NOT NULL,
                day_of_week INTEGER NOT NULL, -- 0=Mon, 6=Sun
                hour_of_day INTEGER NOT NULL, -- 0-23
                avg_arrivals REAL NOT NULL,
                avg_exits REAL NOT NULL,
                avg_occupancy_ratio REAL NOT NULL,
                peak_occupancy_ratio REAL NOT NULL,
                PRIMARY KEY (lot_id, day_of_week, hour_of_day)
            )
        """)

        await db.commit()

        # Seed local fallback lots if lots table is empty
        async with db.execute("SELECT COUNT(*) FROM lots") as cursor:
            count = (await cursor.fetchone())[0]
            if count == 0:
                await seed_database(db)

        # Automatically sync latest lots from Supabase
        try:
            await sync_supabase_lots(db)
        except Exception as e:
            print(f"[Supabase Sync] Warning: Could not sync from Supabase: {e}")

async def sync_supabase_lots(db: aiosqlite.Connection) -> int:
    """Fetch all lots from Supabase parking_spots table and upsert them into SQLite"""
    sb_url = getattr(settings, "SUPABASE_URL", None)
    sb_key = getattr(settings, "SUPABASE_KEY", None)
    if not sb_url or not sb_key:
        return 0

    url = f"{sb_url.rstrip('/')}/rest/v1/parking_spots?select=*"
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                print(f"[Supabase Sync] Error {resp.status_code}: {resp.text}")
                return 0
            rows = resp.json()
    except Exception as exc:
        print(f"[Supabase Sync] Connection error: {exc}")
        return 0

    synced_count = 0
    now = time.time()
    for r in rows:
        lot_id = str(r["id"])
        name = r.get("name", "Unknown Lot")
        lat = float(r.get("latitude", settings.DEFAULT_LAT))
        lng = float(r.get("longitude", settings.DEFAULT_LNG))
        address = r.get("address") or ""
        price_per_hr = float(r.get("price_per_hour", 30.0))
        total_slots = int(r.get("total_slots", 50))
        available_slots = int(r.get("available_slots", max(1, int(total_slots * 0.3))))

        # Features
        features = ["cctv"]
        if r.get("is_covered"):
            features.append("covered")
        if r.get("has_ev"):
            features.append("ev")
        if "guard" in str(r.get("security_level", "")).lower():
            features.append("valet")
        features.append("disabled")

        operator_id = f"op-sb-{lot_id[:8]}"

        # Upsert lot
        await db.execute("""
            INSERT INTO lots (id, name, lat, lng, address, price_per_hr, total_slots, features, operator_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                lat = excluded.lat,
                lng = excluded.lng,
                address = excluded.address,
                price_per_hr = excluded.price_per_hr,
                total_slots = excluded.total_slots,
                features = excluded.features
        """, (
            lot_id, name, lat, lng, address, price_per_hr, total_slots,
            json.dumps(features), operator_id, now
        ))

        # Check if slots exist for this lot
        async with db.execute("SELECT COUNT(*) FROM slots WHERE lot_id = ?", (lot_id,)) as cur:
            slot_count = (await cur.fetchone())[0]

        if slot_count == 0:
            occupied_count = max(0, total_slots - available_slots)
            for i in range(1, total_slots + 1):
                slot_id = f"sb-{lot_id[:8]}-S{i:03d}"
                label = f"P-{i:02d}"
                slot_type = "ev" if (r.get("has_ev") and i <= 4) else "standard"
                status = "occupied" if i <= occupied_count else "free"
                await db.execute("""
                    INSERT INTO slots (id, lot_id, label, slot_type, status)
                    VALUES (?, ?, ?, ?, ?)
                """, (slot_id, lot_id, label, slot_type, status))

        # Check if lot_stats_hourly exist
        async with db.execute("SELECT COUNT(*) FROM lot_stats_hourly WHERE lot_id = ?", (lot_id,)) as cur:
            stat_count = (await cur.fetchone())[0]

        if stat_count == 0:
            for dow in range(7):
                is_weekend = dow in (5, 6)
                for hod in range(24):
                    if 0 <= hod <= 5:
                        base_ratio = 0.16
                        arrivals = 2.0
                        exits = 2.5
                    elif hod in (6, 7):
                        base_ratio = 0.35
                        arrivals = 7.0
                        exits = 4.0
                    elif hod == 8:
                        base_ratio = 0.60 if not is_weekend else 0.42
                        arrivals = 22.0
                        exits = 8.0
                    elif 9 <= hod <= 11:
                        base_ratio = 0.85 if not is_weekend else 0.68
                        arrivals = 30.0
                        exits = 16.0
                    elif 12 <= hod <= 14:
                        base_ratio = 0.75
                        arrivals = 20.0
                        exits = 20.0
                    elif 15 <= hod <= 16:
                        base_ratio = 0.72
                        arrivals = 17.0
                        exits = 17.0
                    elif 17 <= hod <= 19:
                        base_ratio = 0.92 if not is_weekend else 0.86
                        arrivals = 35.0
                        exits = 22.0
                    elif 20 <= hod <= 21:
                        base_ratio = 0.68
                        arrivals = 12.0
                        exits = 22.0
                    else:
                        base_ratio = 0.35
                        arrivals = 5.0
                        exits = 14.0

                    await db.execute("""
                        INSERT OR REPLACE INTO lot_stats_hourly (lot_id, day_of_week, hour_of_day, avg_arrivals, avg_exits, avg_occupancy_ratio, peak_occupancy_ratio)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        lot_id, dow, hod, arrivals, exits,
                        base_ratio, min(1.0, base_ratio + 0.08)
                    ))

        synced_count += 1

    await db.commit()
    print(f"[Supabase Sync] Successfully synced {synced_count} lots from Supabase into local database.")
    return synced_count

async def seed_database(db: aiosqlite.Connection):
    """Seed 18 realistic lots around Hyderabad (Hitech City, Madhapur, Financial District)"""
    seed_lots = [
        {
            "id": "lot-cyber-towers",
            "name": "Cyber Towers Multi-Level Parking",
            "lat": 17.4504,
            "lng": 78.3809,
            "address": "Opposite Cyber Gateway, Hitech City Main Rd",
            "price_per_hr": 40.0,
            "total_slots": 120,
            "features": ["covered", "ev", "disabled", "valet", "cctv"],
            "operator_id": "op-telangana-smart"
        },
        {
            "id": "lot-inorbit-mall",
            "name": "Inorbit Mall Deck Parking",
            "lat": 17.4338,
            "lng": 78.3862,
            "address": "Durgam Cheruvu View Rd, Vittal Rao Nagar",
            "price_per_hr": 50.0,
            "total_slots": 200,
            "features": ["covered", "ev", "valet", "cctv"],
            "operator_id": "op-inorbit-corp"
        },
        {
            "id": "lot-knowledge-city",
            "name": "Salarpuria Knowledge City Bay P1",
            "lat": 17.4387,
            "lng": 78.3812,
            "address": "Silpa Gram Craft Village, Madhapur",
            "price_per_hr": 60.0,
            "total_slots": 160,
            "features": ["covered", "ev", "disabled", "cctv"],
            "operator_id": "op-salarpuria"
        },
        {
            "id": "lot-raheja-mindspace",
            "name": "Raheja Mindspace Tech Park P3",
            "lat": 17.4429,
            "lng": 78.3754,
            "address": "Building 12B, Mindspace, Hitech City",
            "price_per_hr": 35.0,
            "total_slots": 150,
            "features": ["covered", "ev", "disabled"],
            "operator_id": "op-mindspace"
        },
        {
            "id": "lot-madhapur-metro",
            "name": "Madhapur Metro Station Commuter Lot",
            "lat": 17.4485,
            "lng": 78.3908,
            "address": "Metro Pillar 1250, Ayyappa Society",
            "price_per_hr": 25.0,
            "total_slots": 80,
            "features": ["cctv", "disabled"],
            "operator_id": "op-lt-metro"
        },
        {
            "id": "lot-hitech-metro",
            "name": "Hitec City Metro Smart Parking",
            "lat": 17.4487,
            "lng": 78.3828,
            "address": "Metro Station Gate 2, Hitech City",
            "price_per_hr": 30.0,
            "total_slots": 90,
            "features": ["covered", "ev", "cctv"],
            "operator_id": "op-lt-metro"
        },
        {
            "id": "lot-ikea-hub",
            "name": "IKEA Hub Surface & Underground",
            "lat": 17.4372,
            "lng": 78.3725,
            "address": "Raidurg, Serilingampally, Hitech City",
            "price_per_hr": 30.0,
            "total_slots": 250,
            "features": ["covered", "ev", "disabled", "valet", "cctv"],
            "operator_id": "op-ikea-retail"
        },
        {
            "id": "lot-dlf-cybercity",
            "name": "DLF Cybercity Gachibowli Plaza",
            "lat": 17.4496,
            "lng": 78.3582,
            "address": "Street Food Street, Gachibowli",
            "price_per_hr": 35.0,
            "total_slots": 110,
            "features": ["covered", "disabled", "cctv"],
            "operator_id": "op-dlf-props"
        },
        {
            "id": "lot-financial-district",
            "name": "WaveRock Financial District Bay",
            "lat": 17.4172,
            "lng": 78.3448,
            "address": "Nanakramguda, Financial District",
            "price_per_hr": 45.0,
            "total_slots": 180,
            "features": ["covered", "ev", "cctv"],
            "operator_id": "op-waverock"
        },
        {
            "id": "lot-durgam-lakefront",
            "name": "Durgam Cheruvu Cable Bridge View Lot",
            "lat": 17.4321,
            "lng": 78.3912,
            "address": "Cable Stayed Bridge Promenade",
            "price_per_hr": 40.0,
            "total_slots": 70,
            "features": ["cctv"],
            "operator_id": "op-hyderabad-parks"
        },
        {
            "id": "lot-jubilee-hills-rd36",
            "name": "Jubilee Hills Road No. 36 Commercial Lot",
            "lat": 17.4319,
            "lng": 78.4068,
            "address": "Road 36, Near Peddamma Temple Metro",
            "price_per_hr": 55.0,
            "total_slots": 95,
            "features": ["covered", "valet", "cctv"],
            "operator_id": "op-jubilee-merchants"
        },
        {
            "id": "lot-sarath-city",
            "name": "Sarath City Capital Mall Lower Basement",
            "lat": 17.4578,
            "lng": 78.3639,
            "address": "Whitefields, Kondapur Main Road",
            "price_per_hr": 50.0,
            "total_slots": 300,
            "features": ["covered", "ev", "disabled", "valet", "cctv"],
            "operator_id": "op-sarath-mall"
        },
        {
            "id": "lot-kondapur-rto",
            "name": "Kondapur Green Park & Ride",
            "lat": 17.4651,
            "lng": 78.3615,
            "address": "Near Botanical Garden, Kondapur",
            "price_per_hr": 20.0,
            "total_slots": 65,
            "features": ["disabled"],
            "operator_id": "op-ghmc"
        },
        {
            "id": "lot-one-golf-edge",
            "name": "One Golf Edge Financial Park",
            "lat": 17.4195,
            "lng": 78.3491,
            "address": "ISB Road, Financial District",
            "price_per_hr": 40.0,
            "total_slots": 100,
            "features": ["covered", "ev", "cctv"],
            "operator_id": "op-golfedge"
        },
        {
            "id": "lot-aig-hospital",
            "name": "AIG Hospital Visitor Deck",
            "lat": 17.4431,
            "lng": 78.3621,
            "address": "Gachibowli - Miyapur Rd, Mindspace",
            "price_per_hr": 30.0,
            "total_slots": 140,
            "features": ["covered", "disabled", "ev", "cctv"],
            "operator_id": "op-aig-health"
        },
        {
            "id": "lot-bio-diversity-park",
            "name": "Bio Diversity Junction Flyover Lot",
            "lat": 17.4358,
            "lng": 78.3712,
            "address": "Old Mumbai Hwy, Gachibowli",
            "price_per_hr": 25.0,
            "total_slots": 75,
            "features": ["cctv"],
            "operator_id": "op-ghmc"
        },
        {
            "id": "lot-t-hub-innovation",
            "name": "T-Hub Phase 2 Innovation Campus",
            "lat": 17.4385,
            "lng": 78.3845,
            "address": "Knowledge City, Raidurgam",
            "price_per_hr": 35.0,
            "total_slots": 120,
            "features": ["covered", "ev", "disabled", "cctv"],
            "operator_id": "op-thub"
        },
        {
            "id": "lot-kavuri-hills",
            "name": "Kavuri Hills Commercial Parking Hub",
            "lat": 17.4412,
            "lng": 78.3985,
            "address": "Madhapur Police Station Road",
            "price_per_hr": 30.0,
            "total_slots": 85,
            "features": ["covered", "cctv"],
            "operator_id": "op-kavuri"
        }
    ]

    now = time.time()
    for lot in seed_lots:
        await db.execute("""
            INSERT INTO lots (id, name, lat, lng, address, price_per_hr, total_slots, features, operator_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            lot["id"], lot["name"], lot["lat"], lot["lng"], lot["address"],
            lot["price_per_hr"], lot["total_slots"], json.dumps(lot["features"]),
            lot["operator_id"], now
        ))

        # Seed initial slots
        total = lot["total_slots"]
        # Distribute occupancy realistic: 45% - 80% full
        initial_occupancy_ratio = random.uniform(0.40, 0.75)
        occupied_count = int(total * initial_occupancy_ratio)

        for i in range(1, total + 1):
            slot_id = f"{lot['id']}-S{i:03d}"
            label = f"{chr(65 + ((i - 1) // 30))}{((i - 1) % 30) + 1}"
            
            if i <= int(total * 0.15):
                slot_type = "ev"
            elif i <= int(total * 0.22):
                slot_type = "handicap"
            else:
                slot_type = "standard"

            status = "occupied" if i <= occupied_count else "free"
            
            await db.execute("""
                INSERT INTO slots (id, lot_id, label, slot_type, status)
                VALUES (?, ?, ?, ?, ?)
            """, (slot_id, lot["id"], label, slot_type, status))

        # Seed realistic initial occupancy entry events to back the count
        for i in range(1, occupied_count + 1):
            event_id = f"evt-init-{lot['id']}-{i}"
            slot_id = f"{lot['id']}-S{i:03d}"
            event_time = now - random.uniform(300, 7200)
            await db.execute("""
                INSERT INTO occupancy_events (id, lot_id, slot_id, event_type, ts, source, idem_key)
                VALUES (?, ?, ?, 'entry', ?, 'sensor', ?)
            """, (event_id, lot["id"], slot_id, event_time, f"idem-init-{lot['id']}-{i}"))

        # Seed 30-day hourly synthetic patterns for forecasting & analytics
        for dow in range(7):
            for hod in range(24):
                # Peak hours 9-11 AM and 5-8 PM on weekdays
                is_weekend = dow in (5, 6)
                if 9 <= hod <= 11 or 17 <= hod <= 20:
                    base_ratio = 0.82 if not is_weekend else 0.70
                    arrivals = random.uniform(18, 35)
                    exits = random.uniform(10, 25)
                elif 12 <= hod <= 16:
                    base_ratio = 0.65
                    arrivals = random.uniform(12, 22)
                    exits = random.uniform(12, 22)
                elif 0 <= hod <= 6:
                    base_ratio = 0.15
                    arrivals = random.uniform(1, 4)
                    exits = random.uniform(2, 6)
                else:
                    base_ratio = 0.45
                    arrivals = random.uniform(8, 15)
                    exits = random.uniform(6, 14)

                await db.execute("""
                    INSERT INTO lot_stats_hourly (lot_id, day_of_week, hour_of_day, avg_arrivals, avg_exits, avg_occupancy_ratio, peak_occupancy_ratio)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    lot["id"], dow, hod, round(arrivals, 1), round(exits, 1),
                    round(base_ratio, 3), round(min(1.0, base_ratio + 0.12), 3)
                ))

    # Seed users and trust scores
    users = [
        ("usr-rahul-01", "Rahul Sharma (You - Driver)", 94.5, 32, 31),
        ("usr-priya-02", "Priya Verma (Spotter)", 98.0, 54, 53),
        ("usr-arjun-03", "Arjun Reddy (Spotter)", 88.0, 18, 16),
        ("usr-ananya-04", "Ananya Rao (Driver)", 91.0, 24, 22)
    ]
    for uid, uname, score, total_rep, acc_rep in users:
        await db.execute("""
            INSERT INTO user_trust (user_id, name, score, total_reports, accurate_reports, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (uid, uname, score, total_rep, acc_rep, now))

    # Initial points ledger entries
    points_seed = [
        ("ledger-01", "usr-rahul-01", 150, "Spot report confirmed at Cyber Towers", "spot-01", now - 3600),
        ("ledger-02", "usr-priya-02", 320, "Early vacating notification reward", "spot-02", now - 7200),
        ("ledger-03", "usr-arjun-03", 80, "Spot verified near Inorbit", "spot-03", now - 14400)
    ]
    for lid, uid, delta, reason, ref, pts_now in points_seed:
        await db.execute("""
            INSERT INTO points_ledger (id, user_id, delta, reason, ref_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (lid, uid, delta, reason, ref, pts_now))

    # Seed initial open street spots (Spot Spotter)
    street_spots = [
        ("street-spot-1", "usr-priya-02", 17.4498, 78.3815, 8.5, "Cyber Towers Service Rd (Bay 3)", now, now + settings.STREET_REPORT_TTL_SECONDS, "open", None, 0),
        ("street-spot-2", "usr-arjun-03", 17.4352, 78.3840, 12.0, "Durgam Cheruvu Walking Track East", now - 60, now - 60 + settings.STREET_REPORT_TTL_SECONDS, "open", None, 0),
        ("street-spot-3", "usr-priya-02", 17.4418, 78.3742, 6.0, "Mindspace Backgate Curbside", now - 120, now - 120 + settings.STREET_REPORT_TTL_SECONDS, "open", None, 0)
    ]
    for sid, r_id, slat, slng, acc, sname, c_at, exp_at, stat, claimer, pts in street_spots:
        await db.execute("""
            INSERT INTO street_reports (id, reporter_id, lat, lng, accuracy_m, street_name, created_at, expires_at, status, claimer_id, points_awarded)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (sid, r_id, slat, slng, acc, sname, c_at, exp_at, stat, claimer, pts))

    await db.commit()
