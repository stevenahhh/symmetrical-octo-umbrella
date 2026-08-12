from __future__ import annotations

import argparse
import json
from pathlib import Path

from simulation.network_schema import iter_features, load_feature_collection, load_policy, normalize_kind


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def build(network: dict, policy: dict, authoritative_only: bool = False) -> dict:
    nodes = []
    node_ids = set()
    edges = []
    pois = []
    for feature in iter_features(network, "node"):
        if feature.geometry_type != "Point" or not feature.feature_id:
            continue
        x, z = feature.coordinates[:2]
        props = feature.properties
        nodes.append({
            "id": feature.feature_id, "x": float(x), "z": float(z),
            "kind": props.get("kind", "network_endpoint"),
            **{key: props[key] for key in ("source_route_id", "road_id", "poi_id") if props.get(key) is not None},
        })
        node_ids.add(feature.feature_id)
    for feature in iter_features(network, "edge"):
        props = feature.properties
        if authoritative_only and (props.get("derived") or not props.get("authoritative", False)):
            continue
        source, target = str(props.get("from_node") or ""), str(props.get("to_node") or "")
        if source not in node_ids or target not in node_ids:
            continue
        kind = normalize_kind(str(props.get("kind") or ""), policy)
        edges.append({
            "id": feature.feature_id, "from": source, "to": target,
            "bidirectional": bool(props.get("bidirectional", True)), "kind": kind,
            "allowed_types": list(props.get("allowed_types") or policy["kinds"].get(kind, {}).get("allowed_types") or []),
            "speed_limit": props.get("speed_limit") or 10,
            "road_ids": list(props.get("road_ids") or ([props["crosswalk_id"]] if props.get("crosswalk_id") else [])),
            "coordinates": feature.coordinates,
            "derived": bool(props.get("derived", False)),
            "source": props.get("source", "unknown"),
            "confidence": props.get("confidence"),
        })
    for feature in iter_features(network, "poi"):
        props = feature.properties
        if authoritative_only and (props.get("derived") or not props.get("authoritative", False)):
            continue
        pois.append({
            "poi_id": str(props.get("poi_id") or feature.feature_id),
            "name": props.get("name", feature.feature_id), "kind": props.get("kind", "poi"),
            "category": props.get("category"), "node_id": str(props["node_id"]),
            "allowed_types": list(props.get("allowed_types") or []),
            "external": bool(props.get("external", False)),
            "derived": bool(props.get("derived", False)),
            "source": props.get("source", "unknown"), "confidence": props.get("confidence"),
        })
    return {
        "metadata": {
            "coordinate_system": network.get("metadata", {}).get("coordinate_system", "local meters, x=east, z=north"),
            "source": "campus_transport_network.geojson",
            "authoritative_only": authoritative_only,
            "routing": "bidirectional weighted graph; shortest path filtered by allowed_types",
            "derived_lateral_offsets_m": policy.get("derived_lateral_offsets_m", {}),
            "offset_note": policy.get("offset_note"),
        },
        "nodes": nodes, "edges": edges, "pois": pois,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build mobility_graph.json from campus_transport_network.geojson")
    parser.add_argument("--network", type=Path, default=DATA / "campus_transport_network.geojson")
    parser.add_argument("--policy", type=Path, default=ROOT / "config" / "mobility_policy.json")
    parser.add_argument("--output", type=Path, default=DATA / "mobility_graph.json")
    parser.add_argument("--authoritative-only", action="store_true", help="Exclude derived/unapproved features.")
    args = parser.parse_args()
    graph = build(load_feature_collection(args.network), load_policy(args.policy), args.authoritative_only)
    args.output.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges, {len(graph['pois'])} POIs -> {args.output}")


if __name__ == "__main__":
    main()
