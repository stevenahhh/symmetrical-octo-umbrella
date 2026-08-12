from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def migrate(graph: dict) -> dict:
    nodes = {str(node["id"]): node for node in graph["nodes"]}
    features = []
    for node in graph["nodes"]:
        properties = {key: value for key, value in node.items() if key not in {"x", "z"}}
        properties.update({
            "feature_type": "node",
            "source": "derived",
            "confidence": 0.35,
            "derived": True,
        })
        features.append({
            "type": "Feature", "id": str(node["id"]), "properties": properties,
            "geometry": {"type": "Point", "coordinates": [node["x"], node["z"]]},
        })

    kind_alias = {
        "road": "allowed_road",
        "shared_path_derived": "shared_path",
        "gate_vehicle": "vehicle_gate",
        "scooter_parking": "scooter_parking_connection",
    }
    for edge in graph["edges"]:
        legacy_kind = str(edge["kind"])
        allowed = list(edge["allowed_types"])
        kind = kind_alias.get(legacy_kind, legacy_kind)
        # A legacy 'crosswalk' vehicle edge represents the lane crossing the
        # mapped CW location, not a pedestrian crosswalk geometry.
        crosswalk_id = next((value for value in edge.get("road_ids", []) if str(value).startswith("CW_")), None)
        if legacy_kind == "crosswalk" and "car" in allowed:
            kind = "allowed_road"
        elif legacy_kind == "crosswalk":
            kind = "crosswalk"
            allowed = [value for value in allowed if value in {"person", "scooter"}]
        elif kind == "building_entrance":
            allowed = ["person"]
        elif kind == "scooter_parking_connection":
            allowed = ["scooter"]
        coordinates = [list(point) for point in edge["coordinates"]]
        if len(coordinates) >= 2 and coordinates[0][:2] == coordinates[-1][:2]:
            # Preserve the existing runtime safeguard explicitly. This is a
            # derived topology connector, not a surveyed displacement.
            coordinates[-1][0] = round(float(coordinates[-1][0]) + 0.01, 3)
        properties = {
            "id": str(edge["id"]),
            "feature_type": "edge",
            "kind": kind,
            "legacy_kind": legacy_kind,
            "allowed_types": allowed,
            "from_node": str(edge["from"]),
            "to_node": str(edge["to"]),
            "bidirectional": bool(edge.get("bidirectional", False)),
            "speed_limit": edge.get("speed_limit"),
            "road_ids": list(edge.get("road_ids") or []),
            "crosswalk_id": crosswalk_id,
            "source_id": str(edge["id"]),
            "source": "derived_from_vehicle_network",
            "confidence": 0.2 if legacy_kind == "shared_path_derived" else 0.35,
            "derived": True,
            "authoritative": False,
        }
        features.append({
            "type": "Feature", "id": properties["id"], "properties": properties,
            "geometry": {"type": "LineString", "coordinates": coordinates},
        })

    for poi in graph["pois"]:
        node = nodes[str(poi["node_id"])]
        properties = dict(poi)
        properties.update({
            "id": str(poi["poi_id"]), "feature_type": "poi", "source": "derived",
            "confidence": 0.3, "derived": True, "authoritative": False,
        })
        features.append({
            "type": "Feature", "id": properties["id"], "properties": properties,
            "geometry": {"type": "Point", "coordinates": [node["x"], node["z"]]},
        })
    return {
        "type": "FeatureCollection",
        "metadata": {
            "schema_version": 1,
            "coordinate_system": graph.get("metadata", {}).get("coordinate_system", "local meters, x=east, z=north"),
            "source_of_truth": True,
            "authoritative_geometry_available": False,
            "status": "Legacy derived network imported for traceability. Replace with surveyed/CAD/GIS or GLB-digitized features.",
            "generated_from": "mobility_graph.json",
        },
        "features": features,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Import the legacy graph into the transport-network GeoJSON schema.")
    parser.add_argument("--input", type=Path, default=DATA / "mobility_graph.json")
    parser.add_argument("--output", type=Path, default=DATA / "campus_transport_network.geojson")
    args = parser.parse_args()
    payload = migrate(json.loads(args.input.read_text(encoding="utf-8")))
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(payload['features'])} features -> {args.output}")


if __name__ == "__main__":
    main()
