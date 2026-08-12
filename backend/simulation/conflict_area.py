from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

try:
    from .data_loader import load_json
except ImportError:
    from data_loader import load_json


def point_in_polygon(point: Tuple[float, float], polygon: List[List[float]]) -> bool:
    x, z = point
    inside = False
    previous = polygon[-1]
    for current in polygon:
        if (current[1] > z) != (previous[1] > z):
            crossing = (previous[0] - current[0]) * (z - current[1]) / (previous[1] - current[1]) + current[0]
            if x < crossing:
                inside = not inside
        previous = current
    return inside


class ConflictAreaManager:
    """Track occupancy transitions and PET in authored/derived conflict areas."""

    def __init__(self, path: str | Path) -> None:
        payload = load_json(path) if Path(path).exists() else {"conflict_areas": []}
        self.areas = {str(area["conflict_area_id"]): dict(area) for area in payload.get("conflict_areas", [])}
        self.inside: Dict[Tuple[str, str], bool] = {}
        self.entry_time: Dict[Tuple[str, str], float] = {}
        self.last_exit: Dict[str, List[Dict]] = defaultdict(list)

    def reset(self) -> None:
        self.inside.clear()
        self.entry_time.clear()
        self.last_exit.clear()

    def update(self, entities: Iterable[Dict], simulation_time: float) -> None:
        active = [entity for entity in entities if entity.get("active") and entity.get("visible", True)]
        for entity in active:
            entity["conflict_area_id"] = None
            entity["current_pet"] = None
            entity["conflict_area_overlap"] = False
        for area_id, area in self.areas.items():
            polygon = area.get("geometry", {}).get("coordinates", [[]])[0]
            if len(polygon) < 3:
                continue
            occupants = [entity for entity in active if point_in_polygon((float(entity["x"]), float(entity["z"])), polygon)]
            occupant_ids = {str(entity["id"]) for entity in occupants}
            for entity in occupants:
                entity_id = str(entity["id"])
                key = area_id, entity_id
                entity["conflict_area_id"] = area_id
                if not self.inside.get(key, False):
                    self.inside[key] = True
                    self.entry_time[key] = simulation_time
                    previous = next((item for item in reversed(self.last_exit[area_id]) if item["agent_id"] != entity_id), None)
                    if previous:
                        entity["current_pet"] = simulation_time - float(previous["time"])
                if len(occupants) > 1:
                    entity["conflict_area_overlap"] = True
                    entity["current_pet"] = 0.0
            for (known_area, entity_id), was_inside in list(self.inside.items()):
                if known_area != area_id or not was_inside or entity_id in occupant_ids:
                    continue
                self.inside[(known_area, entity_id)] = False
                self.last_exit[area_id].append({"agent_id": entity_id, "time": simulation_time})
                self.last_exit[area_id] = self.last_exit[area_id][-20:]
