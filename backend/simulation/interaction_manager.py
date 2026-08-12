from __future__ import annotations

import math
from typing import Dict, Iterable

try:
    from .risk_engine import RiskEngine
    from .spatial_index import UniformSpatialGrid
except ImportError:
    from risk_engine import RiskEngine
    from spatial_index import UniformSpatialGrid


STATE_PRIORITY = {"NONE": 0, "APPROACHING": 1, "FOLLOWING": 2, "CROSSING": 3, "AVOIDING": 4, "BRAKING": 5, "CONFLICT": 6}


class InteractionManager:
    """Translate microscopic pair interactions into per-agent speed constraints."""

    def __init__(self, risk_engine: RiskEngine) -> None:
        self.risk_engine = risk_engine
        self.spatial_index = UniformSpatialGrid(cell_size=max(5.0, risk_engine.interaction_search_radius))

    @staticmethod
    def _set_state(entity: Dict, state: str) -> None:
        if STATE_PRIORITY[state] > STATE_PRIORITY.get(str(entity.get("interaction_state", "NONE")), 0):
            entity["interaction_state"] = state

    @staticmethod
    def _distance(first: Dict, second: Dict) -> float:
        return math.hypot(float(second["x"]) - float(first["x"]), float(second["z"]) - float(first["z"]))

    def speed_constraints(self, entities: Iterable[Dict], base_targets: Dict[str, float]) -> Dict[str, float]:
        active = [entity for entity in entities if entity.get("active") and entity.get("trip_status") == "MOVING"]
        targets = dict(base_targets)
        for entity in active:
            entity["interaction_state"] = "NONE"

        for first, second in self.spatial_index.pairs(active, self.risk_engine.interaction_search_radius):
            metrics = self.risk_engine.calculate_pair(
                first, second, self.risk_engine.prediction_horizon, self.risk_engine.intersection_time_tolerance,
                self.risk_engine.collision_radius,
            )
            if metrics is None or metrics["distance"] > self.risk_engine.interaction_search_radius:
                continue
            interaction = metrics["interaction_state"]
            clearance = max(0.0, float(metrics.get("distance", 0)) - float(metrics.get("collision_envelope", 0)))
            self._set_state(first, interaction)
            self._set_state(second, interaction)
            types = {first["type"], second["type"]}

            # Car-following: constrain only the rear vehicle. The heading
            # projection avoids stopping a parallel/opposite lane vehicle.
            if first["type"] == second["type"] == "car" and interaction == "FOLLOWING":
                for follower, leader in ((first, second), (second, first)):
                    heading = math.radians(float(follower["heading"]))
                    forward = math.sin(heading), math.cos(heading)
                    offset = float(leader["x"]) - float(follower["x"]), float(leader["z"]) - float(follower["z"])
                    longitudinal = offset[0] * forward[0] + offset[1] * forward[1]
                    lateral = abs(offset[0] * forward[1] - offset[1] * forward[0])
                    if 0 < longitudinal < 9 and lateral < 2.5:
                        targets[follower["id"]] = min(targets[follower["id"]], max(0.0, float(leader["speed"]) * (longitudinal / 9)))
                        self._set_state(follower, "BRAKING")

            if types == {"car", "scooter"} and (metrics["approaching"] or metrics["predicted_path_intersection"]):
                car = first if first["type"] == "car" else second
                factor = max(0.0, min(1.0, (clearance - 1.0) / 8.0))
                if metrics.get("ttc") is not None and metrics["ttc"] <= 2.0:
                    factor = 0.0
                targets[car["id"]] = min(targets[car["id"]], float(car["desired_speed"]) * factor)
                self._set_state(car, "BRAKING" if factor < 0.45 else "APPROACHING")
                scooter = second if car is first else first
                if metrics["predicted_path_intersection"]:
                    targets[scooter["id"]] = min(targets[scooter["id"]], float(scooter["desired_speed"]) * 0.55)
                    self._set_state(scooter, "AVOIDING")

            if types == {"car", "person"} and (metrics["approaching"] or metrics["predicted_path_intersection"]):
                car = first if first["type"] == "car" else second
                person = second if car is first else first
                if person.get("in_crosswalk") or person.get("pedestrian_state") in {"CROSSING", "JAYWALKING"} or metrics["predicted_path_intersection"]:
                    factor = max(0.0, min(1.0, (clearance - 0.5) / 7.0))
                    if metrics.get("ttc") is not None and metrics["ttc"] <= 2.0:
                        factor = 0.0
                    targets[car["id"]] = min(targets[car["id"]], float(car["desired_speed"]) * factor)
                    self._set_state(car, "BRAKING")

            if types == {"person", "scooter"}:
                scooter = first if first["type"] == "scooter" else second
                if metrics["approaching"] or metrics["predicted_path_intersection"] or clearance < 3:
                    factor = max(0.0, min(1.0, clearance / 4.0))
                    if metrics.get("ttc") is not None and metrics["ttc"] <= 1.5:
                        factor = 0.0
                    targets[scooter["id"]] = min(targets[scooter["id"]], float(scooter["desired_speed"]) * factor)
                    self._set_state(scooter, "AVOIDING")

            # Pedestrian separation: a following pedestrian yields briefly
            # instead of occupying the exact same point.
            if first["type"] == second["type"] == "person" and metrics["distance"] < 1.2:
                slower = first if first["id"] > second["id"] else second
                targets[slower["id"]] = min(targets[slower["id"]], 0.25)
                self._set_state(slower, "AVOIDING")

            if metrics.get("minimum_clearance", metrics["minimum_distance"]) <= self.risk_engine.near_miss_distance and metrics["approaching"]:
                self._set_state(first, "CONFLICT")
                self._set_state(second, "CONFLICT")
        return targets
