from __future__ import annotations

import math
import random
from pathlib import Path
from typing import Dict, List, Optional

try:
    from .data_loader import load_json
    from .interaction_manager import InteractionManager
    from .conflict_area import ConflictAreaManager
    from .behavior_manager import BehaviorManager
    from .mobility_graph import GraphPath, MobilityGraph
    from .od_manager import ODManager
    from .risk_engine import RiskEngine
    from .runtime_network import load_runtime_graph
    from .scenario_manager import ScenarioManager
    from .statistics_manager import StatisticsManager
    from .trip_manager import TripManager
except ImportError:
    from data_loader import load_json
    from interaction_manager import InteractionManager
    from conflict_area import ConflictAreaManager
    from behavior_manager import BehaviorManager
    from mobility_graph import GraphPath, MobilityGraph
    from od_manager import ODManager
    from risk_engine import RiskEngine
    from runtime_network import load_runtime_graph
    from scenario_manager import ScenarioManager
    from statistics_manager import StatisticsManager
    from trip_manager import TripManager


DATA_DIR = Path(__file__).resolve().parent / "data"
ACCELERATION = {
    "car": {"up": 2.0, "down": 4.5},
    "person": {"up": 1.0, "down": 1.8},
    "scooter": {"up": 1.7, "down": 3.2},
}


