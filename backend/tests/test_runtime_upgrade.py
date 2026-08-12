from pathlib import Path

import pytest

from simulation.mobility_graph import MobilityGraph
from simulation.risk_engine import RiskEngine
from simulation.runtime_network import load_runtime_graph
from simulation.simulation_engine import SimulationEngine
from simulation.spatial_index import UniformSpatialGrid


DATA = Path(__file__).resolve().parents[1] / "simulation" / "data"


def test_transport_source_of_truth_is_the_default_runtime(monkeypatch):
    monkeypatch.delenv("SIMULATION_NETWORK_MODE", raising=False)
    engine = SimulationEngine(seed=2)
    assert engine.network_runtime["mode"] == "transport-derived"
    assert engine.graph.metadata["source"] == "campus_transport_network.geojson"
    assert all(entity["route_geometry"] == "derived_offset" for entity in engine.entities.values())


def test_research_runtime_rejects_derived_only_network():
    with pytest.raises(ValueError, match="승인된"):
        load_runtime_graph(DATA, mode="research")


def test_derived_shared_path_has_agent_specific_lateral_offset():
    payload, _ = load_runtime_graph(DATA, mode="transport-derived")
    graph = MobilityGraph(payload)
    path = graph.shortest_path("BLD_D4", "BLD_C1", "person")
    segment = next(index for index, kind in enumerate(path.edge_kinds) if kind == "shared_path")
    distance = (path.cumulative_lengths[segment] + path.cumulative_lengths[segment + 1]) / 2
    raw_x, raw_z, _, _ = graph.interpolate(path, distance)
    person_x, person_z, _, _ = graph.interpolate(path, distance, "person")
    assert ((raw_x - person_x) ** 2 + (raw_z - person_z) ** 2) ** 0.5 == pytest.approx(2.8)


def test_spatial_grid_reduces_pair_candidates():
    entities = [
        {"id": f"agent_{index}", "x": index * 50.0, "z": 0.0}
        for index in range(100)
    ]
    entities[1]["x"] = 5.0
    grid = UniformSpatialGrid(cell_size=10)
    pairs = list(grid.pairs(entities, radius=10))
    assert {(first["id"], second["id"]) for first, second in pairs} == {("agent_0", "agent_1")}
    assert grid.last_candidate_count < 100 * 99 // 2


def test_route_prediction_overrides_false_linear_collision():
    car = {
        "id": "car_1", "type": "car", "x": 0, "z": 0, "speed": 5, "heading": 90,
        "_predicted_trajectory": [
            {"time": 0, "x": 0, "z": 0, "heading": 90},
            {"time": 0.5, "x": 0, "z": 2.5, "heading": 0},
            {"time": 1.0, "x": 0, "z": 5, "heading": 0},
        ],
    }
    person = {
        "id": "person_1", "type": "person", "x": 5, "z": 0, "speed": 0, "heading": 0,
        "_predicted_trajectory": [
            {"time": 0, "x": 5, "z": 0, "heading": 0},
            {"time": 0.5, "x": 5, "z": 0, "heading": 0},
            {"time": 1.0, "x": 5, "z": 0, "heading": 0},
        ],
    }
    metrics = RiskEngine.calculate_pair(car, person)
    assert metrics["linear_ttc"] is not None
    assert metrics["ttc"] is None
    assert metrics["prediction_model"] == "route_swept_envelope"


def test_agent_dimensions_change_collision_clearance():
    risk = RiskEngine(DATA / "risk_config.json")
    car = {"id": "car_1", "type": "car", "x": 0, "z": 0, "speed": 0, "heading": 90, "dimensions": risk.agent_dimensions["car"]}
    person = {"id": "person_1", "type": "person", "x": 2.4, "z": 0, "speed": 0, "heading": 0, "dimensions": risk.agent_dimensions["person"]}
    metrics = risk.calculate_pair(car, person)
    assert metrics["collision_envelope"] > metrics["distance"]
    assert metrics["minimum_clearance"] < 0
    assert risk.safety_event(metrics, car, person, "danger") == "COLLISION"


def test_default_population_is_distributed_across_campus_extent():
    engine = SimulationEngine(seed=42)
    positions = [(entity["x"], entity["z"]) for entity in engine.entities.values()]
    assert max(x for x, _ in positions) - min(x for x, _ in positions) > 600
    assert max(z for _, z in positions) - min(z for _, z in positions) > 400
    assert len({(int(x // 100), int(z // 100)) for x, z in positions}) >= 22
    coverage = engine.statistics()["network_coverage"]
    assert coverage["car"]["planned_percent"] > 30
    assert coverage["person"]["planned_percent"] > 60
    # Scooter has access to both derived road and shared-path duplicates, so
    # its denominator is 360 edges; 20% still represents broad campus routes.
    assert coverage["scooter"]["planned_percent"] > 18
