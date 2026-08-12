from __future__ import annotations

import heapq
import hashlib
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

try:
    from .data_loader import load_json
except ImportError:
    from data_loader import load_json


Point = Tuple[float, float]


@dataclass(frozen=True)
class GraphEdge:
    edge_id: str
    source: str
    target: str
    kind: str
    allowed_types: Tuple[str, ...]
    speed_limit: float
    road_ids: Tuple[str, ...]
    points: Tuple[Point, ...]
    length: float


@dataclass(frozen=True)
class GraphPath:
    path_id: str
    origin: str
    destination: str
    allowed_types: Tuple[str, ...]
    node_ids: Tuple[str, ...]
    edge_ids: Tuple[str, ...]
    segment_edge_ids: Tuple[str, ...]
    edge_kinds: Tuple[str, ...]
    road_ids: Tuple[str | None, ...]
    speed_limits: Tuple[float, ...]
    points: Tuple[Point, ...]
    segment_lengths: Tuple[float, ...]
    cumulative_lengths: Tuple[float, ...]
    total_length: float


class MobilityGraph:
    """Small dependency-free directed graph with agent-type filtering."""

    def __init__(self, source: str | Path | Dict) -> None:
        payload = dict(source) if isinstance(source, dict) else load_json(source)
        self.metadata = dict(payload.get("metadata") or {})
        self.derived_lateral_offsets = dict(self.metadata.get("derived_lateral_offsets_m") or {
            "person": {"shared_path": 2.8, "sidewalk": 2.8},
            "scooter": {"shared_path": 1.4, "sidewalk": 1.4, "bike_lane": 1.4, "scooter_lane": 1.4, "allowed_road": -1.0},
        })
        self.nodes: Dict[str, Dict] = {str(node["id"]): dict(node) for node in payload["nodes"]}
        self.pois: Dict[str, Dict] = {str(poi["poi_id"]): dict(poi) for poi in payload["pois"]}
        self.edges: Dict[str, GraphEdge] = {}
        self.paths: Dict[str, GraphPath] = {}
        self.adjacency: Dict[str, List[Tuple[str, GraphEdge, bool]]] = {node_id: [] for node_id in self.nodes}
        for raw in payload["edges"]:
            points = tuple((float(value[0]), float(value[1])) for value in raw["coordinates"])
            length = sum(math.dist(points[index], points[index + 1]) for index in range(len(points) - 1))
            if length <= 1e-6:
                # A snapped POI can coincide with its graph node. Retain a
                # visible/routeable connector without creating a zero divisor.
                source_node, target_node = self.nodes[raw["from"]], self.nodes[raw["to"]]
                points = ((float(source_node["x"]), float(source_node["z"])), (float(target_node["x"]) + 0.01, float(target_node["z"])))
                length = 0.01
            edge = GraphEdge(
                edge_id=str(raw["id"]), source=str(raw["from"]), target=str(raw["to"]), kind=str(raw["kind"]),
                allowed_types=tuple(raw["allowed_types"]), speed_limit=float(raw.get("speed_limit", 10)) / 3.6,
                road_ids=tuple(str(value) for value in raw.get("road_ids") or ()), points=points, length=length,
            )
            self.edges[edge.edge_id] = edge
            self.adjacency[edge.source].append((edge.target, edge, False))
            if raw.get("bidirectional", False):
                self.adjacency[edge.target].append((edge.source, edge, True))

    def poi(self, poi_id: str) -> Dict:
        try:
            return self.pois[poi_id]
        except KeyError as exc:
            raise KeyError(f"알 수 없는 POI입니다: {poi_id}") from exc

    def pois_for(self, agent_type: str) -> List[Dict]:
        return [poi for poi in self.pois.values() if agent_type in poi.get("allowed_types", ())]

    def get(self, path_id: str) -> GraphPath:
        try:
            return self.paths[path_id]
        except KeyError as exc:
            raise KeyError(f"알 수 없는 Trip 경로입니다: {path_id}") from exc

    @staticmethod
    def _kind_cost(agent_type: str, kind: str) -> float:
        preferences = {
            "car": {"vehicle_lane": 0.9, "allowed_road": 1.0, "vehicle_gate": 1.0, "parking_connection": 1.0},
            "person": {"sidewalk": 0.85, "shared_path": 0.95, "crosswalk": 1.05, "pedestrian_gate": 1.0, "building_entrance": 1.0, "parking_walk": 1.0},
            "scooter": {"scooter_lane": 0.8, "bike_lane": 0.85, "shared_path": 0.92, "allowed_road": 1.18, "crosswalk": 1.1, "building_entrance": 1.15},
        }
        return preferences.get(agent_type, {}).get(kind, 1.0)

    def shortest_path(
        self,
        origin: str,
        destination: str,
        agent_type: str,
        edge_cost_factors: Dict[str, float] | None = None,
    ) -> GraphPath:
        origin_node = str(self.poi(origin)["node_id"])
        destination_node = str(self.poi(destination)["node_id"])
        queue: List[Tuple[float, str]] = [(0.0, origin_node)]
        distance = {origin_node: 0.0}
        previous: Dict[str, Tuple[str, GraphEdge, bool]] = {}
        while queue:
            cost, node_id = heapq.heappop(queue)
            if cost != distance.get(node_id):
                continue
            if node_id == destination_node:
                break
            for neighbor, edge, reverse in self.adjacency.get(node_id, ()):
                if agent_type not in edge.allowed_types:
                    continue
                factor = max(0.1, float((edge_cost_factors or {}).get(edge.edge_id, 1.0)))
                candidate = cost + edge.length * self._kind_cost(agent_type, edge.kind) * factor
                if candidate < distance.get(neighbor, math.inf):
                    distance[neighbor] = candidate
                    previous[neighbor] = (node_id, edge, reverse)
                    heapq.heappush(queue, (candidate, neighbor))
        if destination_node not in distance:
            raise ValueError(f"{agent_type} 경로를 찾을 수 없습니다: {origin} → {destination}")

        steps: List[Tuple[str, str, GraphEdge, bool]] = []
        current = destination_node
        while current != origin_node:
            prior, edge, reverse = previous[current]
            steps.append((prior, current, edge, reverse))
            current = prior
        steps.reverse()

        points: List[Point] = []
        node_ids = [origin_node]
        edge_ids: List[str] = []
        edge_kinds: List[str] = []
        road_ids: List[str | None] = []
        speed_limits: List[float] = []
        for _, target, edge, reverse in steps:
            oriented = list(reversed(edge.points)) if reverse else list(edge.points)
            if points and math.dist(points[-1], oriented[0]) <= 1e-6:
                oriented = oriented[1:]
            points.extend(oriented)
            node_ids.append(target)
            edge_ids.append(edge.edge_id)
            edge_kinds.extend([edge.kind] * max(1, len(oriented)))
            road_ids.extend([(edge.road_ids[0] if edge.road_ids else None)] * max(1, len(oriented)))
            speed_limits.extend([edge.speed_limit] * max(1, len(oriented)))
        if len(points) < 2:
            point = (float(self.nodes[origin_node]["x"]), float(self.nodes[origin_node]["z"]))
            points = [point, (point[0] + 0.01, point[1])]
        segment_lengths = tuple(math.dist(points[index], points[index + 1]) for index in range(len(points) - 1))
        cumulative = [0.0]
        for length in segment_lengths:
            cumulative.append(cumulative[-1] + length)

        # Segment metadata follows edges, while edge geometries currently have
        # one segment. Normalize defensively for authored multi-point edges.
        segment_edge_ids, segment_kinds, segment_roads, segment_speeds = [], [], [], []
        for _, _, edge, reverse in steps:
            count = max(1, len(edge.points) - 1)
            segment_edge_ids.extend([edge.edge_id] * count)
            segment_kinds.extend([edge.kind] * count)
            segment_roads.extend([edge.road_ids[0] if edge.road_ids else None] * count)
            segment_speeds.extend([edge.speed_limit] * count)
        signature = hashlib.sha1("|".join(segment_edge_ids).encode("utf-8")).hexdigest()[:8]
        path = GraphPath(
            path_id=f"TRIP_ROUTE_{agent_type}_{origin}_TO_{destination}_{signature}", origin=origin, destination=destination,
            allowed_types=(agent_type,),
            node_ids=tuple(node_ids), edge_ids=tuple(edge_ids), segment_edge_ids=tuple(segment_edge_ids), edge_kinds=tuple(segment_kinds),
            road_ids=tuple(segment_roads), speed_limits=tuple(segment_speeds), points=tuple(points),
            segment_lengths=segment_lengths, cumulative_lengths=tuple(cumulative), total_length=cumulative[-1],
        )
        self.paths[path.path_id] = path
        return path

    def lateral_offset(self, agent_type: str | None, edge_kind: str | None) -> float:
        """Development-only offset for geometry derived from a vehicle centerline."""
        if edge_kind in {"crosswalk", "building_entrance", "parking_connection", "parking_walk", "scooter_parking_connection", "pedestrian_gate", "vehicle_gate"}:
            return 0.0
        return float(self.derived_lateral_offsets.get(str(agent_type), {}).get(str(edge_kind), 0.0))

    def interpolate(self, path: GraphPath, distance: float, agent_type: str | None = None) -> Tuple[float, float, float, int]:
        value = min(max(0.0, float(distance)), path.total_length)
        segment = len(path.segment_lengths) - 1
        for index, end in enumerate(path.cumulative_lengths[1:]):
            if value <= end:
                segment = index
                break
        length = max(path.segment_lengths[segment], 1e-9)
        ratio = (value - path.cumulative_lengths[segment]) / length
        first, second = path.points[segment], path.points[segment + 1]
        x = first[0] + (second[0] - first[0]) * ratio
        z = first[1] + (second[1] - first[1]) * ratio
        kind = path.edge_kinds[segment] if segment < len(path.edge_kinds) else None
        offset = self.lateral_offset(agent_type, kind)
        if offset:
            previous_kind = path.edge_kinds[segment - 1] if segment > 0 and segment - 1 < len(path.edge_kinds) else kind
            next_kind = path.edge_kinds[segment + 1] if segment + 1 < len(path.edge_kinds) else kind
            start_offset = 0.0 if self.lateral_offset(agent_type, previous_kind) == 0.0 else offset
            end_offset = 0.0 if self.lateral_offset(agent_type, next_kind) == 0.0 else offset
            smooth_offset = (
                offset * math.sin(math.pi * ratio)
                if start_offset == 0.0 and end_offset == 0.0
                else start_offset + (end_offset - start_offset) * ratio
            )
            dx, dz = second[0] - first[0], second[1] - first[1]
            segment_length = max(math.hypot(dx, dz), 1e-9)
            x += (-dz / segment_length) * smooth_offset
            z += (dx / segment_length) * smooth_offset
        heading = (math.degrees(math.atan2(second[0] - first[0], second[1] - first[1])) + 360) % 360
        return x, z, heading, segment

    def predict_trajectory(
        self,
        path: GraphPath,
        route_distance: float,
        speed: float,
        horizon: float,
        step: float,
        agent_type: str,
    ) -> List[Dict[str, float]]:
        samples: List[Dict[str, float]] = []
        value = 0.0
        step = max(0.05, float(step))
        while value <= max(0.0, float(horizon)) + 1e-9:
            x, z, heading, _ = self.interpolate(path, route_distance + max(0.0, speed) * value, agent_type)
            samples.append({"time": round(value, 3), "x": x, "z": z, "heading": heading})
            value += step
        return samples

    @staticmethod
    def turn_angle(path: GraphPath, segment: int) -> float:
        if segment + 2 >= len(path.points):
            return 0.0
        first, second, third = path.points[segment], path.points[segment + 1], path.points[segment + 2]
        heading_a = math.atan2(second[0] - first[0], second[1] - first[1])
        heading_b = math.atan2(third[0] - second[0], third[1] - second[1])
        return abs((math.degrees(heading_b - heading_a) + 180) % 360 - 180)
