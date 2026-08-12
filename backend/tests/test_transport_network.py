import json
from pathlib import Path

from simulation.network_schema import load_feature_collection, load_policy
from simulation.tools.build_graph import build
from simulation.tools.validate_network import validate


ROOT = Path(__file__).resolve().parents[1] / "simulation"


def test_transport_network_is_traceable_and_structurally_valid():
    network = load_feature_collection(ROOT / "data" / "campus_transport_network.geojson")
    policy = load_policy(ROOT / "config" / "mobility_policy.json")
    report = validate(network, policy)
    assert report["valid"] is True
    assert report["summary"]["edges"] == 364
    assert report["summary"]["derived_edges"] == 364
    assert report["summary"]["authoritative_edges"] == 0
    assert all(value["connected_percent"] == 100 for value in report["connectivity"].values())


def test_transport_graph_builder_preserves_multimodal_connectivity():
    network = load_feature_collection(ROOT / "data" / "campus_transport_network.geojson")
    policy = load_policy(ROOT / "config" / "mobility_policy.json")
    graph = build(network, policy)
    assert len(graph["nodes"]) == 106
    assert len(graph["edges"]) == 364
    assert {edge["kind"] for edge in graph["edges"]} >= {"allowed_road", "shared_path", "crosswalk"}


def test_authoritative_only_graph_is_empty_until_real_geometry_is_approved():
    network = load_feature_collection(ROOT / "data" / "campus_transport_network.geojson")
    policy = load_policy(ROOT / "config" / "mobility_policy.json")
    graph = build(network, policy, authoritative_only=True)
    assert graph["edges"] == []
    assert graph["pois"] == []