class SimulationEngine:
    """OD-based microscopic internal provider used by the existing API."""

    def __init__(self, data_dir: str | Path = DATA_DIR, seed: int = 42) -> None:
        self.data_dir = Path(data_dir)
        self.random = random.Random(seed)
        self.seed = seed
        graph_payload, self.network_runtime = load_runtime_graph(self.data_dir)
        self.graph = MobilityGraph(graph_payload)
        self.routes = self.graph  # compatibility for callers that inspect route_id
        self.scenarios = ScenarioManager(self.data_dir / "sample_scenario.json")
        self.risk_engine = RiskEngine(self.data_dir / "risk_config.json")
        self.od = ODManager(self.data_dir / "od_demand.json", self.graph, self.random)
        self.trip_manager = TripManager(self.graph, self.od, self.random)
        self.interactions = InteractionManager(self.risk_engine)
        self.conflict_areas = ConflictAreaManager(self.data_dir / "conflict_areas.json")
        self.behaviors = BehaviorManager(Path(__file__).resolve().parent / "config" / "behavior_profiles.json", self.random)
        self.statistics_manager = StatisticsManager()
        self.visited_edges = {agent_type: set() for agent_type in ("car", "person", "scooter")}
        self.planned_edges = {agent_type: set() for agent_type in ("car", "person", "scooter")}
        self.status = "stopped"
        self.simulation_time = 0.0
        self.speed_multiplier = 1.0
        self.scenario_name = self.scenarios.default
        self.scenario = self.scenarios.get(self.scenario_name)
        self.entities: Dict[str, Dict] = {}
        self.paths: Dict[str, GraphPath] = {}
        self.entity_counters = {"car": 0, "person": 0, "scooter": 0}
        self.base_counts = {"car": 0, "person": 0, "scooter": 0}
        self.pending_spawns: List[Dict] = []
        self.last_step_events: List[Dict] = []
        self.weather = {"rain": False, "wind_speed": 0.0, "night": False, "source": "default"}
        self.traffic_lights = self._build_traffic_lights()
        self.risk_zone_ids = {str(light["crosswalk_id"]) for light in self.traffic_lights if light.get("crosswalk_id")}
        self.configure(self.scenario_name)

    def _build_traffic_lights(self) -> List[Dict]:
        path = self.data_dir / "traffic_lights.json"
        if not path.exists():
            return []
        payload = load_json(path)
        lights = payload.get("traffic_lights", payload) if isinstance(payload, dict) else payload
        if not isinstance(lights, list):
            raise ValueError("traffic_lights.json은 배열 또는 traffic_lights 배열을 포함해야 합니다.")
        return [dict(light) for light in lights]

    def configure(self, scenario_name: str, counts: Optional[Dict] = None, risk_events_enabled: Optional[bool] = None) -> None:
        scenario = self.scenarios.get(scenario_name)
        if counts:
            scenario["counts"].update({key: int(value) for key, value in counts.items()})
        if risk_events_enabled is not None:
            scenario["risk_events_enabled"] = bool(risk_events_enabled)
        self.scenario_name = scenario_name
        self.scenario = scenario
        self.base_counts = {key: max(0, int(scenario["counts"].get(key, 0))) for key in self.base_counts}
        if scenario.get("weather"):
            self.set_weather({**scenario["weather"], "source": "scenario"})
        self._spawn_entities(self.base_counts)

    def _new_entity(self, entity_type: str, origin: str | None = None, destination: str | None = None) -> Dict:
        self.entity_counters[entity_type] += 1
        entity_id = f"{entity_type}_{self.entity_counters[entity_type]:03d}"
        behavior = self.behaviors.choose(entity_type, self.scenario)
        entity = {
            "id": entity_id,
            "agent_id": entity_id,
            "type": entity_type,
            "agent_type": entity_type,
            "x": 0.0,
            "y": 0.0,
            "z": 0.0,
            "previous_x": 0.0,
            "previous_y": 0.0,
            "previous_z": 0.0,
            "speed": 0.0,
            "desired_speed": 0.0,
            "heading": 0.0,
            "acceleration": 0.0,
            "risk_level": "normal",
            "interaction_state": "NONE",
            "road_id": None,
            "edge_kind": None,
            "in_crosswalk": False,
            "in_risk_zone": False,
            "active": True,
            "visible": True,
            "signal_violation": False,
            "wrong_way": entity_type == "scooter" and self.random.random() < max(float(self.scenario.get("wrong_way_probability", 0)), float(behavior.get("wrong_way_probability", 0))),
            "jaywalking": entity_type == "person" and self.random.random() < max(float(self.scenario.get("jaywalking_probability", 0)), float(behavior.get("jaywalking_probability", 0))),
            "emergency": bool(self.scenario.get("emergency_vehicle")) and entity_type == "car" and self.entity_counters[entity_type] == 1,
            "behavior_profile": behavior,
            "dimensions": dict(self.risk_engine.agent_dimensions[entity_type]),
            "route_geometry": "derived_offset" if self.network_runtime.get("derived_allowed") else "authoritative",
            "spawn_time": self.simulation_time,
        }
        path = self.trip_manager.assign(entity, self.simulation_time, self.scenario_name, origin, destination)
        self.paths[entity_id] = path
        self.planned_edges[entity_type].update(path.edge_ids)
        entity["desired_speed"] = self.trip_manager.desired_speed(entity_type, path, self.scenario) * entity["behavior_profile"]["desired_speed_factor"]
        entity["speed"] = min(0.2, entity["desired_speed"])
        self._update_spatial_state(entity, path, 0)
        self.statistics_manager.register(entity, self.simulation_time)
        return entity

    def _spawn_entities(self, counts: Dict[str, int]) -> None:
        self.entities.clear()
        self.paths.clear()
        self.pending_spawns.clear()
        self.entity_counters = {"car": 0, "person": 0, "scooter": 0}
        self.statistics_manager.reset()
        self.od.poi_usage.clear()
        self.trip_manager.edge_usage.clear()
        for values in self.visited_edges.values():
            values.clear()
        for values in self.planned_edges.values():
            values.clear()
        for entity_type in ("car", "person", "scooter"):
            for _ in range(max(0, int(counts.get(entity_type, 0)))):
                entity = self._new_entity(entity_type)
                # Distribute starts across complete OD routes without changing
                # their origin/destination semantics.
                path = self.paths[entity["id"]]
                distance = self.random.uniform(0, path.total_length * 0.78)
                for _attempt in range(120):
                    candidate = self.random.uniform(0, path.total_length * 0.78)
                    distance = candidate
                    candidate_x, candidate_z, candidate_heading, _ = self.graph.interpolate(path, candidate, entity_type)
                    candidate_entity = {**entity, "x": candidate_x, "z": candidate_z, "heading": candidate_heading}
                    if all(
                        math.hypot(candidate_x - other["x"], candidate_z - other["z"])
                        >= self.risk_engine.collision_envelope(candidate_entity, other) + 0.5
                        for other in self.entities.values()
                    ):
                        distance = candidate
                        break
                entity["route_distance"] = distance
                x, z, heading, segment = self.graph.interpolate(path, distance, entity_type)
                entity.update({"x": x, "z": z, "previous_x": x, "previous_z": z, "heading": heading, "current_segment": segment, "route_progress": distance / path.total_length})
                self._update_spatial_state(entity, path, segment)
                self.statistics_manager.reposition(entity, self.simulation_time)
                self.entities[entity["id"]] = entity
        self.last_step_events = []

    def start(self, counts: Optional[Dict] = None, scenario_name: Optional[str] = None) -> None:
        if scenario_name or counts:
            self.configure(scenario_name or self.scenario_name, counts)
        self.status = "running"

    def pause(self) -> None:
        if self.status == "running":
            self.status = "paused"

    def resume(self) -> None:
        if self.status == "paused":
            self.status = "running"

    def stop(self) -> None:
        self.status = "stopped"

    def reset(self) -> None:
        self.status = "stopped"
        self.simulation_time = 0.0
        self.speed_multiplier = 1.0
        self.risk_engine.reset()
        self.conflict_areas.reset()
        self.configure(self.scenario_name)

    def set_speed(self, multiplier: float) -> None:
        if not 0.1 <= float(multiplier) <= 10:
            raise ValueError("시뮬레이션 속도는 0.1~10 범위여야 합니다.")
        self.speed_multiplier = float(multiplier)

    def set_weather(self, weather: Dict) -> None:
        self.weather.update(weather)
        self.risk_engine.set_weather(self.weather)

    def _update_traffic_lights(self) -> None:
        phase = self.simulation_time % 24.0
        for index, light in enumerate(self.traffic_lights):
            light["state"] = "green" if (phase + index * 6) % 24 < 12 else "red"

    def _signal_is_red(self, road_id: Optional[str]) -> bool:
        return any(light.get("crosswalk_id") == road_id and light.get("state") == "red" for light in self.traffic_lights)

    def _update_spatial_state(self, entity: Dict, path: GraphPath, segment: int) -> None:
        segment = min(max(0, segment), max(0, len(path.segment_lengths) - 1))
        entity["current_segment"] = segment
        entity["road_id"] = path.road_ids[min(segment, len(path.road_ids) - 1)] if path.road_ids else None
        entity["edge_kind"] = path.edge_kinds[min(segment, len(path.edge_kinds) - 1)] if path.edge_kinds else None
        entity["current_edge"] = path.segment_edge_ids[min(segment, len(path.segment_edge_ids) - 1)] if path.segment_edge_ids else None
        if entity.get("current_edge") and hasattr(self, "visited_edges"):
            self.visited_edges[entity["type"]].add(entity["current_edge"])
        entity["in_crosswalk"] = entity["edge_kind"] == "crosswalk" or str(entity.get("road_id")).startswith("CW_")
        entity["in_risk_zone"] = entity.get("road_id") in self.risk_zone_ids
        entity["current_position"] = [round(entity["x"], 3), 0.0, round(entity["z"], 3)]
        entity["previous_position"] = [round(entity["previous_x"], 3), 0.0, round(entity["previous_z"], 3)]
        if entity["type"] == "person":
            if entity.get("trip_status") == "DWELLING":
                pedestrian_state = "DWELLING"
            elif entity.get("jaywalking") and entity.get("edge_kind") == "road":
                pedestrian_state = "JAYWALKING"
            elif entity["in_crosswalk"] and entity.get("speed", 0) < 0.08:
                pedestrian_state = "WAITING_CROSSWALK"
            elif entity["in_crosswalk"]:
                pedestrian_state = "CROSSING"
            elif entity.get("route_progress", 0) > 0.9 and self.graph.poi(entity["destination"]).get("kind") == "building":
                pedestrian_state = "ENTERING_BUILDING"
            elif entity.get("route_progress", 0) < 0.1 and self.graph.poi(entity["origin"]).get("kind") == "building":
                pedestrian_state = "LEAVING_BUILDING"
            else:
                pedestrian_state = "WALKING"
            entity["pedestrian_state"] = pedestrian_state

    def _base_target(self, entity: Dict, path: GraphPath) -> float:
        segment = min(entity["current_segment"], len(path.speed_limits) - 1)
        target = min(float(entity["desired_speed"]), path.speed_limits[segment] if path.speed_limits else float(entity["desired_speed"]))
        remaining_segment = path.cumulative_lengths[segment + 1] - float(entity["route_distance"])
        if remaining_segment < 10 and self.graph.turn_angle(path, segment) > 35:
            target *= max(0.35, remaining_segment / 10)
        if entity["edge_kind"] == "crosswalk":
            target *= 0.55 if entity["type"] != "person" else 0.9
            if entity["type"] == "person" and self._signal_is_red(entity.get("road_id")) and not entity.get("jaywalking"):
                target = 0.0
        if self.weather.get("rain"):
            target *= {"car": 0.82, "person": 0.9, "scooter": 0.65}[entity["type"]]
        if entity["type"] == "scooter" and float(self.weather.get("wind_speed", 0) or 0) >= 8:
            target *= 0.65
        return max(0.0, target)

    def _advance_dwellers(self, dt: float) -> None:
        for entity in list(self.entities.values()):
            if entity.get("trip_status") != "DWELLING":
                continue
            entity["dwell_remaining"] = max(0.0, float(entity["dwell_remaining"]) - dt)
            if entity["dwell_remaining"] > 0:
                continue
            path = self.trip_manager.next_trip(entity, self.simulation_time, self.scenario_name)
            self.paths[entity["id"]] = path
            self.planned_edges[entity["type"]].update(path.edge_ids)
            entity["desired_speed"] = self.trip_manager.desired_speed(entity["type"], path, self.scenario) * entity["behavior_profile"]["desired_speed_factor"]
            entity["speed"] = 0.0
            entity["visible"] = True
            self._update_spatial_state(entity, path, 0)

    def _schedule_replacement(self, entity_type: str) -> None:
        self.pending_spawns.append({"type": entity_type, "at": self.simulation_time + self.random.uniform(1.0, 5.0)})

    def _process_demand(self) -> None:
        for request in list(self.pending_spawns):
            if request["at"] <= self.simulation_time:
                entity = self._new_entity(request["type"])
                self.entities[entity["id"]] = entity
                self.pending_spawns.remove(request)

        # Time profiles change the desired active population gradually. This
        # preserves user-provided scenario counts as the calibration baseline.
        for entity_type, base in self.base_counts.items():
            target = max(0, int(round(base * self.od.target_factor(entity_type, self.simulation_time, self.scenario_name))))
            current = sum(entity.get("active") and entity["type"] == entity_type for entity in self.entities.values())
            pending = sum(request["type"] == entity_type for request in self.pending_spawns)
            if current + pending < target and not pending:
                self._schedule_replacement(entity_type)

    def _update_predictions(self, entities: List[Dict]) -> None:
        for entity in entities:
            path = self.paths.get(entity["id"])
            if not path:
                entity["_predicted_trajectory"] = []
                continue
            entity["_predicted_trajectory"] = self.graph.predict_trajectory(
                path,
                float(entity.get("route_distance", 0)),
                float(entity.get("speed", 0)),
                self.risk_engine.prediction_horizon,
                self.risk_engine.prediction_step,
                entity["type"],
            )

    def step(self, delta_time: float) -> None:
        if self.status != "running":
            self.last_step_events = []
            return
        dt = max(0.0, min(float(delta_time), 1.0)) * self.speed_multiplier
        self.simulation_time += dt
        self._update_traffic_lights()
        self._advance_dwellers(dt)

        moving = [entity for entity in self.entities.values() if entity.get("active") and entity.get("trip_status") == "MOVING"]
        base_targets = {entity["id"]: self._base_target(entity, self.paths[entity["id"]]) for entity in moving}
        self._update_predictions(moving)
        targets = self.interactions.speed_constraints(moving, base_targets)
        despawned: List[str] = []
        for entity in moving:
            path = self.paths[entity["id"]]
            target = targets[entity["id"]]
            previous_speed = float(entity["speed"])
            if target >= previous_speed:
                limit = float(entity["behavior_profile"]["max_acceleration"])
            elif target <= 0.05 and entity.get("interaction_state") in {"BRAKING", "AVOIDING", "CONFLICT"}:
                limit = float(entity["behavior_profile"].get("emergency_deceleration", entity["behavior_profile"]["comfortable_deceleration"]))
            else:
                limit = float(entity["behavior_profile"]["comfortable_deceleration"])
            speed_delta = max(-limit * dt, min(limit * dt, target - previous_speed))
            entity["speed"] = max(0.0, previous_speed + speed_delta)
            entity["acceleration"] = speed_delta / max(dt, 1e-9)
            entity["previous_x"], entity["previous_y"], entity["previous_z"] = entity["x"], entity["y"], entity["z"]
            travelled = entity["speed"] * dt
            entity["route_distance"] = min(path.total_length, float(entity["route_distance"]) + travelled)
            x, z, raw_heading, segment = self.graph.interpolate(path, entity["route_distance"], entity["type"])
            heading_delta = (raw_heading - float(entity["heading"]) + 180) % 360 - 180
            entity["heading"] = (float(entity["heading"]) + heading_delta * min(1.0, dt * 4.0)) % 360
            entity["x"], entity["z"] = x, z
            entity["route_progress"] = entity["route_distance"] / max(path.total_length, 1e-9)
            self._update_spatial_state(entity, path, segment)
            if entity["speed"] < 0.08:
                entity["state"] = "WAITING" if entity["type"] == "person" else "STOPPED"
            elif entity.get("interaction_state") in {"BRAKING", "AVOIDING", "CONFLICT"}:
                entity["state"] = entity["interaction_state"]
            elif entity.get("wrong_way"):
                entity["state"] = "WRONG_WAY"
            elif entity.get("emergency"):
                entity["state"] = "EMERGENCY"
            else:
                entity["state"] = "MOVING"
            self.statistics_manager.update_motion(
                entity, travelled, dt, self.risk_engine.hard_braking_threshold,
                path.speed_limits[min(segment, len(path.speed_limits) - 1)] if path.speed_limits else math.inf,
                self.simulation_time,
            )
            self.statistics_manager.sample(entity, self.simulation_time)
            if entity["route_distance"] >= path.total_length - 1e-6:
                self.statistics_manager.complete_trip(entity, self.simulation_time)
                result = self.trip_manager.arrive(entity, self.simulation_time)
                self._update_spatial_state(entity, path, segment)
                if result == "despawn":
                    despawned.append(entity["id"])
                    self._schedule_replacement(entity["type"])

        self._update_predictions([entity for entity in moving if entity.get("active")])
        self.conflict_areas.update(self.entities.values(), self.simulation_time)
        self.last_step_events = self.risk_engine.evaluate(
            (entity for entity in self.entities.values() if entity.get("visible")),
            self.simulation_time,
            enabled=bool(self.scenario.get("risk_events_enabled", True)),
        )
        self.statistics_manager.record_events(self.last_step_events, self.entities, dt, self.simulation_time)
        for entity_id in despawned:
            self.entities.pop(entity_id, None)
            self.paths.pop(entity_id, None)
        self._process_demand()

    def statistics(self) -> Dict:
        expanded = self.statistics_manager.aggregate(self.entities.values())
        flat = {
            "car_count": expanded["active_agents"]["car"],
            "person_count": expanded["active_agents"]["person"],
            "scooter_count": expanded["active_agents"]["scooter"],
            "normal_count": 0,
            "caution_count": 0,
            "warning_count": 0,
            "danger_count": 0,
        }
        for entity in self.entities.values():
            if entity.get("active"):
                flat[f"{entity.get('risk_level', 'normal')}_count"] += 1
        coverage = {}
        for agent_type in ("car", "person", "scooter"):
            total = sum(agent_type in edge.allowed_types for edge in self.graph.edges.values())
            coverage[agent_type] = {
                "visited_edges": len(self.visited_edges[agent_type]),
                "planned_edges": len(self.planned_edges[agent_type]),
                "routable_edges": total,
                "visited_percent": round(100 * len(self.visited_edges[agent_type]) / max(total, 1), 2),
                "planned_percent": round(100 * len(self.planned_edges[agent_type]) / max(total, 1), 2),
            }
        return {
            **flat,
            **expanded,
            "current_risks": len(self.last_step_events),
            "network_runtime": dict(self.network_runtime),
            "network_coverage": coverage,
            "spatial_broad_phase": {
                "interaction_candidates": self.interactions.spatial_index.last_candidate_count,
                "interaction_pairs": self.interactions.spatial_index.last_pair_count,
                **self.risk_engine.last_broad_phase,
            },
        }

    def entity_list(self) -> List[Dict]:
        excluded = {"desired_speed", "route_distance", "braking_last_step", "hard_braking_last_step", "destination_external", "_predicted_trajectory"}
        return [
            {key: value for key, value in entity.items() if key not in excluded}
            for entity in self.entities.values()
            if entity.get("active") and entity.get("visible", True)
        ]

    def agent_detail(self, agent_id: str) -> Dict:
        try:
            entity = self.entities[agent_id]
        except KeyError as exc:
            raise KeyError(f"알 수 없는 Agent입니다: {agent_id}") from exc
        origin = self.graph.poi(entity["origin"])
        destination = self.graph.poi(entity["destination"])
        related = [event for event in self.risk_engine.recent_events(200) if agent_id in event.get("object_ids", ())]
        return {
            **{key: value for key, value in entity.items() if key not in {"desired_speed", "route_distance", "_predicted_trajectory"}},
            "origin_name": origin.get("name", entity["origin"]),
            "destination_name": destination.get("name", entity["destination"]),
            "trajectory": self.statistics_manager.trajectory(agent_id),
            "recent_risk_events": related[:20],
            "current_ttc": next((event.get("ttc") for event in related if event.get("ttc") is not None), None),
        }

    def risk_event_detail(self, event_id: str) -> Dict:
        try:
            return next(event for event in self.risk_engine.events if event.get("event_id") == event_id)
        except StopIteration as exc:
            raise KeyError(f"알 수 없는 Risk Event입니다: {event_id}") from exc

    def snapshot(self) -> Dict:
        return {
            "type": "simulation_update",
            "simulation_time": round(self.simulation_time, 2),
            "status": self.status,
            "entities": self.entity_list(),
            "risk_events": self.last_step_events,
            "statistics": self.statistics(),
            "traffic_lights": [dict(light) for light in self.traffic_lights],
            "weather": dict(self.weather),
            "demand_profile": self.od.profile(self.simulation_time, self.scenario_name)["name"],
            "timeline": self.statistics_manager.timeline(50),
        }
