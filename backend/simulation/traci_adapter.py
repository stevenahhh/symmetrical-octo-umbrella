from __future__ import annotations

import os
from typing import Tuple

try:
    from .providers import InternalSimulationProvider, SimulationProvider, SumoSimulationProvider
except ImportError:
    from providers import InternalSimulationProvider, SimulationProvider, SumoSimulationProvider


def create_provider() -> Tuple[SimulationProvider, str]:
    selected = os.getenv("SIMULATION_PROVIDER", "internal").lower()
    if selected == "sumo":
        try:
            return SumoSimulationProvider(), "SUMO/TraCI 공급자를 사용합니다."
        except RuntimeError as exc:
            return InternalSimulationProvider(), str(exc)
    return InternalSimulationProvider(), "내부 OD/Graph 시뮬레이터를 사용합니다."


__all__ = ["SimulationProvider", "InternalSimulationProvider", "SumoSimulationProvider", "create_provider"]
