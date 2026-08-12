from __future__ import annotations

import math
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Deque, Dict, Iterable, List, Optional, Tuple

try:
    from .data_loader import load_json
    from .spatial_index import UniformSpatialGrid
except ImportError:
    from data_loader import load_json
    from spatial_index import UniformSpatialGrid


PAIR_TYPES = {
    frozenset(("car", "person")): "car_pedestrian_conflict",
    frozenset(("car", "scooter")): "car_scooter_conflict",
    frozenset(("scooter", "person")): "scooter_pedestrian_conflict",
    frozenset(("car",)): "car_car_conflict",
    frozenset(("scooter",)): "scooter_scooter_conflict",
}

DESCRIPTIONS = {
    "car_pedestrian_conflict": "자동차와 보행자의 충돌 위험이 감지되었습니다.",
    "car_scooter_conflict": "자동차와 킥보드의 충돌 위험이 감지되었습니다.",
    "scooter_pedestrian_conflict": "킥보드와 보행자의 충돌 위험이 감지되었습니다.",
    "car_car_conflict": "자동차 간 추돌 위험이 감지되었습니다.",
    "scooter_scooter_conflict": "킥보드 간 충돌 위험이 감지되었습니다.",
}

DEFAULT_DIMENSIONS = {
    "car": {"shape": "oriented_box", "length": 4.5, "width": 1.8},
    "person": {"shape": "circle", "radius": 0.35},
    "scooter": {"shape": "capsule", "length": 1.8, "width": 0.65},
}


