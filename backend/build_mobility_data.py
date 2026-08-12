from __future__ import annotations

"""Build the transplant-safe mobility graph and POIs from the team data.

The archive contains road polygons and GLB building IDs, but not surveyed lane,
sidewalk, or entrance centerlines.  This generator keeps every derived value
explicit and reproducible so it can later be replaced by authored GIS data.
"""

import argparse
import json
import math
from pathlib import Path


Point = tuple[float, float]

# Known GLB display-space centers mapped back through CampusTrafficSimulation's
# documented coordinateConfig. They are target hints only; entrances are snapped
# to the nearest accessible route segment and never placed at the building center.
BUILDING_TARGETS = {
    "BLD_D4": {"name": "공과대학 3호관", "display": (-214.35, -93.25), "category": "academic"},
    "BLD_D3": {"name": "공과대학 2호관", "display": (-161.23, -68.59), "category": "academic"},
    "BLD_D2": {"name": "공과대학 1호관", "display": (-129.92, -119.53), "category": "academic"},
    "BLD_C1": {"name": "도서관", "display": (-61.76, -92.11), "category": "library"},
    "BLD_E1": {"name": "학생회관", "display": (-29.27, -11.69), "category": "student_center"},
    "BLD_A1": {"name": "대학본부", "display": (42.21, 38.64), "category": "administration"},
}
DISPLAY_ORIGIN = (-214.35, -93.251)
DISPLAY_SCALE = 0.6242171526


def midpoint(points: list[list[float]]) -> Point:
    first, second = points[0], points[1]
    return ((float(first[0]) + float(second[0])) / 2, (float(first[1]) + float(second[1])) / 2)


def closest_point(point: Point, first: Point, second: Point) -> Point:
    dx, dz = second[0] - first[0], second[1] - first[1]
    length_squared = dx * dx + dz * dz
    if length_squared <= 1e-9:
        return first
    ratio = max(0.0, min(1.0, ((point[0] - first[0]) * dx + (point[1] - first[1]) * dz) / length_squared))
    return first[0] + ratio * dx, first[1] + ratio * dz


def simulation_point(display: tuple[float, float]) -> Point:
    return (
        (display[0] - DISPLAY_ORIGIN[0]) / DISPLAY_SCALE,
        -(display[1] - DISPLAY_ORIGIN[1]) / DISPLAY_SCALE,
    )


def unique_pairs(nodes: list[dict]) -> set[tuple[int, int]]:
    """Connect spatial neighbors and add a small Prim tree for connectivity."""
    points = [(node["x"], node["z"]) for node in nodes]
    pairs: set[tuple[int, int]] = set()
    for index, point in enumerate(points):
        ranked = sorted((math.dist(point, other), other_index) for other_index, other in enumerate(points) if other_index != index)
        for distance, other_index in ranked[:3]:
            if distance <= 85:
                pairs.add(tuple(sorted((index, other_index))))

    connected = {0}
    while len(connected) < len(nodes):
        distance, first, second = min(
            (math.dist(points[a], points[b]), a, b)
            for a in connected
            for b in range(len(nodes))
            if b not in connected
        )
        pairs.add(tuple(sorted((first, second))))
        connected.add(second)
    return pairs


