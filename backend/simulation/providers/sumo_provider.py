from __future__ import annotations

import asyncio
import os
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

from .base_provider import SimulationProvider
try:
    from ..coordinate_transform import CoordinateTransform
except ImportError:  # Supports: cd simulation && uvicorn main:app
    from coordinate_transform import CoordinateTransform


class SumoSimulationProvider(SimulationProvider):
    """Optional TraCI adapter; importing the project never requires SUMO."""

    def __init__(self, binary: str | None = None, config_path: str | None = None) -> None:
        self.binary = binary or os.getenv("SUMO_BINARY", "sumo")
        default_config = Path(__file__).resolve().parents[1] / "sumo" / "campus.sumocfg"
        self.config_path = config_path or os.getenv("SUMO_CONFIG_PATH", str(default_config))
        resolved = shutil.which(self.binary)
        if not resolved:
            raise RuntimeError(f"SUMO binary를 찾을 수 없습니다: {self.binary}. 내부 시뮬레이터를 사용합니다.")
        self.binary = resolved
        self.config_path = str(Path(self.config_path).expanduser().resolve())
        if not Path(self.config_path).exists():
            raise RuntimeError(f"SUMO config를 찾을 수 없습니다: {self.config_path}. 내부 시뮬레이터를 사용합니다.")
        try:
            config_root = ET.parse(self.config_path).getroot()
            net_value = config_root.find("./input/net-file")
            if net_value is None or not net_value.get("value"):
                raise RuntimeError("SUMO config에 net-file이 없습니다. 내부 시뮬레이터를 사용합니다.")
            net_path = (Path(self.config_path).parent / net_value.get("value", "")).resolve()
            if not net_path.exists():
                raise RuntimeError(
                    f"SUMO network를 찾을 수 없습니다: {net_path}. "
                    "권위 있는 교통망을 구축한 뒤 prepare_sumo를 다시 실행하세요."
                )
        except ET.ParseError as exc:
            raise RuntimeError(f"SUMO config XML을 읽을 수 없습니다: {self.config_path}") from exc
        try:
            import traci  # type: ignore
        except ImportError as exc:
            raise RuntimeError("SUMO/TraCI가 설치되지 않아 내부 시뮬레이터를 사용합니다.") from exc
        self.traci = traci
        self.running = False
        transform_path = Path(__file__).resolve().parents[1] / "data" / "coordinate_transform.json"
        self.transform = CoordinateTransform.from_file(transform_path)

    async def start(self):
        if not self.running:
            await asyncio.to_thread(self.traci.start, [self.binary, "-c", self.config_path, "--start", "--quit-on-end"])
            self.running = True

    async def stop(self):
        if self.running:
            await asyncio.to_thread(self.traci.close)
            self.running = False

    async def pause(self):
        return None

    async def reset(self):
        await self.stop()

    async def step(self, delta_time: float):
        if self.running:
            await asyncio.to_thread(self.traci.simulationStep)

    async def get_entities(self):
        if not self.running:
            return []
        entities = []
        for vehicle_id in self.traci.vehicle.getIDList():
            sx, sz = self.traci.vehicle.getPosition(vehicle_id)
            x, z = self.transform.sumo_to_simulation(sx, sz)
            type_id = str(self.traci.vehicle.getTypeID(vehicle_id))
            agent_type = "scooter" if "scooter" in type_id.lower() else "car"
            entities.append({
                "id": vehicle_id, "agent_id": vehicle_id, "type": agent_type, "agent_type": agent_type,
                "x": x, "y": 0, "z": z, "speed": self.traci.vehicle.getSpeed(vehicle_id),
                "heading": self.traci.vehicle.getAngle(vehicle_id), "trip_status": "MOVING",
                "risk_level": "normal", "interaction_state": "NONE", "current_edge": self.traci.vehicle.getRoadID(vehicle_id),
            })
        for person_id in self.traci.person.getIDList():
            sx, sz = self.traci.person.getPosition(person_id)
            x, z = self.transform.sumo_to_simulation(sx, sz)
            entities.append({
                "id": person_id, "agent_id": person_id, "type": "person", "agent_type": "person",
                "x": x, "y": 0, "z": z, "speed": self.traci.person.getSpeed(person_id),
                "heading": self.traci.person.getAngle(person_id), "trip_status": "MOVING",
                "risk_level": "normal", "interaction_state": "NONE", "current_edge": self.traci.person.getRoadID(person_id),
            })
        return entities

    async def get_traffic_lights(self):
        return [] if not self.running else [
            {"signal_id": signal_id, "state": self.traci.trafficlight.getRedYellowGreenState(signal_id)}
            for signal_id in self.traci.trafficlight.getIDList()
        ]
