from __future__ import annotations

from collections import Counter, deque
from typing import Deque, Dict, Iterable, List


METRIC_DEFAULTS = {
    "trip_distance": 0.0,
    "travel_time": 0.0,
    "average_speed": 0.0,
    "waiting_time": 0.0,
    "number_of_brakes": 0,
    "hard_brake_count": 0,
    "near_miss_count": 0,
    "risk_exposure_time": 0.0,
    "crosswalk_wait_time": 0.0,
    "jaywalking_count": 0,
    "vehicle_conflict_count": 0,
    "scooter_conflict_count": 0,
    "speeding_time": 0.0,
    "wrong_way_distance": 0.0,
    "pedestrian_conflict_count": 0,
    "conflict_count": 0,
    "number_of_stops": 0,
    "walking_time": 0.0,
    "minimum_ttc": None,
    "minimum_pet": None,
    "maximum_risk": 0,
}


class StatisticsManager:
    def __init__(self, trajectory_seconds: float = 30.0, sample_interval: float = 0.5) -> None:
        self.trajectory_seconds = trajectory_seconds
        self.sample_interval = sample_interval
        self.trajectories: Dict[str, Deque[Dict]] = {}
        self.last_sample: Dict[str, float] = {}
        self.completed_trips = Counter()
        self.completed_travel_time = Counter()
        self.risk_events = Counter()
        self.near_miss_count = 0
        self.safety_events: Deque[Dict] = deque(maxlen=500)
        self.timeline_events: Deque[Dict] = deque(maxlen=1000)
        self.pending_replays: List[Dict] = []

    def reset(self) -> None:
        self.trajectories.clear()
        self.last_sample.clear()
        self.completed_trips.clear()
        self.completed_travel_time.clear()
        self.risk_events.clear()
        self.near_miss_count = 0
        self.safety_events.clear()
        self.timeline_events.clear()
        self.pending_replays.clear()

    def register(self, entity: Dict, simulation_time: float) -> None:
        entity["metrics"] = dict(METRIC_DEFAULTS)
        if entity.get("jaywalking"):
            entity["metrics"]["jaywalking_count"] = 1
        max_points = max(2, int(self.trajectory_seconds / self.sample_interval) + 1)
        self.trajectories[entity["id"]] = deque(maxlen=max_points)
        self.sample(entity, simulation_time, force=True)
        self.timeline_events.append({"type": "TRIP_START", "simulation_time": round(simulation_time, 2), "agent_id": entity["id"], "trip_id": entity.get("trip_id")})

    def sample(self, entity: Dict, simulation_time: float, force: bool = False) -> None:
        if not force and simulation_time - self.last_sample.get(entity["id"], -1e9) < self.sample_interval:
            return
        trajectory = self.trajectories.setdefault(entity["id"], deque(maxlen=max(2, int(self.trajectory_seconds / self.sample_interval) + 1)))
        trajectory.append({
            "timestamp": round(simulation_time, 2), "x": round(float(entity["x"]), 3),
            "y": round(float(entity.get("y", 0)), 3), "z": round(float(entity["z"]), 3),
            "speed": round(float(entity.get("speed", 0)), 3), "heading": round(float(entity.get("heading", 0)), 2),
            "edge_id": entity.get("current_edge"), "state": entity.get("state", entity.get("trip_status")),
            "risk": entity.get("risk_level", "normal"),
        })
        self.last_sample[entity["id"]] = simulation_time

    def reposition(self, entity: Dict, simulation_time: float) -> None:
        """Reset only the initial trajectory after distributed spawning."""
        trajectory = self.trajectories.get(entity["id"])
        if trajectory is not None:
            trajectory.clear()
        self.last_sample.pop(entity["id"], None)
        self.sample(entity, simulation_time, force=True)

    def update_motion(self, entity: Dict, distance: float, dt: float, hard_brake_threshold: float, speed_limit: float, simulation_time: float | None = None) -> None:
        metrics = entity["metrics"]
        if entity.get("trip_status") == "MOVING":
            metrics["trip_distance"] += max(0.0, distance)
            metrics["travel_time"] += dt
            if entity.get("type") == "person" and entity.get("speed", 0) >= 0.08:
                metrics["walking_time"] += dt
            if entity.get("speed", 0) < 0.08:
                metrics["waiting_time"] += dt
                if entity.get("state") == "WAITING_CROSSWALK":
                    metrics["crosswalk_wait_time"] += dt
            if float(entity.get("acceleration", 0)) < -0.8 and not entity.get("braking_last_step"):
                metrics["number_of_brakes"] += 1
                entity["braking_last_step"] = True
            elif float(entity.get("acceleration", 0)) >= -0.8:
                entity["braking_last_step"] = False
            if entity.get("speed", 0) < 0.08 and not entity.get("stopped_last_step"):
                metrics["number_of_stops"] += 1
                entity["stopped_last_step"] = True
            elif entity.get("speed", 0) >= 0.08:
                entity["stopped_last_step"] = False
            if float(entity.get("acceleration", 0)) < -hard_brake_threshold and not entity.get("hard_braking_last_step"):
                metrics["hard_brake_count"] += 1
                entity["hard_braking_last_step"] = True
                self.timeline_events.append({"type": "HARD_BRAKE", "simulation_time": round(float(simulation_time or 0), 2), "agent_id": entity["id"], "acceleration": round(float(entity.get("acceleration", 0)), 2)})
            elif float(entity.get("acceleration", 0)) >= -hard_brake_threshold:
                entity["hard_braking_last_step"] = False
            if entity["type"] == "scooter":
                if float(entity.get("speed", 0)) > speed_limit:
                    metrics["speeding_time"] += dt
                if entity.get("wrong_way"):
                    metrics["wrong_way_distance"] += max(0.0, distance)
        travel_time = max(float(metrics["travel_time"]), 1e-9)
        metrics["average_speed"] = float(metrics["trip_distance"]) / travel_time

    def complete_trip(self, entity: Dict, simulation_time: float | None = None) -> None:
        entity_type = entity["type"]
        self.completed_trips[entity_type] += 1
        self.completed_travel_time[entity_type] += float(entity["metrics"].get("travel_time", 0))
        self.timeline_events.append({"type": "TRIP_END", "simulation_time": round(float(simulation_time or 0), 2), "agent_id": entity["id"], "trip_id": entity.get("trip_id")})

    def record_events(self, events: Iterable[Dict], entities: Dict[str, Dict], dt: float, simulation_time: float | None = None) -> None:
        now = float(simulation_time or 0)
        for replay in list(self.pending_replays):
            if now < replay["complete_at"]:
                continue
            event = replay["event"]
            event["replay"]["after"] = {
                entity_id: [sample for sample in self.trajectory(entity_id) if event["simulation_time"] <= sample["timestamp"] <= replay["complete_at"]]
                for entity_id in replay["object_ids"]
            }
            event["replay"]["complete"] = True
            self.pending_replays.remove(replay)
        for event in events:
            first_id, second_id = event["object_ids"]
            pair = {entities.get(first_id, {}).get("type"), entities.get(second_id, {}).get("type")}
            pair_key = "_".join(sorted(value for value in pair if value))
            self.risk_events[pair_key] += 1
            for entity_id, other_id in ((first_id, second_id), (second_id, first_id)):
                entity, other = entities.get(entity_id), entities.get(other_id)
                if not entity or not other:
                    continue
                metrics = entity["metrics"]
                metrics["conflict_count"] += 1
                metrics["maximum_risk"] = max(int(metrics.get("maximum_risk", 0)), int(event.get("risk_score", 0)))
                if event.get("ttc") is not None:
                    metrics["minimum_ttc"] = event["ttc"] if metrics.get("minimum_ttc") is None else min(metrics["minimum_ttc"], event["ttc"])
                if event.get("pet") is not None:
                    metrics["minimum_pet"] = event["pet"] if metrics.get("minimum_pet") is None else min(metrics["minimum_pet"], event["pet"])
                other_type = other["type"]
                if other_type == "car":
                    metrics["vehicle_conflict_count"] += 1
                elif other_type == "scooter":
                    metrics["scooter_conflict_count"] += 1
                elif other_type == "person":
                    metrics["pedestrian_conflict_count"] += 1
                if event.get("safety_event") == "NEAR_MISS":
                    metrics["near_miss_count"] += 1
            if event.get("safety_event") == "NEAR_MISS":
                self.near_miss_count += 1
            event["replay"] = {
                "window_seconds": 5,
                "before": {
                    entity_id: [sample for sample in self.trajectory(entity_id) if sample["timestamp"] >= now - 5]
                    for entity_id in event["object_ids"]
                },
                "after": {}, "complete": False,
            }
            self.pending_replays.append({"event": event, "object_ids": list(event["object_ids"]), "complete_at": now + 5})
            self.timeline_events.append({"type": event.get("safety_event", "CONFLICT"), "simulation_time": round(now, 2), "event_id": event["event_id"], "object_ids": list(event["object_ids"])})
            self.safety_events.append(dict(event))
        for entity in entities.values():
            if entity.get("active") and entity.get("risk_level", "normal") != "normal":
                entity["metrics"]["risk_exposure_time"] += dt

    def aggregate(self, entities: Iterable[Dict]) -> Dict:
        entity_list = [entity for entity in entities if entity.get("active")]
        active = Counter(entity["type"] for entity in entity_list)
        average = {
            entity_type: round(self.completed_travel_time[entity_type] / self.completed_trips[entity_type], 2) if self.completed_trips[entity_type] else 0
            for entity_type in ("car", "person", "scooter")
        }
        return {
            "active_agents": {key: active[key] for key in ("car", "person", "scooter")},
            "completed_trips": {key: self.completed_trips[key] for key in ("car", "person", "scooter")},
            "average_travel_time": average,
            "risk_events": {
                "car_person": self.risk_events["car_person"],
                "car_scooter": self.risk_events["car_scooter"],
                "person_scooter": self.risk_events["person_scooter"],
            },
            "near_miss_count": self.near_miss_count,
        }

    def trajectory(self, entity_id: str) -> List[Dict]:
        return list(self.trajectories.get(entity_id, ()))

    def timeline(self, limit: int = 200) -> List[Dict]:
        return list(self.timeline_events)[-max(1, limit):][::-1]
