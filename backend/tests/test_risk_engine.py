from pathlib import Path

from simulation.risk_engine import RiskEngine


CONFIG = Path(__file__).resolve().parents[1] / "simulation" / "data" / "risk_config.json"


def entity(entity_id, entity_type, x, z, speed, heading):
    return {"id": entity_id, "type": entity_type, "x": x, "z": z, "speed": speed, "heading": heading}


def test_ttc_for_approaching_entities():
    first = entity("car_1", "car", 0, 0, 1, 90)
    second = entity("person_1", "person", 10, 0, 1, 270)
    ttc = RiskEngine.calculate_ttc(first, second)
    assert ttc is not None
    assert 4 < ttc < 5


def test_ttc_none_when_not_approaching():
    first = entity("car_1", "car", 0, 0, 1, 270)
    second = entity("person_1", "person", 10, 0, 1, 90)
    assert RiskEngine.calculate_ttc(first, second) is None


def test_same_entity_is_not_calculated():
    first = entity("same", "car", 0, 0, 1, 90)
    assert RiskEngine.calculate_pair(first, first) is None


def test_risk_level_classification_and_event_cooldown():
    engine = RiskEngine(CONFIG)
    first = entity("scooter_1", "scooter", 0, 0, 4, 90)
    second = entity("person_1", "person", 1, 0, 0, 0)
    metrics = engine.calculate_pair(first, second)
    level, score = engine.classify(metrics, first, second)
    assert level == "danger"
    assert score >= 85
    assert len(engine.evaluate([first, second], 1.0)) == 1
    assert len(engine.evaluate([first, second], 1.1)) == 0
