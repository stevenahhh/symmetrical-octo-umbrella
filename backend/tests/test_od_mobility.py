from pathlib import Path

from simulation.interaction_manager import InteractionManager
from simulation.mobility_graph import MobilityGraph
from simulation.risk_engine import RiskEngine
from simulation.simulation_engine import SimulationEngine


DATA = Path(__file__).resolve().parents[1] / "simulation" / "data"


def test_representative_od_trips_are_routable_with_type_restrictions():
    graph = MobilityGraph(DATA / "mobility_graph.json")
    trips = {
        "person": [
            ("EXTERNAL_MAIN_ROAD_SOUTH", "BLD_D4"),
            ("BLD_D4", "BLD_C1"),
            ("BLD_C1", "BLD_E1"),
            ("BLD_E1", "EXTERNAL_MAIN_ROAD_SOUTH"),
        ],
        "car": [
            ("EXTERNAL_MAIN_ROAD_SOUTH", "PARKING_A"),
            ("PARKING_A", "EXTERNAL_MAIN_ROAD_SOUTH"),
        ],
        "scooter": [
            ("EXTERNAL_MAIN_ROAD_SOUTH", "BLD_D4"),
            ("BLD_E1", "BLD_C1"),
            ("BLD_C1", "SCOOTER_PARKING_01"),
        ],
    }
    forbidden = {
        "car": {"shared_path_derived", "building_entrance", "pedestrian_gate", "parking_walk"},
        "person": {"road", "gate_vehicle", "parking_connection"},
    }
    for agent_type, pairs in trips.items():
        for origin, destination in pairs:
            path = graph.shortest_path(origin, destination, agent_type)
            assert path.total_length > 0
            assert not (set(path.edge_kinds) & forbidden.get(agent_type, set()))


def test_arrival_does_not_wrap_and_internal_destination_dwells():
    engine = SimulationEngine(seed=3)
    engine.configure("normal", {"car": 0, "person": 1, "scooter": 0})
    entity = next(iter(engine.entities.values()))
    path = engine.paths[entity["id"]]
    entity["route_distance"] = path.total_length - 0.001
    entity["speed"] = entity["desired_speed"]
    engine.start()
    engine.step(0.1)
    assert entity["route_distance"] == path.total_length
    if not entity["destination_external"]:
        assert entity["trip_status"] == "DWELLING"
        assert entity["visible"] is False


def test_next_trip_changes_destination_after_dwell():
    engine = SimulationEngine(seed=8)
    engine.configure("normal", {"car": 0, "person": 1, "scooter": 0})
    entity = next(iter(engine.entities.values()))
    entity["origin"] = "BLD_D4"
    entity["destination"] = "BLD_C1"
    old_origin, old_destination = entity["origin"], entity["destination"]
    entity["trip_status"] = "DWELLING"
    entity["dwell_remaining"] = 0
    entity["visible"] = False
    engine.start()
    engine.step(0.1)
    assert entity["origin"] == old_destination
    assert entity["destination"] != old_origin
    assert entity["trip_status"] == "MOVING"


def make_entity(entity_id, entity_type, x, z, speed, heading, **extra):
    return {
        "id": entity_id, "type": entity_type, "x": x, "z": z, "speed": speed, "heading": heading,
        "desired_speed": speed, "active": True, "trip_status": "MOVING", "interaction_state": "NONE",
        **extra,
    }


def test_car_yields_to_person_at_crosswalk():
    risk = RiskEngine(DATA / "risk_config.json")
    interactions = InteractionManager(risk)
    car = make_entity("car_1", "car", 0, -5, 5, 0)
    person = make_entity("person_1", "person", -2, 0, 1.2, 90, in_crosswalk=True, pedestrian_state="CROSSING")
    targets = interactions.speed_constraints([car, person], {"car_1": 5, "person_1": 1.2})
    assert targets["car_1"] < 5
    assert car["interaction_state"] in {"BRAKING", "CONFLICT"}


def test_crossing_car_scooter_creates_ttc_conflict_event():
    risk = RiskEngine(DATA / "risk_config.json")
    car = make_entity("car_1", "car", 0, -5, 2, 0, acceleration=0)
    scooter = make_entity("scooter_1", "scooter", -5, 0, 2, 90, acceleration=0)
    metrics = risk.calculate_pair(car, scooter)
    assert metrics["predicted_path_intersection"] is not None
    assert metrics["interaction_state"] == "CROSSING"
    events = risk.evaluate([car, scooter], 1.0)
    assert events and events[0]["interaction_type"] == "crossing"
    assert events[0]["ttc"] is not None


def test_scooter_decelerates_for_person_and_car_follows_leader():
    risk = RiskEngine(DATA / "risk_config.json")
    interactions = InteractionManager(risk)
    scooter = make_entity("scooter_1", "scooter", 0, 0, 4, 0)
    person = make_entity("person_1", "person", 0, 2, 1, 0)
    rear = make_entity("car_1", "car", 5, 0, 5, 90)
    leader = make_entity("car_2", "car", 10, 0, 2, 90)
    targets = interactions.speed_constraints(
        [scooter, person, rear, leader],
        {"scooter_1": 4, "person_1": 1, "car_1": 5, "car_2": 2},
    )
    assert targets["scooter_1"] < 4
    assert targets["car_1"] < 5
