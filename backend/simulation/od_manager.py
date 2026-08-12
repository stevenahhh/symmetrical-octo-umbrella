from __future__ import annotations

import random
import math
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

try:
    from .data_loader import load_json
    from .mobility_graph import MobilityGraph
except ImportError:
    from data_loader import load_json
    from mobility_graph import MobilityGraph


class ODManager:
    def __init__(self, path: str | Path, graph: MobilityGraph, random_source: random.Random) -> None:
        self.config = load_json(path)
        self.graph = graph
        self.random = random_source
        self.profiles = {profile["name"]: profile for profile in self.config["time_profiles"]}
        self.metadata = dict(self.config.get("metadata") or {})
        self.coverage_mix = {key: float(value) for key, value in self.metadata.get("coverage_mix", {}).items()}
        self.route_diversity = dict(self.metadata.get("route_diversity") or {})
        self.poi_usage = Counter()
        self.coverage_pairs = self._build_coverage_pairs()
        self.validation = self._validate()

    def _build_coverage_pairs(self) -> Dict[str, List[Tuple[str, str]]]:
        allowed_kinds = {
            "car": {"external", "parking"},
            "person": {"building", "external", "parking"},
            "scooter": {"building", "external", "scooter_parking"},
        }
        result: Dict[str, List[Tuple[str, str]]] = {}
        for agent_type, kinds in allowed_kinds.items():
            pois = [poi for poi in self.graph.pois_for(agent_type) if poi.get("kind") in kinds]
            pairs = []
            for origin in pois:
                for destination in pois:
                    if origin["poi_id"] == destination["poi_id"]:
                        continue
                    if agent_type == "car" and {origin.get("kind"), destination.get("kind")} != {"external", "parking"}:
                        continue
                    try:
                        self.graph.shortest_path(origin["poi_id"], destination["poi_id"], agent_type)
                    except ValueError:
                        continue
                    pairs.append((str(origin["poi_id"]), str(destination["poi_id"])))
            result[agent_type] = pairs
        return result

    def _coverage_choice(self, agent_type: str, current_origin: str | None = None) -> Tuple[str, str] | None:
        pairs = self.coverage_pairs.get(agent_type, [])
        if current_origin:
            pairs = [pair for pair in pairs if pair[0] == current_origin]
        if not pairs:
            return None
        weights = []
        for origin, destination in pairs:
            first = self.graph.nodes[self.graph.poi(origin)["node_id"]]
            second = self.graph.nodes[self.graph.poi(destination)["node_id"]]
            separation = math.hypot(float(second["x"]) - float(first["x"]), float(second["z"]) - float(first["z"]))
            usage = self.poi_usage[origin] + self.poi_usage[destination]
            weights.append((1.0 + separation / 250.0) / (1.0 + usage))
        origin, destination = self.random.choices(pairs, weights=weights, k=1)[0]
        self.poi_usage[origin] += 1
        self.poi_usage[destination] += 1
        return origin, destination

    def _validate(self) -> Dict:
        report = {"profiles": {}, "valid": True}
        for profile in self.config.get("time_profiles", []):
            profile_report = {}
            for agent_type in ("car", "person", "scooter"):
                pairs = profile.get("pairs", {}).get(agent_type, [])
                weights = [float(pair[2]) for pair in pairs]
                if not weights or any(weight <= 0 for weight in weights):
                    raise ValueError(f"{profile.get('name')} {agent_type}: OD weight는 양수여야 합니다.")
                total = sum(weights)
                normalized = [weight / total for weight in weights]
                if abs(sum(normalized) - 1.0) > 1e-9:
                    raise ValueError(f"{profile.get('name')} {agent_type}: OD 확률 정규화에 실패했습니다.")
                for origin, destination, _ in pairs:
                    self.graph.poi(str(origin)); self.graph.poi(str(destination))
                    self.graph.shortest_path(str(origin), str(destination), agent_type)
                profile_report[agent_type] = {"pair_count": len(pairs), "weight_sum": total, "normalized_probability_sum": sum(normalized)}
            report["profiles"][profile["name"]] = profile_report
        report["coverage_pairs"] = {key: len(value) for key, value in self.coverage_pairs.items()}
        return report

    @staticmethod
    def _minutes(value: str) -> int:
        hours, minutes = value.split(":", 1)
        return int(hours) * 60 + int(minutes)

    def clock_minutes(self, simulation_time: float) -> int:
        start = int(self.config.get("metadata", {}).get("simulation_clock_start_hour", 8)) * 60
        return int(start + simulation_time / 60.0) % (24 * 60)

    def profile(self, simulation_time: float, scenario_name: str) -> Dict:
        forced = self.config.get("scenario_profile", {}).get(scenario_name)
        if forced:
            return self.profiles[forced]
        now = self.clock_minutes(simulation_time)
        for profile in self.config["time_profiles"]:
            if profile["name"] == "daytime":
                continue
            if self._minutes(profile["start"]) <= now < self._minutes(profile["end"]):
                return profile
        return self.profiles["daytime"]

    def choose(self, agent_type: str, simulation_time: float, scenario_name: str, current_origin: str | None = None) -> Tuple[str, str]:
        if self.random.random() < self.coverage_mix.get(agent_type, 0.0):
            selected = self._coverage_choice(agent_type, current_origin)
            if selected:
                return selected
        profile = self.profile(simulation_time, scenario_name)
        pairs: List[List] = list(profile["pairs"].get(agent_type, ()))
        if current_origin:
            continuing = [pair for pair in pairs if pair[0] == current_origin and pair[1] != current_origin]
            if continuing:
                pairs = continuing
            else:
                current_kind = self.graph.poi(current_origin).get("kind")
                if agent_type == "car":
                    allowed_kinds = {"external"} if current_kind == "parking" else {"parking"}
                elif agent_type == "person":
                    allowed_kinds = {"building", "external", "parking"}
                else:
                    allowed_kinds = {"building", "external", "scooter_parking"}
                destinations = [
                    poi["poi_id"] for poi in self.graph.pois_for(agent_type)
                    if poi["poi_id"] != current_origin and poi.get("kind") in allowed_kinds
                ]
                destination = self.random.choice(destinations)
                return current_origin, destination
        if not pairs:
            raise ValueError(f"{profile['name']}에 {agent_type} OD 수요가 없습니다.")
        pair = self.random.choices(pairs, weights=[float(value[2]) for value in pairs], k=1)[0]
        origin, destination = str(pair[0]), str(pair[1])
        self.poi_usage[origin] += 1
        self.poi_usage[destination] += 1
        return origin, destination

    def dwell_time(self, poi_id: str, agent_type: str) -> float:
        poi = self.graph.poi(poi_id)
        category = poi.get("category") or poi.get("kind") or "gate"
        low, high = self.config.get("dwell_seconds", {}).get(category, [20, 60])
        factor = 0.6 if agent_type == "scooter" else 1.0
        return self.random.uniform(float(low), float(high)) * factor

    def target_factor(self, agent_type: str, simulation_time: float, scenario_name: str) -> float:
        return float(self.profile(simulation_time, scenario_name).get("target_factor", {}).get(agent_type, 1.0))
