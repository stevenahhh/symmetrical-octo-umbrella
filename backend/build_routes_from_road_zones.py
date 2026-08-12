from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Iterable, Sequence


REFERENCE_LONGITUDE = 127.4764043
REFERENCE_LATITUDE = 34.9700548
EARTH_RADIUS_METERS = 6_378_137.0

# The teammate data contains polygons for intersections and metadata-only
# crosswalk records. These explicit links preserve crosswalk semantics without
# pretending that the metadata contains measured crosswalk geometry.
CROSSWALK_BY_ZONE = {
    "공대3호관삼거리": "CW_019",
    "공학교차로": "CW_022",
    "대학본부사거리": "CW_012",
    "박물관삼거리": "CW_006",
    "사과대사거리": "CW_018",
    "사범대학1호관삼거리": "CW_023",
    "산단1주차장": "CW_003",
    "산단2주차장": "CW_002",
    "산단3주차장": "CW_001",
    "약대사거리": "CW_016",
    "인예대삼거리": "CW_017",
    "정문앞길": "CW_007",
    "중앙교차로": "CW_014",
    "학생회관삼거리": "CW_015",
}


Point = tuple[float, float]


def project(point: Sequence[float]) -> Point:
    longitude, latitude = float(point[0]), float(point[1])
    latitude_radians = math.radians(REFERENCE_LATITUDE)
    x = math.radians(longitude - REFERENCE_LONGITUDE) * EARTH_RADIUS_METERS * math.cos(latitude_radians)
    z = math.radians(latitude - REFERENCE_LATITUDE) * EARTH_RADIUS_METERS
    return x, z


def signed_area(ring: Sequence[Point]) -> float:
    return sum(
        ring[index][0] * ring[(index + 1) % len(ring)][1]
        - ring[(index + 1) % len(ring)][0] * ring[index][1]
        for index in range(len(ring))
    ) / 2.0


def centroid(ring: Sequence[Point]) -> Point:
    area = signed_area(ring)
    if abs(area) < 1e-9:
        return (
            sum(point[0] for point in ring) / len(ring),
            sum(point[1] for point in ring) / len(ring),
        )
    factor = 1.0 / (6.0 * area)
    cx = cz = 0.0
    for index, first in enumerate(ring):
        second = ring[(index + 1) % len(ring)]
        cross = first[0] * second[1] - second[0] * first[1]
        cx += (first[0] + second[0]) * cross
        cz += (first[1] + second[1]) * cross
    return cx * factor, cz * factor


def point_in_ring(point: Point, ring: Sequence[Point]) -> bool:
    x, z = point
    inside = False
    previous = ring[-1]
    for current in ring:
        if (current[1] > z) != (previous[1] > z):
            crossing_x = (previous[0] - current[0]) * (z - current[1]) / (previous[1] - current[1]) + current[0]
            if x < crossing_x:
                inside = not inside
        previous = current
    return inside


def principal_direction(ring: Sequence[Point], center: Point) -> Point:
    xx = zz = xz = 0.0
    for x, z in ring:
        dx, dz = x - center[0], z - center[1]
        xx += dx * dx
        zz += dz * dz
        xz += dx * dz
    angle = 0.5 * math.atan2(2.0 * xz, xx - zz)
    return math.cos(angle), math.sin(angle)


def line_edge_intersection(center: Point, direction: Point, first: Point, second: Point) -> float | None:
    edge = second[0] - first[0], second[1] - first[1]
    denominator = direction[0] * edge[1] - direction[1] * edge[0]
    if abs(denominator) < 1e-9:
        return None
    offset = first[0] - center[0], first[1] - center[1]
    t = (offset[0] * edge[1] - offset[1] * edge[0]) / denominator
    u = (offset[0] * direction[1] - offset[1] * direction[0]) / denominator
    return t if -1e-8 <= u <= 1.0 + 1e-8 else None


def representative_centerline(ring: Sequence[Point]) -> tuple[Point, Point]:
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    center = centroid(ring)
    direction = principal_direction(ring, center)
    intersections = []
    for index, first in enumerate(ring):
        value = line_edge_intersection(center, direction, first, ring[(index + 1) % len(ring)])
        if value is not None and not any(abs(value - known) < 1e-6 for known in intersections):
            intersections.append(value)
    intersections.sort()
    intervals = []
    for start, end in zip(intersections, intersections[1:]):
        midpoint = (start + end) / 2.0
        sample = center[0] + midpoint * direction[0], center[1] + midpoint * direction[1]
        if point_in_ring(sample, ring):
            intervals.append((end - start, start, end))
    if not intervals:
        raise ValueError("폴리곤 안에서 중심선 구간을 찾지 못했습니다.")
    _, start, end = max(intervals)
    inset = min(0.75, max(0.0, (end - start - 2.0) / 2.0))
    start += inset
    end -= inset
    return (
        (center[0] + start * direction[0], center[1] + start * direction[1]),
        (center[0] + end * direction[0], center[1] + end * direction[1]),
    )