def build(routes: dict) -> tuple[dict, dict, dict]:
    features = routes["features"]
    graph_nodes = []
    route_segments: list[tuple[Point, Point, dict]] = []
    for index, feature in enumerate(features):
        props = feature["properties"]
        coordinates = feature["geometry"]["coordinates"]
        point = midpoint(coordinates)
        node_id = f"ROAD_NODE_{index + 1:03d}"
        road_ids = props.get("road_ids") or []
        graph_nodes.append({
            "id": node_id,
            "x": round(point[0], 3),
            "z": round(point[1], 3),
            "kind": "crosswalk" if any(str(value).startswith("CW_") for value in road_ids) else "intersection",
            "source_route_id": props["route_id"],
            "road_id": road_ids[0] if road_ids else None,
        })
        route_segments.append(((float(coordinates[0][0]), float(coordinates[0][1])), (float(coordinates[1][0]), float(coordinates[1][1])), props))

    edges = []
    edge_counter = 0
    for first_index, second_index in sorted(unique_pairs(graph_nodes)):
        first, second = graph_nodes[first_index], graph_nodes[second_index]
        is_crosswalk = first["kind"] == "crosswalk" or second["kind"] == "crosswalk"
        road_ids = [value for value in (first.get("road_id"), second.get("road_id")) if value]
        for suffix, kind, allowed in (
            ("vehicle", "crosswalk" if is_crosswalk else "road", ["car", "scooter"]),
            ("walk", "crosswalk" if is_crosswalk else "shared_path_derived", ["person", "scooter"]),
        ):
            edge_counter += 1
            edges.append({
                "id": f"EDGE_{edge_counter:04d}_{suffix}",
                "from": first["id"],
                "to": second["id"],
                "bidirectional": True,
                "kind": kind,
                "allowed_types": allowed,
                "speed_limit": 10 if is_crosswalk else (25 if suffix == "vehicle" else 12),
                "road_ids": road_ids,
                "coordinates": [[first["x"], first["z"]], [second["x"], second["z"]]],
                "derived": True,
            })

    def nearest_route_point(target: Point) -> tuple[Point, str, str | None]:
        choices = []
        for index, (first, second, props) in enumerate(route_segments):
            projected = closest_point(target, first, second)
            choices.append((math.dist(target, projected), projected, graph_nodes[index]["id"], (props.get("road_ids") or [None])[0]))
        _, projected, node_id, road_id = min(choices, key=lambda value: value[0])
        return projected, node_id, road_id

    pois: list[dict] = []
    entrance_records: list[dict] = []
    for building_id, definition in BUILDING_TARGETS.items():
        target = simulation_point(definition["display"])
        position, road_node, road_id = nearest_route_point(target)
        entrance_id = f"ENT_{building_id.removeprefix('BLD_')}_MAIN"
        node_id = f"POI_{entrance_id}"
        graph_nodes.append({"id": node_id, "x": round(position[0], 3), "z": round(position[1], 3), "kind": "building_entrance", "poi_id": building_id})
        edge_counter += 1
        road_node_data = next(node for node in graph_nodes if node["id"] == road_node)
        edges.append({
            "id": f"EDGE_{edge_counter:04d}_entrance", "from": road_node, "to": node_id,
            "bidirectional": True, "kind": "building_entrance", "allowed_types": ["person", "scooter"],
            "speed_limit": 8, "road_ids": [road_id] if road_id else [],
            "coordinates": [[road_node_data["x"], road_node_data["z"]], [round(position[0], 3), round(position[1], 3)]], "derived": True,
        })
        poi = {"poi_id": building_id, "name": definition["name"], "kind": "building", "category": definition["category"], "node_id": node_id, "allowed_types": ["person", "scooter"], "external": False}
        pois.append(poi)
        entrance_records.append({"building_id": building_id, "building_name": definition["name"], "source": "GLB center hint snapped to nearest derived route", "entrances": [{"entrance_id": entrance_id, "position": [round(position[0], 3), 0, round(position[1], 3)], "node_id": node_id, "allowed_types": ["person", "scooter"]}]})

    def add_poi(poi_id: str, name: str, kind: str, route_keyword: str, allowed: list[str], external: bool = False, extend: float = 0.0) -> None:
        nonlocal edge_counter
        candidates = [(index, feature) for index, feature in enumerate(features) if route_keyword in feature["properties"]["name"]]
        if not candidates:
            raise ValueError(f"POI {poi_id}: route keyword not found: {route_keyword}")
        index, feature = candidates[0]
        road_node = graph_nodes[index]
        point = (road_node["x"], road_node["z"])
        if extend:
            campus_center = (260.0, -80.0)
            dx, dz = point[0] - campus_center[0], point[1] - campus_center[1]
            length = max(math.hypot(dx, dz), 1)
            point = point[0] + dx / length * extend, point[1] + dz / length * extend
        node_id = f"POI_{poi_id}"
        graph_nodes.append({"id": node_id, "x": round(point[0], 3), "z": round(point[1], 3), "kind": kind, "poi_id": poi_id})
        if external or kind == "gate":
            connectors = [("gate_vehicle", [value for value in allowed if value in {"car", "scooter"}]), ("pedestrian_gate", [value for value in allowed if value in {"person", "scooter"}])]
        elif kind == "parking":
            connectors = [("parking_connection", [value for value in allowed if value == "car"]), ("parking_walk", [value for value in allowed if value == "person"])]
        else:
            connectors = [(kind, allowed)]
        for connector_kind, connector_allowed in connectors:
            if not connector_allowed:
                continue
            edge_counter += 1
            edges.append({
                "id": f"EDGE_{edge_counter:04d}_poi", "from": road_node["id"], "to": node_id, "bidirectional": True,
                "kind": connector_kind, "allowed_types": connector_allowed, "speed_limit": 12,
                "road_ids": feature["properties"].get("road_ids") or [],
                "coordinates": [[road_node["x"], road_node["z"]], [round(point[0], 3), round(point[1], 3)]], "derived": True,
            })
        pois.append({"poi_id": poi_id, "name": name, "kind": kind, "node_id": node_id, "allowed_types": allowed, "external": external})

    add_poi("GATE_MAIN", "정문", "gate", "정문앞길", ["car", "person", "scooter"])
    add_poi("EXTERNAL_MAIN_ROAD_SOUTH", "정문 외부 도로", "external", "정문앞길", ["car", "person", "scooter"], True, 55)
    add_poi("GATE_BACK", "후문", "gate", "후문초입로", ["car", "person", "scooter"])
    add_poi("EXTERNAL_BACK_GATE", "후문 외부", "external", "후문초입로", ["car", "person", "scooter"], True, 45)
    add_poi("PARKING_A", "산단 1주차장", "parking", "산단1주차장", ["car", "person"])
    add_poi("PARKING_B", "사과대 주차장", "parking", "사과대주차장길", ["car", "person"])
    add_poi("SCOOTER_PARKING_01", "도서관 킥보드 주차", "scooter_parking", "중앙교차로", ["person", "scooter"])
    add_poi("SCOOTER_PARKING_02", "학생회관 킥보드 주차", "scooter_parking", "학생회관삼거리", ["person", "scooter"])

    graph = {
        "metadata": {
            "coordinate_system": "local meters, x=east, z=north",
            "source": "routes.geojson generated from team road polygons",
            "status": "derived transplant data; replace with surveyed road/sidewalk centerlines",
            "routing": "bidirectional weighted graph; shortest path is filtered by allowed_types",
        },
        "nodes": graph_nodes,
        "edges": edges,
        "pois": pois,
    }
    node_features = [{"type": "Feature", "properties": {key: value for key, value in node.items() if key not in {"x", "z"}}, "geometry": {"type": "Point", "coordinates": [node["x"], node["z"]]}} for node in graph_nodes]
    nodes_geojson = {"type": "FeatureCollection", "metadata": graph["metadata"], "features": node_features}
    entrances = {"metadata": {"status": "derived; replace with surveyed entrances"}, "buildings": entrance_records}
    return graph, nodes_geojson, entrances


def main() -> None:
    parser = argparse.ArgumentParser(description="Build OD mobility graph and entrance data.")
    data_dir = Path(__file__).resolve().parent / "simulation" / "data"
    parser.add_argument("--routes", type=Path, default=data_dir / "routes.geojson")
    parser.add_argument("--output", type=Path, default=data_dir / "mobility_graph.json")
    parser.add_argument("--nodes", type=Path, default=data_dir / "nodes.geojson")
    parser.add_argument("--entrances", type=Path, default=data_dir / "building_entrances.json")
    args = parser.parse_args()
    graph, nodes, entrances = build(json.loads(args.routes.read_text(encoding="utf-8")))
    for path, payload in ((args.output, graph), (args.nodes, nodes), (args.entrances, entrances)):
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges, {len(graph['pois'])} POIs")


if __name__ == "__main__":
    main()