class RiskEngine:
    def __init__(self, config_path: str | Path) -> None:
        config = load_json(config_path)
        self.distance_thresholds = config["distance_thresholds"]
        self.ttc_thresholds = config["ttc_thresholds"]
        self.speed_limits = config.get("speed_limits", {})
        self.hard_braking_threshold = float(config.get("hard_braking_threshold", 3.5))
        self.prediction_horizon = float(config.get("prediction_horizon_seconds", 6))
        self.prediction_step = float(config.get("prediction_step_seconds", 0.25))
        self.interaction_search_radius = float(config.get("interaction_search_radius", 15))
        self.risk_search_radius = float(config.get("risk_search_radius", 60))
        self.intersection_time_tolerance = float(config.get("path_intersection_time_tolerance", 2))
        self.near_miss_distance = float(config.get("near_miss_distance", 1.25))
        self.near_miss_ttc = float(config.get("near_miss_ttc", 3))
        self.collision_radius = float(config.get("collision_radius", 0.75))
        configured_dimensions = config.get("agent_dimensions") or {}
        self.agent_dimensions = {key: {**value, **configured_dimensions.get(key, {})} for key, value in DEFAULT_DIMENSIONS.items()}
        self.cooldown = float(config.get("event_cooldown_seconds", 3))
        self.events: Deque[Dict] = deque(maxlen=int(config.get("max_events", 200)))
        self._last_event_time: Dict[Tuple[str, str], float] = {}
        self._counter = 0
        self.weather = {"rain": False, "wind_speed": 0.0, "night": False}
        self.spatial_index = UniformSpatialGrid(cell_size=max(10.0, self.risk_search_radius / 2))
        self.last_broad_phase = {"candidate_pairs": 0, "nearby_pairs": 0}

    def reset(self) -> None:
        self.events.clear()
        self._last_event_time.clear()
        self._counter = 0

    def set_weather(self, weather: Dict | None) -> None:
        if weather:
            self.weather.update(weather)

    @staticmethod
    def velocity(entity: Dict) -> Tuple[float, float]:
        heading = math.radians(float(entity.get("heading", 0.0)))
        speed = max(0.0, float(entity.get("speed", 0.0)))
        return math.sin(heading) * speed, math.cos(heading) * speed

    @staticmethod
    def shape_support(entity: Dict, unit_x: float, unit_z: float, heading: float | None = None) -> float:
        dimensions = dict(entity.get("dimensions") or DEFAULT_DIMENSIONS.get(str(entity.get("type")), {"shape": "circle", "radius": 0.375}))
        shape = str(dimensions.get("shape", "circle"))
        if shape == "circle":
            return max(0.01, float(dimensions.get("radius", 0.375)))
        angle = math.radians(float(entity.get("heading", 0.0) if heading is None else heading))
        forward_x, forward_z = math.sin(angle), math.cos(angle)
        right_x, right_z = math.cos(angle), -math.sin(angle)
        forward_projection = abs(unit_x * forward_x + unit_z * forward_z)
        right_projection = abs(unit_x * right_x + unit_z * right_z)
        length = max(0.01, float(dimensions.get("length", 1.0)))
        width = max(0.01, float(dimensions.get("width", length)))
        if shape == "capsule":
            return width / 2 + forward_projection * max(0.0, length - width) / 2
        return forward_projection * length / 2 + right_projection * width / 2

    @classmethod
    def collision_envelope(
        cls,
        first: Dict,
        second: Dict,
        dx: float | None = None,
        dz: float | None = None,
        first_heading: float | None = None,
        second_heading: float | None = None,
    ) -> float:
        dx = float(second["x"]) - float(first["x"]) if dx is None else float(dx)
        dz = float(second["z"]) - float(first["z"]) if dz is None else float(dz)
        distance = math.hypot(dx, dz)
        unit_x, unit_z = ((1.0, 0.0) if distance <= 1e-9 else (dx / distance, dz / distance))
        return cls.shape_support(first, unit_x, unit_z, first_heading) + cls.shape_support(second, -unit_x, -unit_z, second_heading)

    @staticmethod
    def _shape(entity: Dict, x: float | None = None, z: float | None = None, heading: float | None = None) -> Dict:
        dimensions = dict(entity.get("dimensions") or DEFAULT_DIMENSIONS.get(str(entity.get("type")), {"shape": "circle", "radius": 0.375}))
        return {
            **dimensions,
            "x": float(entity["x"] if x is None else x),
            "z": float(entity["z"] if z is None else z),
            "heading": float(entity.get("heading", 0) if heading is None else heading),
        }

    @staticmethod
    def _box_axes(shape: Dict) -> Tuple[Tuple[float, float], Tuple[float, float]]:
        angle = math.radians(float(shape["heading"]))
        return (math.sin(angle), math.cos(angle)), (math.cos(angle), -math.sin(angle))

    @classmethod
    def _circle_box_overlap(cls, circle: Dict, box: Dict) -> bool:
        forward, right = cls._box_axes(box)
        dx, dz = float(circle["x"]) - float(box["x"]), float(circle["z"]) - float(box["z"])
        local_forward = dx * forward[0] + dz * forward[1]
        local_right = dx * right[0] + dz * right[1]
        half_length, half_width = float(box.get("length", 1)) / 2, float(box.get("width", 1)) / 2
        nearest_forward = max(-half_length, min(half_length, local_forward))
        nearest_right = max(-half_width, min(half_width, local_right))
        return math.hypot(local_forward - nearest_forward, local_right - nearest_right) <= float(circle.get("radius", 0.375))

    @classmethod
    def _box_box_overlap(cls, first: Dict, second: Dict) -> bool:
        first_axes = cls._box_axes(first)
        second_axes = cls._box_axes(second)
        dx, dz = float(second["x"]) - float(first["x"]), float(second["z"]) - float(first["z"])
        for axis in (*first_axes, *second_axes):
            center_projection = abs(dx * axis[0] + dz * axis[1])
            first_radius = (
                abs(first_axes[0][0] * axis[0] + first_axes[0][1] * axis[1]) * float(first.get("length", 1)) / 2
                + abs(first_axes[1][0] * axis[0] + first_axes[1][1] * axis[1]) * float(first.get("width", 1)) / 2
            )
            second_radius = (
                abs(second_axes[0][0] * axis[0] + second_axes[0][1] * axis[1]) * float(second.get("length", 1)) / 2
                + abs(second_axes[1][0] * axis[0] + second_axes[1][1] * axis[1]) * float(second.get("width", 1)) / 2
            )
            if center_projection > first_radius + second_radius:
                return False
        return True

    @classmethod
    def shape_overlap(
        cls,
        first: Dict,
        second: Dict,
        first_pose: Dict | None = None,
        second_pose: Dict | None = None,
    ) -> bool:
        first_pose = first_pose or {}
        second_pose = second_pose or {}
        first_shape = cls._shape(first, first_pose.get("x"), first_pose.get("z"), first_pose.get("heading"))
        second_shape = cls._shape(second, second_pose.get("x"), second_pose.get("z"), second_pose.get("heading"))
        first_circle = first_shape.get("shape") == "circle"
        second_circle = second_shape.get("shape") == "circle"
        if first_circle and second_circle:
            return math.hypot(first_shape["x"] - second_shape["x"], first_shape["z"] - second_shape["z"]) <= float(first_shape["radius"]) + float(second_shape["radius"])
        if first_circle:
            return cls._circle_box_overlap(first_shape, second_shape)
        if second_circle:
            return cls._circle_box_overlap(second_shape, first_shape)
        return cls._box_box_overlap(first_shape, second_shape)

    @classmethod
    def trajectory_conflict(cls, first: Dict, second: Dict) -> Optional[Dict]:
        first_samples = first.get("_predicted_trajectory") or []
        second_samples = second.get("_predicted_trajectory") or []
        if len(first_samples) < 2 or len(second_samples) < 2:
            return None
        minimum_distance = math.inf
        minimum_clearance = math.inf
        closest = None
        overlap_time = None
        for first_sample, second_sample in zip(first_samples, second_samples):
            dx = float(second_sample["x"]) - float(first_sample["x"])
            dz = float(second_sample["z"]) - float(first_sample["z"])
            distance = math.hypot(dx, dz)
            envelope = cls.collision_envelope(
                first, second, dx, dz,
                float(first_sample.get("heading", first.get("heading", 0))),
                float(second_sample.get("heading", second.get("heading", 0))),
            )
            clearance = distance - envelope
            if clearance < minimum_clearance:
                minimum_distance = distance
                minimum_clearance = clearance
                closest = {
                    "x": (float(first_sample["x"]) + float(second_sample["x"])) / 2,
                    "z": (float(first_sample["z"]) + float(second_sample["z"])) / 2,
                    "first_time": float(first_sample["time"]),
                    "second_time": float(second_sample["time"]),
                    "arrival_gap": 0.0,
                }
            if overlap_time is None and cls.shape_overlap(first, second, first_sample, second_sample):
                overlap_time = float(first_sample["time"])
        return {
            "minimum_distance": minimum_distance,
            "minimum_clearance": minimum_clearance,
            "closest": closest,
            "overlap_time": overlap_time,
            "predicted_conflict": bool(closest and minimum_clearance <= 0.75),
        }

    @classmethod
    def calculate_ttc(cls, first: Dict, second: Dict, collision_radius: float = 0.75) -> Optional[float]:
        if first.get("id") == second.get("id"):
            return None
        px = float(second["x"]) - float(first["x"])
        pz = float(second["z"]) - float(first["z"])
        v1x, v1z = cls.velocity(first)
        v2x, v2z = cls.velocity(second)
        vx, vz = v2x - v1x, v2z - v1z
        # Closing only: derivative of squared distance must be negative.
        if px * vx + pz * vz >= 0:
            return None
        a = vx * vx + vz * vz
        if a <= 1e-9:
            return None
        c = px * px + pz * pz - collision_radius * collision_radius
        if c <= 0:
            return 0.0
        b = 2 * (px * vx + pz * vz)
        discriminant = b * b - 4 * a * c
        if discriminant < 0:
            return None
        ttc = (-b - math.sqrt(discriminant)) / (2 * a)
        return ttc if ttc >= 0 and math.isfinite(ttc) else None

    @classmethod
    def predicted_path_intersection(cls, first: Dict, second: Dict, horizon: float = 6.0, time_tolerance: float = 2.0) -> Optional[Dict]:
        p1 = float(first["x"]), float(first["z"])
        p2 = float(second["x"]), float(second["z"])
        v1 = cls.velocity(first)
        v2 = cls.velocity(second)
        determinant = v1[0] * v2[1] - v1[1] * v2[0]
        if abs(determinant) <= 1e-8 or min(math.hypot(*v1), math.hypot(*v2)) <= 1e-6:
            return None
        offset = p2[0] - p1[0], p2[1] - p1[1]
        first_time = (offset[0] * v2[1] - offset[1] * v2[0]) / determinant
        second_time = (offset[0] * v1[1] - offset[1] * v1[0]) / determinant
        if not (0 <= first_time <= horizon and 0 <= second_time <= horizon):
            return None
        if abs(first_time - second_time) > time_tolerance:
            return None
        return {
            "x": p1[0] + v1[0] * first_time,
            "z": p1[1] + v1[1] * first_time,
            "first_time": first_time,
            "second_time": second_time,
            "arrival_gap": abs(first_time - second_time),
        }

    @classmethod
    def calculate_pair(cls, first: Dict, second: Dict, prediction_horizon: float = 6.0, time_tolerance: float = 2.0, collision_radius: float = 0.75) -> Optional[Dict]:
        if first.get("id") == second.get("id"):
            return None
        event_type = PAIR_TYPES.get(frozenset((first.get("type"), second.get("type"))))
        if event_type is None:
            return None
        dx = float(second["x"]) - float(first["x"])
        dz = float(second["z"]) - float(first["z"])
        distance = math.hypot(dx, dz)
        v1x, v1z = cls.velocity(first)
        v2x, v2z = cls.velocity(second)
        rvx, rvz = v2x - v1x, v2z - v1z
        relative_speed = math.hypot(rvx, rvz)
        approaching = dx * rvx + dz * rvz < 0
        if relative_speed > 1e-9 and approaching:
            closest_time = min(prediction_horizon, max(0.0, -(dx * rvx + dz * rvz) / (relative_speed * relative_speed)))
            minimum_distance = math.hypot(dx + rvx * closest_time, dz + rvz * closest_time)
        else:
            closest_time = 0.0
            minimum_distance = distance
        collision_envelope = cls.collision_envelope(first, second, dx, dz)
        current_overlap = cls.shape_overlap(first, second)
        trajectory = cls.trajectory_conflict(first, second)
        if trajectory:
            minimum_distance = trajectory["minimum_distance"]
            minimum_clearance = trajectory["minimum_clearance"]
            closest_time = float(trajectory["closest"]["first_time"]) if trajectory.get("closest") else 0.0
        else:
            minimum_clearance = minimum_distance - collision_envelope
        closing_speed = max(0.0, -(dx * rvx + dz * rvz) / max(distance, 1e-9))
        required_deceleration = closing_speed * closing_speed / max(2 * (distance - collision_envelope), 0.1) if approaching else 0.0
        time_headway = distance / max(float(first.get("speed", 0)), float(second.get("speed", 0)), 1e-9)
        linear_ttc = cls.calculate_ttc(first, second, collision_envelope)
        if trajectory:
            ttc = trajectory["overlap_time"]
            intersection = trajectory["closest"] if trajectory["predicted_conflict"] else None
            prediction_model = "route_swept_envelope"
        else:
            ttc = linear_ttc
            intersection = cls.predicted_path_intersection(first, second, prediction_horizon, time_tolerance)
            prediction_model = "linear_velocity_envelope"
        heading_gap = abs((float(first.get("heading", 0)) - float(second.get("heading", 0)) + 180) % 360 - 180)
        if intersection:
            interaction = "CROSSING"
        elif heading_gap < 30 and distance < 12:
            interaction = "FOLLOWING"
        elif approaching and (minimum_distance <= 1.5 or (ttc is not None and ttc <= 3)):
            interaction = "CONFLICT"
        elif approaching:
            interaction = "APPROACHING"
        else:
            interaction = "NONE"
        return {
            "type": event_type,
            "distance": distance,
            "relative_speed": relative_speed,
            "closing_speed": closing_speed,
            "required_deceleration": required_deceleration,
            "time_headway": time_headway,
            "approaching": approaching,
            "minimum_distance": minimum_distance,
            "minimum_clearance": minimum_clearance,
            "collision_envelope": collision_envelope,
            "current_overlap": current_overlap,
            "closest_time": closest_time,
            "ttc": ttc,
            "linear_ttc": linear_ttc,
            "prediction_model": prediction_model,
            "predicted_path_intersection": intersection,
            "interaction_state": interaction,
            "pet": min(
                (float(value) for value in (first.get("current_pet"), second.get("current_pet")) if value is not None),
                default=None,
            ) if first.get("conflict_area_id") == second.get("conflict_area_id") else None,
            "conflict_area_id": first.get("conflict_area_id") if first.get("conflict_area_id") == second.get("conflict_area_id") else None,
        }

    def safety_event(self, metrics: Dict, first: Dict, second: Dict, level: str) -> str:
        if metrics.get("current_overlap"):
            return "COLLISION"
        if any(entity.get("jaywalking") for entity in (first, second)) and "person" in {first.get("type"), second.get("type")}:
            return "UNSAFE_CROSSING"
        time_to_conflict = metrics["ttc"]
        if time_to_conflict is None and metrics.get("predicted_path_intersection"):
            time_to_conflict = metrics.get("closest_time")
        if (
            metrics.get("minimum_clearance", metrics["minimum_distance"]) <= self.near_miss_distance
            and metrics.get("approaching")
            and time_to_conflict is not None
            and time_to_conflict <= self.near_miss_ttc
        ):
            return "NEAR_MISS"
        if any(float(entity.get("acceleration", 0)) < -self.hard_braking_threshold for entity in (first, second)):
            return "SUDDEN_BRAKING"
        if "person" in {first.get("type"), second.get("type")} and any(entity.get("in_crosswalk") for entity in (first, second)):
            yielding = next((entity for entity in (first, second) if entity.get("type") in {"car", "scooter"}), None)
            if yielding and (yielding.get("interaction_state") in {"BRAKING", "AVOIDING"} or float(yielding.get("speed", 0)) < 0.5):
                return "VEHICLE_YIELDING" if yielding.get("type") == "car" else "SCOOTER_YIELDING"
        return "TRAFFIC_CONFLICT" if level in {"warning", "danger"} else "NONE"

    def classify(self, metrics: Dict, first: Dict, second: Dict) -> Tuple[str, int]:
        distance = max(0.0, metrics["distance"] - metrics.get("collision_envelope", 0.0))
        ttc = metrics["ttc"]
        if ttc is None and metrics.get("predicted_path_intersection"):
            ttc = metrics.get("closest_time")
        level = "normal"
        score = 0.0
        for candidate, weight in (("caution", 45), ("warning", 68), ("danger", 88)):
            if distance <= float(self.distance_thresholds[candidate]) and (
                metrics.get("approaching")
                or metrics.get("predicted_path_intersection")
                or metrics.get("minimum_clearance", math.inf) <= 0
            ):
                level, score = candidate, max(score, weight)
            if ttc is not None and ttc <= float(self.ttc_thresholds[candidate]):
                level, score = candidate, max(score, weight + 5)
        violations = 0
        for entity in (first, second):
            limit = float(self.speed_limits.get(entity.get("type"), math.inf))
            if float(entity.get("speed", 0)) > limit:
                violations += 1
                score += 8
            if float(entity.get("acceleration", 0)) < -self.hard_braking_threshold:
                violations += 1
                score += 7
            if entity.get("signal_violation"):
                violations += 1
                score += 12
            if entity.get("in_risk_zone"):
                score += 4
        if self.weather.get("rain"):
            score *= 1.12
        if self.weather.get("night") and {first.get("type"), second.get("type")} == {"car", "person"}:
            score *= 1.15
        if violations and level == "normal":
            level = "caution"
        if score >= 85:
            level = "danger"
        elif score >= 65 and level in {"normal", "caution"}:
            level = "warning"
        return level, min(100, max(0, int(round(score))))

    def evaluate(self, entities: Iterable[Dict], simulation_time: float, enabled: bool = True) -> List[Dict]:
        entity_list = [entity for entity in entities if entity.get("active", True)]
        for entity in entity_list:
            entity["risk_level"] = "normal"
        new_events: List[Dict] = []
        severity = {"normal": 0, "caution": 1, "warning": 2, "danger": 3}
        for first, second in self.spatial_index.pairs(entity_list, self.risk_search_radius):
            metrics = self.calculate_pair(first, second, self.prediction_horizon, self.intersection_time_tolerance, self.collision_radius)
            if metrics is None:
                continue
            # Fast broad-phase: pairs farther than 12 m cannot meet current thresholds.
            if metrics["distance"] > 12 and not metrics.get("predicted_path_intersection") and (metrics["ttc"] is None or metrics["ttc"] > 8):
                continue
            level, score = self.classify(metrics, first, second)
            for entity in (first, second):
                if severity[level] > severity.get(entity.get("risk_level", "normal"), 0):
                    entity["risk_level"] = level
            if not enabled or level not in {"warning", "danger"}:
                continue
            pair_key = tuple(sorted((str(first["id"]), str(second["id"]))))
            if simulation_time - self._last_event_time.get(pair_key, -math.inf) < self.cooldown:
                continue
            self._last_event_time[pair_key] = simulation_time
            self._counter += 1
            location = first.get("road_id") if first.get("in_crosswalk") else second.get("road_id")
            event = {
                "event_id": f"risk_{datetime.now().strftime('%Y%m%d')}_{self._counter:04d}",
                "timestamp": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
                "simulation_time": round(simulation_time, 2),
                "type": metrics["type"],
                "object_ids": [first["id"], second["id"]],
                "location_id": location,
                "distance": round(metrics["distance"], 2),
                "collision_envelope": round(metrics["collision_envelope"], 2),
                "shape_overlap": bool(metrics["current_overlap"]),
                "minimum_clearance": round(metrics["minimum_clearance"], 2),
                "relative_speed": round(metrics["relative_speed"], 2),
                "closing_speed": round(metrics["closing_speed"], 2),
                "required_deceleration": round(metrics["required_deceleration"], 2),
                "time_headway": round(metrics["time_headway"], 2),
                "ttc": None if metrics["ttc"] is None else round(metrics["ttc"], 2),
                "linear_ttc": None if metrics["linear_ttc"] is None else round(metrics["linear_ttc"], 2),
                "prediction_model": metrics["prediction_model"],
                "pet": None if metrics["pet"] is None else round(metrics["pet"], 2),
                "conflict_area_id": metrics["conflict_area_id"],
                "minimum_distance": round(metrics["minimum_distance"], 2),
                "time_to_closest_approach": round(metrics["closest_time"], 2),
                "predicted_path_intersection": None if not metrics["predicted_path_intersection"] else {
                    key: round(value, 2) for key, value in metrics["predicted_path_intersection"].items()
                },
                "interaction_type": metrics["interaction_state"].lower(),
                "interaction_state": metrics["interaction_state"],
                "safety_event": self.safety_event(metrics, first, second, level),
                "risk_score": score,
                "risk_level": level,
                "description": DESCRIPTIONS[metrics["type"]],
            }
            self.events.append(event)
            new_events.append(event)
        self.last_broad_phase = {
            "candidate_pairs": self.spatial_index.last_candidate_count,
            "nearby_pairs": self.spatial_index.last_pair_count,
            "all_pairs": len(entity_list) * max(0, len(entity_list) - 1) // 2,
        }
        return new_events

    def recent_events(self, limit: int = 100) -> List[Dict]:
        return list(self.events)[-max(0, min(limit, self.events.maxlen or limit)):][::-1]
