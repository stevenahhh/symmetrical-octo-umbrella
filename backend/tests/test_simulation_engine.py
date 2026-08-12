from simulation.simulation_engine import SimulationEngine


def small_engine():
    engine = SimulationEngine(seed=1)
    engine.configure("normal", {"car": 1, "person": 1, "scooter": 1})
    return engine


def test_creates_requested_entities_on_allowed_routes():
    engine = small_engine()
    assert len(engine.entities) == 3
    assert len({entity["route_id"] for entity in engine.entities.values()}) == 3
    for entity in engine.entities.values():
        route = engine.routes.get(entity["route_id"])
        assert entity["type"] in route.allowed_types


def test_entities_move_along_route_when_running():
    engine = small_engine()
    before = {key: (entity["x"], entity["z"]) for key, entity in engine.entities.items()}
    engine.start()
    engine.step(0.5)
    assert any((entity["x"], entity["z"]) != before[key] for key, entity in engine.entities.items())
    assert engine.simulation_time == 0.5


def test_pause_resume_and_reset():
    engine = small_engine()
    engine.start()
    engine.pause()
    engine.step(0.5)
    assert engine.simulation_time == 0
    engine.resume()
    engine.step(0.2)
    assert engine.simulation_time > 0
    engine.reset()
    assert engine.status == "stopped"
    assert engine.simulation_time == 0
