from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

try:
    from .data_loader import DataValidationError, load_feature_collection
except ImportError:
    from data_loader import DataValidationError, load_feature_collection


Point = Tuple[float, float]


@dataclass(frozen=True)
class Route:
    route_id: str
    name: str
    allowed_types: Tuple[str, ...]
    speed_limit: float
    loop: bool
    points: Tuple[Point, ...]
    road_ids: Tuple[str, ...]
    segment_lengths: Tuple[float, ...]
    cumulative_lengths: Tuple[float, ...]
    total_length: float


class RouteManager:
    def __init__(self, geojson_path: str | Path) -> None:
        self.routes: Dict[str, Route] = {}
        self.load(geojson_path)

    def load(self, geojson_path: str | Path) -> None:
        payload = load_feature_collection(geojson_path)
        routes: Dict[str, Route] = {}
        for index, feature in enumerate(payload["features"]):
            try:
                props = feature["properties"]
                geometry = feature["geometry"]
                if geometry.get("type") != "LineString":
                    raise DataValidationError("경로 geometry는 LineString이어야 합니다.")
                coordinates = geometry.get("coordinates", [])
                if len(coordinates) < 2:
                    raise DataValidationError("경로에는 최소 두 좌표가 필요합니다.")
                points = tuple(self._point(value) for value in coordinates)
                route_id = str(props["route_id"])
                allowed = tuple(props.get("allowed_types") or ())
                if not allowed or any(t not in {"car", "person", "scooter"} for t in allowed):
                    raise DataValidationError("allowed_types가 올바르지 않습니다.")
                lengths = tuple(math.dist(points[i], points[i + 1]) for i in range(len(points) - 1))
                if any(length <= 0 for length in lengths):
                    raise DataValidationError("연속한 중복 좌표는 허용되지 않습니다.")
                cumulative = [0.0]
                for length in lengths:
                    cumulative.append(cumulative[-1] + length)
                # GeoJSON speed_limit is km/h; internal engine uses m/s.
                speed_limit = float(props.get("speed_limit", 10)) / 3.6
                routes[route_id] = Route(
                    route_id=route_id,
                    name=str(props.get("name", route_id)),
                    allowed_types=allowed,
                    speed_limit=speed_limit,
                    loop=bool(props.get("loop", False)),
                    points=points,
                    road_ids=tuple(props.get("road_ids") or ()),
                    segment_lengths=lengths,
                    cumulative_lengths=tuple(cumulative),
                    total_length=cumulative[-1],
                )
            except (KeyError, TypeError, ValueError, DataValidationError) as exc:
                raise DataValidationError(f"routes.geojson feature {index} 오류: {exc}") from exc
        if not routes:
            raise DataValidationError("사용 가능한 경로가 없습니다.")
        self.routes = routes

    def for_type(self, entity_type: str) -> List[Route]:
        return [route for route in self.routes.values() if entity_type in route.allowed_types]

    def get(self, route_id: str) -> Route:
        try:
            return self.routes[route_id]
        except KeyError as exc:
            raise KeyError(f"알 수 없는 경로입니다: {route_id}") from exc

    def interpolate(self, route_id: str, distance: float) -> Tuple[float, float, float, int]:
        route = self.get(route_id)
        if route.loop:
            distance %= route.total_length
        else:
            distance = min(max(0.0, distance), route.total_length)
        segment_index = len(route.segment_lengths) - 1
        for index, end in enumerate(route.cumulative_lengths[1:]):
            if distance <= end:
                segment_index = index
                break
        start_distance = route.cumulative_lengths[segment_index]
        segment_length = route.segment_lengths[segment_index]
        ratio = (distance - start_distance) / segment_length
        p1, p2 = route.points[segment_index], route.points[segment_index + 1]
        x = p1[0] + (p2[0] - p1[0]) * ratio
        z = p1[1] + (p2[1] - p1[1]) * ratio
        heading = (math.degrees(math.atan2(p2[0] - p1[0], p2[1] - p1[1])) + 360) % 360
        return x, z, heading, segment_index

    @staticmethod
    def _point(value: Sequence[float]) -> Point:
        if len(value) < 2:
            raise DataValidationError("좌표는 [x, z] 형식이어야 합니다.")
        point = float(value[0]), float(value[1])
        if not all(math.isfinite(v) for v in point):
            raise DataValidationError("좌표에 NaN/무한값을 사용할 수 없습니다.")
        return point
