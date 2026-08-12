from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict, deque
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Set, Tuple

from simulation.network_schema import iter_features, line_length, load_feature_collection, load_policy, normalize_kind, validate_edge


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def orientation(a, b, c):
    value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
    return 0 if abs(value) < 1e-8 else 1 if value > 0 else 2


def segments_intersect(a, b, c, d) -> bool:
    return orientation(a, b, c) != orientation(a, b, d) and orientation(c, d, a) != orientation(c, d, b)


def line_intersects(first: Sequence[Sequence[float]], second: Sequence[Sequence[float]]) -> bool:
    return any(segments_intersect(a[:2], b[:2], c[:2], d[:2]) for a, b in zip(first, first[1:]) for c, d in zip(second, second[1:]))


def component_count(nodes: Set[str], edges: Iterable[Tuple[str, str]]) -> Tuple[int, int]:
    adjacency = {node: set() for node in nodes}
    for source, target in edges:
        if source in adjacency and target in adjacency:
            adjacency[source].add(target)
            adjacency[target].add(source)
    active = {node for node, neighbors in adjacency.items() if neighbors}
    unseen = set(active)
    components = 0
    largest = 0
    while unseen:
        components += 1
        start = unseen.pop()
        queue = deque([start])
        size = 0
        while queue:
            current = queue.popleft()
            size += 1
            for neighbor in adjacency[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    queue.append(neighbor)
        largest = max(largest, size)
    return components, largest


def validate(network: dict, policy: dict) -> dict:
    errors: List[Dict] = []
    warnings: List[Dict] = []
    nodes = {}
    pois = []
    edges = []
    duplicate_positions = defaultdict(list)
    for feature in iter_features(network):
        if feature.feature_type == "node":
            if feature.geometry_type != "Point" or not isinstance(feature.coordinates, list) or len(feature.coordinates) < 2:
                errors.append({"code": "INVALID_NODE_GEOMETRY", "feature_id": feature.feature_id})
                continue
            point = feature.coordinates[:2]
            if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in point):
                errors.append({"code": "INVALID_NODE_COORDINATE", "feature_id": feature.feature_id})
                continue
            nodes[feature.feature_id] = feature
            duplicate_positions[(round(point[0], 4), round(point[1], 4))].append(feature.feature_id)
        elif feature.feature_type == "edge":
            for message in validate_edge(feature, policy):
                errors.append({"code": "INVALID_EDGE", "feature_id": feature.feature_id, "message": message})
            edges.append(feature)
        elif feature.feature_type == "poi":
            pois.append(feature)
        else:
            warnings.append({"code": "UNKNOWN_FEATURE_TYPE", "feature_id": feature.feature_id, "value": feature.feature_type})

    for position, identifiers in duplicate_positions.items():
        if len(identifiers) > 1:
            warnings.append({"code": "DUPLICATE_NODE_POSITION", "position": position, "node_ids": identifiers})
    degree = Counter()
    by_agent = {agent: [] for agent in ("car", "person", "scooter")}
    by_kind = Counter()
    sources = Counter()
    for edge in edges:
        props = edge.properties
        source, target = str(props.get("from_node") or ""), str(props.get("to_node") or "")
        if source not in nodes or target not in nodes:
            errors.append({"code": "DISCONNECTED_EDGE", "feature_id": edge.feature_id, "from": source, "to": target})
        else:
            degree[source] += 1
            degree[target] += 1
        kind = normalize_kind(str(props.get("kind") or ""), policy)
        by_kind[kind] += 1
        sources[str(props.get("source", "unknown"))] += 1
        for agent in props.get("allowed_types") or []:
            if agent in by_agent:
                by_agent[agent].append((source, target))
    for node_id in nodes:
        if degree[node_id] == 0:
            warnings.append({"code": "ISOLATED_NODE", "node_id": node_id})

    connectivity = {}
    for agent, agent_edges in by_agent.items():
        components, largest = component_count(set(nodes), agent_edges)
        active_nodes = len({value for pair in agent_edges for value in pair})
        connectivity[agent] = {
            "edges": len(agent_edges), "active_nodes": active_nodes, "components": components,
            "largest_component_nodes": largest,
            "connected_percent": round(100 * largest / active_nodes, 2) if active_nodes else 0,
        }
        if components > 1:
            warnings.append({"code": "NETWORK_NOT_FULLY_CONNECTED", "agent_type": agent, "components": components})

    pedestrian_kinds = {"sidewalk", "crosswalk", "shared_path", "pedestrian_gate", "building_entrance", "parking_walk"}
    vehicle_kinds = {"vehicle_lane", "allowed_road", "vehicle_gate", "parking_connection"}
    for edge in edges:
        kind = normalize_kind(str(edge.properties.get("kind") or ""), policy)
        allowed = set(edge.properties.get("allowed_types") or ())
        if kind == "building_entrance" and "car" in allowed:
            errors.append({"code": "VEHICLE_TO_BUILDING_DIRECT", "feature_id": edge.feature_id})
        if kind == "vehicle_gate" and "person" in allowed:
            errors.append({"code": "PERSON_ON_VEHICLE_GATE", "feature_id": edge.feature_id})
        if kind == "sidewalk" and "scooter" in allowed:
            errors.append({"code": "SCOOTER_ON_PROHIBITED_SIDEWALK", "feature_id": edge.feature_id})

    crosswalks = [edge for edge in edges if normalize_kind(str(edge.properties.get("kind") or ""), policy) == "crosswalk"]
    vehicle_edges = [edge for edge in edges if normalize_kind(str(edge.properties.get("kind") or ""), policy) in vehicle_kinds]
    pedestrian_edges = [edge for edge in edges if normalize_kind(str(edge.properties.get("kind") or ""), policy) in pedestrian_kinds - {"crosswalk"}]
    for edge in crosswalks:
        endpoints = {str(edge.properties.get("from_node")), str(edge.properties.get("to_node"))}
        vehicle_hit = any(
            endpoints & {str(other.properties.get("from_node")), str(other.properties.get("to_node"))}
            or line_intersects(edge.coordinates, other.coordinates)
            for other in vehicle_edges
        )
        pedestrian_hit = any(endpoints & {str(other.properties.get("from_node")), str(other.properties.get("to_node"))} for other in pedestrian_edges)
        if not vehicle_hit:
            warnings.append({"code": "CROSSWALK_WITHOUT_ROAD_INTERSECTION", "feature_id": edge.feature_id})
        if not pedestrian_hit:
            warnings.append({"code": "CROSSWALK_WITHOUT_PEDESTRIAN_CONNECTION", "feature_id": edge.feature_id})

    for poi in pois:
        node_id = str(poi.properties.get("node_id") or "")
        attached = [edge for edge in edges if node_id in {str(edge.properties.get("from_node")), str(edge.properties.get("to_node"))}]
        kind = poi.properties.get("kind")
        if kind == "building" and not any(normalize_kind(str(edge.properties.get("kind") or ""), policy) == "building_entrance" for edge in attached):
            warnings.append({"code": "BUILDING_WITHOUT_PEDESTRIAN_ENTRANCE", "poi_id": poi.feature_id})
        if kind == "parking" and not any(normalize_kind(str(edge.properties.get("kind") or ""), policy) == "parking_connection" for edge in attached):
            warnings.append({"code": "PARKING_WITHOUT_VEHICLE_CONNECTION", "poi_id": poi.feature_id})

    derived = sum(bool(edge.properties.get("derived")) for edge in edges)
    authoritative = sum(bool(edge.properties.get("authoritative")) and not edge.properties.get("derived") for edge in edges)
    return {
        "valid": not errors,
        "summary": {
            "nodes": len(nodes), "edges": len(edges), "pois": len(pois),
            "edge_kinds": dict(sorted(by_kind.items())), "sources": dict(sorted(sources.items())),
            "derived_edges": derived, "non_derived_edges": len(edges) - derived,
            "authoritative_edges": authoritative,
            "crosswalk_edges": len(crosswalks),
        },
        "connectivity": connectivity,
        "errors": errors,
        "warnings": warnings,
    }


