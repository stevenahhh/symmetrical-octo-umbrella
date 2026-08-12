from __future__ import annotations

from abc import ABC, abstractmethod


class SimulationProvider(ABC):
    """Frontend-stable contract shared by Internal and future SUMO engines."""

    @abstractmethod
    async def start(self): ...

    @abstractmethod
    async def stop(self): ...

    @abstractmethod
    async def pause(self): ...

    @abstractmethod
    async def reset(self): ...

    @abstractmethod
    async def step(self, delta_time: float): ...

    @abstractmethod
    async def get_entities(self): ...

    @abstractmethod
    async def get_traffic_lights(self): ...
