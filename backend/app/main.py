import asyncio
import json
from contextlib import asynccontextmanager
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.cache import cache
from app.services.occupancy import initialize_occupancy_cache

# Routers
from app.routers.lots import router as lots_router
from app.routers.events import router as events_router
from app.routers.reservations import router as reservations_router
from app.routers.street import router as street_router
from app.routers.routing import router as routing_router
from app.routers.agent import router as agent_router
from app.routers.analytics import router as analytics_router
from app.routers.sim import router as sim_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize SQLite tables, load seed lots and populate cache
    await init_db()
    await initialize_occupancy_cache()
    yield
    # Shutdown
    from app.services.simulator import simulator
    await simulator.stop()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(lots_router)
app.include_router(events_router)
app.include_router(reservations_router)
app.include_router(street_router)
app.include_router(routing_router)
app.include_router(agent_router)
app.include_router(analytics_router)
app.include_router(sim_router)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME, "version": settings.VERSION}

@app.post("/api/sync/supabase")
async def trigger_supabase_sync():
    from app.database import get_db_connection, sync_supabase_lots
    async with await get_db_connection() as db:
        synced = await sync_supabase_lots(db)
    await initialize_occupancy_cache()
    return {"status": "success", "synced_count": synced}

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time WebSocket endpoint with viewport subscriptions and pub/sub broadcasting.
    Clients receive instant diffs for lots, reservations, and street spotter claims.
    """
    await websocket.accept()
    q = cache.subscribe()
    try:
        # Send initial handshake
        await websocket.send_json({
            "type": "connection_ack",
            "message": "Connected to Smart Parking Live Telemetry Stream"
        })

        async def listen_client():
            try:
                while True:
                    data = await websocket.receive_text()
                    # Client can update its bounding box or request sync
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
            except (WebSocketDisconnect, asyncio.CancelledError):
                pass

        client_task = asyncio.create_task(listen_client())

        while True:
            # Wait for pub/sub message from cache
            msg = await q.get()
            await websocket.send_json(msg)

    except (WebSocketDisconnect, Exception):
        pass
    finally:
        cache.unsubscribe(q)
        if 'client_task' in locals() and not client_task.done():
            client_task.cancel()

if __name__ == "__main__":
    # pyrefly: ignore [missing-import]
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
