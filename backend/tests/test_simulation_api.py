from fastapi.testclient import TestClient

from simulation.main import app


def test_health_and_simulation_controls():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        started = client.post(
            "/api/simulation/start",
            json={"scenario": "normal", "counts": {"car": 1, "person": 1, "scooter": 1}},
        )
        assert started.status_code == 200
        assert started.json()["status"] == "running"
        entities = client.get("/api/simulation/entities").json()["entities"]
        assert entities
        details = client.get(f"/api/simulation/agents/{entities[0]['id']}")
        assert details.status_code == 200
        assert details.json()["trajectory"]
        assert details.json()["origin_name"]
        assert client.post("/api/simulation/pause").json()["status"] == "paused"
        assert client.post("/api/simulation/resume").json()["status"] == "running"
        assert client.post("/api/simulation/reset").json()["status"] == "stopped"


def test_websocket_sends_simulation_update():
    with TestClient(app) as client:
        client.post("/api/simulation/start", json={"counts": {"car": 1, "person": 1, "scooter": 1}})
        with client.websocket_connect("/ws/simulation") as websocket:
            payload = websocket.receive_json()
            assert payload["type"] == "simulation_update"
            assert {entity["type"] for entity in payload["entities"]} == {"car", "person", "scooter"}
        client.post("/api/simulation/reset")
