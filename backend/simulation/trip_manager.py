from __future__ import annotations

import random
from collections import Counter
from typing import Dict, Tuple

try:
    from .mobility_graph import GraphPath, MobilityGraph
    from .od_manager import ODManager
except ImportError:
    from mobility_graph import GraphPath, MobilityGraph
    from od_manager import ODManager


BASE_SPEEDS = {"car": (4.0, 7.5), "person": (0.9, 1.7), "scooter": (2.5, 5.5)}


class TripManager:
    def __init__(self, graph: MobilityGraph, od: ODManager, random_source: random.Random) -> None:
        self.graph = graph
        self.od = od
        self.random = random_source
        self.counter = 0
        self.edge_usage = Counter()

    def create_path(self, agent_type: str, origin: str, destination: str) -> GraphPath:
        diversity = self.od.route_diversity
        low, high = diversity.get("random_cost_range", [1.0, 1.0])
        per_trip = float(diversity.get("usage_penalty_per_trip", 0.0))
        maximum = float(diversity.get("maximum_usage_penalty", 0.0))
        factors = {
            edge_id: self.random.uniform(float(low), float(high)) + min(maximum, self.edge_usage[edge_id] * per_trip)
            for edge_id in self.graph.edges
        }
        path = self.graph.shortest_path(origin, destination, agent_type, factors)
        self.edge_usage.update(set(path.edge_ids))
        return path

    def assign(self, entity: Dict, simulation_time: float, scenario_name: str, origin: str | None = None, destination: str | None = None) -> GraphPath:
        if origin is None or destination is None:
            origin, destination = self.od.choose(entity["type"], simulation_time, scenario_name, origin)
        path = self.create_path(entity["type"], origin, destination)
        self.counter += 1
        self.graph.poi(origin)
        destination_poi = self.graph.poi(destination)
        self.random.random()  # stable seeded variation between trips
        entity.update({
            "trip_id": f"trip_{self.counter:06d}", "origin": origin, "destination": destination,
            "current_route": path.path_id, "route_id": path.path_id, "current_segment": 0,
            "route_distance": 0.0, "route_progress": 0.0, "trip_status": "MOVING", "state": "MOVING",
            "spawn_time": entity.get("spawn_time", simulation_time), "trip_start_time": simulation_time,
            "arrival_time": None, "dwell_time": 0.0, "dwell_remaining": 0.0,
            "destination_external": bool(destination_poi.get("external")), "active": True, "visible": True,
        })
        x, z, heading, segment = self.graph.interpolate(path, 0.0, entity["type"])
        entity.update({"x": x, "z": z, "previous_x": x, "previous_z": z, "heading": heading, "current_segment": segment})
        return path

    def desired_speed(self, agent_type: str, path: GraphPath, scenario: Dict) -> float:
        low, high = BASE_SPEEDS[agent_type]
        value = self.random.uniform(low, high) * float(scenario.get("speed_multiplier", 1.0))
        if agent_type == "scooter":
            value *= float(scenario.get("scooter_speed_multiplier", 1.0))
        return min(value, max(path.speed_limits or (value,)))

    def arrive(self, entity: Dict, simulation_time: float) -> str:
        entity["arrival_time"] = simulation_time
        entity["trip_status"] = "ARRIVED_EXTERNAL" if entity.get("destination_external") else "ARRIVED"
        entity["state"] = entity["trip_status"]
        entity["speed"] = 0.0
        if entity.get("destination_external"):
            entity["active"] = False
            entity["visible"] = False
            entity["trip_status"] = "DESPAWNED"
            entity["state"] = "DESPAWNED"
            return "despawn"
        dwell = self.od.dwell_time(entity["destination"], entity["type"])
        entity["dwell_time"] = dwell
        entity["dwell_remaining"] = dwell
        entity["trip_status"] = "DWELLING"
        entity["state"] = "DWELLING"
        entity["visible"] = False
        return "dwell"

    def next_trip(self, entity: Dict, simulation_time: float, scenario_name: str) -> GraphPath:
        current = str(entity["destination"])
        origin, destination = self.od.choose(entity["type"], simulation_time, scenario_name, current)
        if entity["type"] != "car" and destination == entity.get("origin"):
            allowed_kinds = {"building", "external", "parking"} if entity["type"] == "person" else {"building", "external", "scooter_parking"}
            alternatives = [
                poi["poi_id"] for poi in self.graph.pois_for(entity["type"])
                if poi["poi_id"] not in {current, entity.get("origin")} and poi.get("kind") in allowed_kinds
            ]
            if alternatives:
                destination = self.random.choice(alternatives)
        entity["trip_status"] = "NEXT_TRIP"
        return self.assign(entity, simulation_time, scenario_name, origin, destination)
