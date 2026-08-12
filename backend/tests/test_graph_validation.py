from pathlib import Path

from simulation.network_schema import load_feature_collection, load_policy
from simulation.tools.validate_network import validate


ROOT = Path(__file__).resolve().parents[1] / "simulation"


def test_validator_rejects_zero_length_edge():
    network = load_feature_collection(ROOT / "data" / "campus_transport_network.geojson")
    policy = load_policy(ROOT / "config" / "mobility_policy.json")
    edge = next(feature for feature in network["features"] if feature["properties"].get("feature_type") == "edge")
    edge["geometry"]["coordinates"][-1] = list(edge["geometry"]["coordinates"][0])
    report = validate(network, policy)
    assert report["valid"] is False
    assert any(item["code"] == "INVALID_EDGE" and "zero-length" in item.get("message", "") for item in report["errors"])
