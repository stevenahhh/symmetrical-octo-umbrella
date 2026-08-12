from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from simulation.network_schema import iter_features, load_feature_collection, load_policy, normalize_kind


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def buffered_rectangle(coordinates, width):
    first, last = coordinates[0], coordinates[-1]
    dx, dz = last[0] - first[0], last[1] - first[1]
    length = max(math.hypot(dx, dz), 1e-9)
    nx, nz = -dz / length * width / 2, dx / length * width / 2
    return [[first[0] + nx, first[1] + nz], [last[0] + nx, last[1] + nz], [last[0] - nx, last[1] - nz], [first[0] - nx, first[1] - nz], [first[0] + nx, first[1] + nz]]


def build(network: dict, policy: dict) -> dict:
    edges = list(iter_features(network, "edge"))
    nodes = {feature.feature_id: feature for feature in iter_features(network, "node")}
    roads = [edge for edge in edges if normalize_kind(str(edge.properties.get("kind")), policy) in {"vehicle_lane", "allowed_road"}]
    areas = []
    groups = {}
    for crosswalk in (edge for edge in edges if normalize_kind(str(edge.properties.get("kind")), policy) == "crosswalk"):
        crosswalk_id = crosswalk.properties.get("crosswalk_id") or crosswalk.feature_id
        groups.setdefault(crosswalk_id, []).append(crosswalk)
    for crosswalk_id, crosswalks in groups.items():
        related_nodes = {str(value) for edge in crosswalks for value in (edge.properties.get("from_node"), edge.properties.get("to_node"))}
        crosswalk_node = next((nodes[node_id] for node_id in related_nodes if nodes.get(node_id) and nodes[node_id].properties.get("road_id") == crosswalk_id), None)
        if crosswalk_node:
            x, z = map(float, crosswalk_node.coordinates[:2])
        else:
            points = [point for edge in crosswalks for point in edge.coordinates]
            x, z = sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)
        half = 2.5
        polygon = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half], [x - half, z - half]]
        intersecting = [road.feature_id for road in roads if related_nodes & {str(road.properties.get("from_node")), str(road.properties.get("to_node"))}]
        areas.append({
            "conflict_area_id": f"CA_{crosswalk_id}", "crosswalk_id": crosswalk_id,
            "crosswalk_edge_ids": [edge.feature_id for edge in crosswalks],
            "intersecting_vehicle_lanes": intersecting, "participants": ["car", "person", "scooter"],
            "source": "derived", "confidence": min(float(edge.properties.get("confidence") or 0) for edge in crosswalks),
            "derived": True, "geometry_note": "5 m square around metadata-mapped crosswalk node; not a surveyed crosswalk polygon",
            "geometry": {"type": "Polygon", "coordinates": [polygon]},
        })
    return {"metadata": {"status": "derived until crosswalk and lane geometries are authoritative"}, "conflict_areas": areas}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build crosswalk/vehicle conflict areas.")
    parser.add_argument("--network", type=Path, default=DATA / "campus_transport_network.geojson")
    parser.add_argument("--policy", type=Path, default=ROOT / "config" / "mobility_policy.json")
    parser.add_argument("--output", type=Path, default=DATA / "conflict_areas.json")
    args = parser.parse_args()
    payload = build(load_feature_collection(args.network), load_policy(args.policy))
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(payload['conflict_areas'])} conflict areas -> {args.output}")


if __name__ == "__main__":
    main()