def markdown(report: dict, network_path: Path) -> str:
    summary = report["summary"]
    lines = [
        "# Transport Network Validation", "", f"- Network: `{network_path}`",
        f"- Result: **{'PASS' if report['valid'] else 'FAIL'}**",
        f"- Nodes / Edges / POIs: {summary['nodes']} / {summary['edges']} / {summary['pois']}",
        f"- Derived / Non-derived / Authoritative edges: {summary['derived_edges']} / {summary['non_derived_edges']} / {summary['authoritative_edges']}",
        "", "## Edge kinds", "",
    ]
    lines += [f"- `{key}`: {value}" for key, value in summary["edge_kinds"].items()]
    lines += ["", "## Connectivity", ""]
    lines += [f"- {agent}: {value['edges']} edges, {value['components']} components, largest coverage {value['connected_percent']}%" for agent, value in report["connectivity"].items()]
    for heading, key in (("Errors", "errors"), ("Warnings", "warnings")):
        lines += ["", f"## {heading}", ""]
        values = report[key]
        lines += [f"- `{item.get('code')}` — `{item.get('feature_id') or item.get('node_id') or item.get('poi_id') or item.get('agent_type') or '-'}` {item.get('message', '')}" for item in values] or ["- None"]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate the campus multimodal transport network.")
    parser.add_argument("network", nargs="?", type=Path, default=DATA / "campus_transport_network.geojson")
    parser.add_argument("--policy", type=Path, default=ROOT / "config" / "mobility_policy.json")
    parser.add_argument("--json", type=Path, default=DATA / "network_validation.json")
    parser.add_argument("--markdown", type=Path, default=DATA / "network_validation.md")
    args = parser.parse_args()
    report = validate(load_feature_collection(args.network), load_policy(args.policy))
    args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(markdown(report, args.network), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))
    print(f"errors={len(report['errors'])}, warnings={len(report['warnings'])}")
    raise SystemExit(0 if report["valid"] else 1)


if __name__ == "__main__":
    main()
