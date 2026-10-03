import asyncio
import random
import time
from typing import Dict, Any, Optional
from app.services.occupancy import record_occupancy_event
from app.services.spotter import report_vacating_spot

class IoTStreamSimulator:
    def __init__(self):
        self.active_task: Optional[asyncio.Task] = None
        self.scenario_name: str = "idle"
        self.speed_multiplier: float = 5.0
        self.is_running: bool = False

    async def start_scenario(self, scenario: str, speed_multiplier: float = 5.0):
        await self.stop()
        self.scenario_name = scenario
        self.speed_multiplier = max(1.0, min(20.0, speed_multiplier))
        self.is_running = True
        self.active_task = asyncio.create_task(self._run_loop(scenario))

    async def stop(self):
        self.is_running = False
        if self.active_task and not self.active_task.done():
            self.active_task.cancel()
            try:
                await self.active_task
            except asyncio.CancelledError:
                pass
        self.active_task = None
        self.scenario_name = "idle"

    async def _run_loop(self, scenario: str):
        try:
            if scenario == "rush_hour":
                await self._run_rush_hour()
            elif scenario == "event_ends":
                await self._run_event_ends()
            elif scenario == "lot_full":
                await self._run_lot_full()
            elif scenario == "street_wave":
                await self._run_street_wave()
            else:
                # Default background gentle traffic
                await self._run_gentle_traffic()
        except asyncio.CancelledError:
            pass
        finally:
            self.is_running = False

    async def _run_rush_hour(self):
        """Surge arrivals at Cyber Towers, Inorbit Mall, and Knowledge City"""
        target_lots = ["lot-cyber-towers", "lot-inorbit-mall", "lot-knowledge-city"]
        interval = max(0.2, 2.5 / self.speed_multiplier)
        
        for _ in range(40):
            lot = random.choice(target_lots)
            # 85% entries, 15% exits to drive occupancy rapidly upwards
            ev_type = "entry" if random.random() < 0.88 else "exit"
            await record_occupancy_event(lot_id=lot, event_type=ev_type, source="simulator")
            await asyncio.sleep(interval)

    async def _run_event_ends(self):
        """Mass exits from Inorbit Mall Deck & Knowledge City, freeing slots"""
        target_lots = ["lot-inorbit-mall", "lot-cyber-towers"]
        interval = max(0.2, 2.0 / self.speed_multiplier)
        
        for _ in range(35):
            lot = random.choice(target_lots)
            # 92% exits
            ev_type = "exit" if random.random() < 0.92 else "entry"
            await record_occupancy_event(lot_id=lot, event_type=ev_type, source="simulator")
            await asyncio.sleep(interval)

    async def _run_lot_full(self):
        """Forces Cyber Towers rapidly to 100% capacity"""
        target_lot = "lot-cyber-towers"
        interval = max(0.15, 1.2 / self.speed_multiplier)
        
        for _ in range(25):
            await record_occupancy_event(lot_id=target_lot, event_type="entry", source="simulator")
            await asyncio.sleep(interval)

    async def _run_street_wave(self):
        """Spawns 4 distinct street spot vacating alerts across Madhapur & Hitech City"""
        spots_to_emit = [
            ("usr-priya-02", 17.4495, 78.3820, "Cyber Gateway Service Lane"),
            ("usr-arjun-03", 17.4435, 78.3760, "Mindspace Phase 2 Gate 3"),
            ("usr-ananya-04", 17.4365, 78.3880, "Durgam Cheruvu Walking Promenade"),
            ("usr-priya-02", 17.4520, 78.3790, "Hitech City Flyover Underpass")
        ]
        
        interval = max(0.5, 3.0 / self.speed_multiplier)
        for uid, slat, slng, sname in spots_to_emit:
            await report_vacating_spot(reporter_id=uid, lat=slat, lng=slng, street_name=sname, accuracy_m=random.uniform(5.0, 14.0))
            await asyncio.sleep(interval)

    async def _run_gentle_traffic(self):
        lots = ["lot-cyber-towers", "lot-inorbit-mall", "lot-knowledge-city", "lot-raheja-mindspace", "lot-hitech-metro"]
        while self.is_running:
            lot = random.choice(lots)
            ev_type = "entry" if random.random() < 0.55 else "exit"
            await record_occupancy_event(lot_id=lot, event_type=ev_type, source="simulator")
            await asyncio.sleep(max(0.5, 4.0 / self.speed_multiplier))

    def get_status(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "scenario": self.scenario_name,
            "speed_multiplier": self.speed_multiplier
        }

simulator = IoTStreamSimulator()
