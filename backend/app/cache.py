import asyncio
import time
import json
from typing import Dict, Any, Set, Optional, Callable

class MemoryCacheManager:
    """
    In-memory async Redis-compatible key-value cache with TTL expiration,
    atomic holds (SET NX EX), and pub/sub viewport-scoped broadcasting.
    """
    def __init__(self):
        self._store: Dict[str, Any] = {}
        self._expirations: Dict[str, float] = {}
        self._listeners: Set[asyncio.Queue] = set()
        self._lot_free_slots: Dict[str, int] = {}
        self._lot_rates: Dict[str, Dict[str, float]] = {} # EWMA rates: arrival_rate, exit_rate, last_update
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            if key in self._expirations and time.time() > self._expirations[key]:
                self._store.pop(key, None)
                self._expirations.pop(key, None)
                return None
            return self._store.get(key)

    async def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        async with self._lock:
            self._store[key] = value
            if ex:
                self._expirations[key] = time.time() + ex
            else:
                self._expirations.pop(key, None)
            return True

    async def set_nx_ex(self, key: str, value: Any, ex: int) -> bool:
        """Atomic SET NX EX: sets only if key does not exist or has expired"""
        async with self._lock:
            now = time.time()
            if key in self._expirations and now > self._expirations[key]:
                self._store.pop(key, None)
                self._expirations.pop(key, None)
            
            if key in self._store:
                return False  # Already exists!
            
            self._store[key] = value
            self._expirations[key] = now + ex
            return True

    async def delete(self, key: str) -> bool:
        async with self._lock:
            self._store.pop(key, None)
            self._expirations.pop(key, None)
            return True

    # Real-time lot availability fast cache
    def set_lot_availability(self, lot_id: str, free_slots: int):
        self._lot_free_slots[lot_id] = max(0, free_slots)

    def get_lot_availability(self, lot_id: str) -> Optional[int]:
        return self._lot_free_slots.get(lot_id)

    def update_ewma_rates(self, lot_id: str, event_type: str, alpha: float = 0.2):
        """Update Exponentially Weighted Moving Average (EWMA) arrival/exit velocity"""
        now = time.time()
        if lot_id not in self._lot_rates:
            self._lot_rates[lot_id] = {
                "arrival_rate": 0.2, # events per min
                "exit_rate": 0.15,
                "last_update": now
            }
        rates = self._lot_rates[lot_id]
        dt = max(1.0, (now - rates["last_update"]) / 60.0) # elapsed minutes
        instant_rate = 1.0 / dt

        if event_type == "entry":
            rates["arrival_rate"] = alpha * instant_rate + (1 - alpha) * rates["arrival_rate"]
        elif event_type == "exit":
            rates["exit_rate"] = alpha * instant_rate + (1 - alpha) * rates["exit_rate"]
        rates["last_update"] = now

    def get_ewma_rates(self, lot_id: str) -> Dict[str, float]:
        return self._lot_rates.get(lot_id, {"arrival_rate": 0.2, "exit_rate": 0.15, "last_update": time.time()})

    # WebSocket Pub/Sub
    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self._listeners.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self._listeners.discard(q)

    async def publish(self, channel: str, message: Dict[str, Any]):
        """Publish real-time message to all active WebSocket listener queues"""
        payload = {"channel": channel, "data": message, "timestamp": time.time()}
        dead_queues = []
        for q in list(self._listeners):
            try:
                q.put_nowait(payload)
            except Exception:
                dead_queues.append(q)
        for dq in dead_queues:
            self._listeners.discard(dq)

cache = MemoryCacheManager()
