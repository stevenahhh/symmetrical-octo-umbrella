from __future__ import annotations

import os

from .base_provider import SimulationProvider
try:
    from ..simulation_engine import SimulationEngine
except ImportError:  # Supports: cd simulation && uvicorn main:app
    from simulation_engine import SimulationEngine


class InternalSimulationProvider(SimulationProvider):
    def __init__(self, engine: SimulationEngine | None = None) -> None:
        data_dir = os.getenv("SIMULATION_DATA_DIR")
        self.engine = engine or (SimulationEngine(data_dir) if data_dir else SimulationEngine())

    async def start(self): self.engine.start()
    async def stop(self): self.engine.stop()
    async def pause(self): self.engine.pause()
    async def reset(self): self.engine.reset()
    async def step(self, delta_time: float): self.engine.step(delta_time)
    async def get_entities(self): return self.engine.entity_list()
    async def get_traffic_lights(self): return [dict(value) for value in self.engine.traffic_lights]