def polygon_rings(geometry: dict) -> Iterable[Sequence[Sequence[float]]]:
    if geometry.get("type") == "Polygon":
        yield geometry["coordinates"][0]
    elif geometry.get("type") == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            yield polygon[0]
    else:
        raise ValueError(f"지원하지 않는 geometry입니다: {geometry.get('type')}")


def load_road_ids(path: Path) -> dict[str, str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        element["name"]: element["element_id"]
        for element in payload.get("elements", [])
        if str(element.get("element_id", "")).startswith("RD_")
    }


def build_routes(road_zones: dict, road_ids: dict[str, str]) -> tuple[dict, dict]:
    routes = []
    traffic_lights = []
    for feature_index, source in enumerate(road_zones["features"], start=1):
        name = source["properties"]["ZONE_NAME"]
        candidates = []
        for raw_ring in polygon_rings(source["geometry"]):
            ring = [project(point) for point in raw_ring]
            try:
                start, end = representative_centerline(ring)
            except ValueError:
                continue
            candidates.append((math.dist(start, end), start, end))
        if not candidates:
            raise ValueError(f"{name}: 유효한 중심선을 생성하지 못했습니다.")
        length, start, end = max(candidates)
        if length < 2.0:
            raise ValueError(f"{name}: 생성된 중심선이 너무 짧습니다 ({length:.2f}m).")

        crosswalk_id = CROSSWALK_BY_ZONE.get(name)
        road_id = road_ids.get(name)
        location_ids = [crosswalk_id or road_id] if crosswalk_id or road_id else []
        is_parking = "주차장" in name
        speed_limit = 10 if is_parking else 15 if crosswalk_id or any(word in name for word in ("삼거리", "사거리", "교차로")) else 25
        if crosswalk_id:
            allowed_types = ["car", "person", "scooter"]
        elif is_parking:
            allowed_types = ["car"]
        else:
            # No sidewalk/path geometry exists in the teammate archive. Keep
            # pedestrians on the explicitly mapped crosswalk/intersection
            # routes instead of making them walk along vehicle-only roads.
            allowed_types = ["car", "scooter"]
        coordinates = [
            [round(start[0], 3), round(start[1], 3)],
            [round(end[0], 3), round(end[1], 3)],
        ]
        source_id = source.get("id") or source["properties"].get("FEATURE_ID") or f"RZ-{feature_index:03d}"
        routes.append(
            {
                "type": "Feature",
                "properties": {
                    "route_id": f"campus_{source_id.lower()}",
                    "name": f"{name} 중심선",
                    "allowed_types": allowed_types,
                    "speed_limit": speed_limit,
                    "loop": False,
                    "road_ids": location_ids,
                    "source_feature_id": source_id,
                    "source_geometry": source["geometry"]["type"],
                    "centerline_method": "principal-axis-clipped",
                },
                "geometry": {"type": "LineString", "coordinates": coordinates},
            }
        )
        if crosswalk_id:
            midpoint = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0]
            traffic_lights.append(
                {
                    "signal_id": f"SIG_{crosswalk_id.removeprefix('CW_')}",
                    "crosswalk_id": crosswalk_id,
                    "x": round(midpoint[0], 3),
                    "z": round(midpoint[1], 3),
                    "state": "green",
                }
            )

    route_collection = {
        "type": "FeatureCollection",
        "metadata": {
            "coordinate_status": "local_metric_centerlines_derived_from_team_road_polygons",
            "source": "docs/assets/data/road_zones_wgs84.geojson",
            "source_crs": "EPSG:4326 (source metadata records EPSG:5179 before export)",
            "reference": {"longitude": REFERENCE_LONGITUDE, "latitude": REFERENCE_LATITUDE},
            "axes": "x=east, z=north, units=meters",
            "method": "Each polygon is projected to local meters; its principal axis is clipped to the longest interior interval.",
            "limitations": "The teammate archive has no authored centerline or pedestrian-path geometry. These deterministic centerlines stay inside the supplied road polygons and can be regenerated with backend/build_routes_from_road_zones.py.",
        },
        "features": routes,
    }
    return route_collection, {"traffic_lights": traffic_lights}


def main() -> None:
    parser = argparse.ArgumentParser(description="팀 도로 폴리곤에서 시뮬레이션용 로컬 미터 중심선을 생성합니다.")
    data_dir = Path(__file__).resolve().parent / "simulation" / "data"
    parser.add_argument("--road-zones", type=Path, default=data_dir / "source" / "road_zones_wgs84.geojson")
    parser.add_argument("--elements", type=Path, default=data_dir / "source" / "common_elemetns.json")
    parser.add_argument("--output", type=Path, default=data_dir / "routes.geojson")
    parser.add_argument("--traffic-lights-output", type=Path, default=data_dir / "traffic_lights.json")
    args = parser.parse_args()

    road_zones = json.loads(args.road_zones.read_text(encoding="utf-8"))
    routes, traffic_lights = build_routes(road_zones, load_road_ids(args.elements))
    args.output.write_text(json.dumps(routes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.traffic_lights_output.write_text(json.dumps(traffic_lights, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(routes['features'])}개 중심선과 {len(traffic_lights['traffic_lights'])}개 신호 상태 지점을 생성했습니다.")


if __name__ == "__main__":
    main()
