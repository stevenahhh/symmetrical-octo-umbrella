from __future__ import annotations

import sqlite3


from fastapi.testclient import TestClient
from weather.api.app import create_app
from weather.api.energy import _ready_paths
from weather.energy.persistence import Database


def payload(origin_x: float = 15.0, count: int = 2) -> dict:
    arrays = [{
        "id": f"array-{i + 1}", "roof_id": "D4-roof-west", "roof_zone_id": "D4-roof-west-main",
        "module_id": "module-default-441wp", "origin_x_m": origin_x + i * 5, "origin_y_m": 10.0,
        "rows": 2, "columns": 2, "azimuth_deg": 180, "tilt_deg": 25, "orientation": "portrait",
        "module_width_m": 1.05, "module_length_m": 2.1, "module_efficiency_percent": 20,
        "module_nominal_power_wp": 441, "inter_panel_gap_m": 0.02,
    } for i in range(count)]
    return {"building_id": "D4", "name": "API round trip", "weather_preset": "clear", "arrays": arrays}


def client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("WEATHER_ENERGY_DB", str(tmp_path / "api.sqlite3"))
    return TestClient(create_app())


def test_existing_routes_and_explicit_vite_cors(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        assert api.get("/health").json() == {"status": "ok"}
        assert api.get("/").status_code == 200
        headers = {"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"}
        assert api.options("/energy/buildings", headers=headers).headers["access-control-allow-origin"] == headers["Origin"]
        headers["Origin"] = "https://example.com"
        assert "access-control-allow-origin" not in api.options("/energy/buildings", headers=headers).headers


def test_buildings_demand_and_weather_have_96_slots(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        buildings = api.get("/energy/buildings")
        assert buildings.status_code == 200
        d4 = next(item for item in buildings.json() if item["id"] == "D4")
        assert d4["room_count"] == 69
        assert d4["display_name"] == "D4 / \uacf5\ub300 3\ud638\uad00"
        demand = api.get("/energy/buildings/D4/demand", params={"date": "2026-05-18"})
        assert demand.status_code == 200
        body = demand.json()
        assert len(body["intervals"]) == 96
        assert body["total_energy_kwh"] == 921.7000000000002
        assert body["quality"] == "predicted"
        assert body["assumption"]["calibration"] == "not-engineering-calibrated"
        weather = api.get("/energy/weather/scenarios", params={"date": "2026-05-18"})
        assert [item["preset"] for item in weather.json()] == ["clear", "partly_cloudy", "overcast"]
        assert all(len(item["series"]["intervals"]) == 96 for item in weather.json())


def test_create_reload_simulate_and_recommend_without_mutation(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        created = api.post("/energy/scenarios", json=payload())
        assert created.status_code == 201, created.text
        source = created.json()
        assert len(source["arrays"]) == 2
        assert api.get(f"/energy/scenarios/{source['id']}").json()["arrays"] == source["arrays"]
        simulated = api.post(f"/energy/scenarios/{source['id']}/simulate", json={"date": "2026-05-18"})
        assert simulated.status_code == 200, simulated.text
        result = simulated.json()
        assert len(result["intervals"]) == 96 and len(result["arrays"]) == 2
        assert result["arrays"][0]["intervals"][20]["timestamp"] == result["intervals"][20]["timestamp"]
        assert result["totals"]["demand_energy_kwh"] == 921.7000000000002
        assert len(api.get(f"/energy/scenarios/{source['id']}").json()["intervals"]) == 96
        recommended = api.post(f"/energy/scenarios/{source['id']}/recommend", json={"date": "2026-05-18"})
        assert recommended.status_code == 201, recommended.text
        suggestion = recommended.json()
        assert suggestion["scenario"]["id"] != source["id"] and suggestion["candidate_scores"]
        assert api.get(f"/energy/scenarios/{source['id']}").json()["arrays"] == source["arrays"]
        assert api.get(f"/energy/scenarios/{suggestion['scenario']['id']}").status_code == 200


def test_canonical_routes_reject_invalid_requests_and_api_aliases_are_absent(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        assert api.get("/energy/buildings/missing/demand", params={"date": "2026-05-18"}).status_code == 404
        assert api.get("/energy/scenarios/missing").status_code == 404
        assert api.post("/energy/scenarios", json={"building_id": "D4", "arrays": "bad"}).status_code == 422
        invalid = api.post("/energy/scenarios", json=payload(0.1, 1))
        assert invalid.status_code == 422
        detail = invalid.json()["detail"]
        assert detail["code"] == "invalid_geometry" and detail["message_en"] and detail["message_ko"]
        assert detail["violations"][0]["code"] == "ROOF_EDGE_MARGIN"
        cross_building = payload(count=1)
        cross_building["building_id"] = "D3"
        wrong_roof = api.post("/energy/scenarios", json=cross_building)
        assert wrong_roof.status_code == 422
        assert wrong_roof.json()["detail"]["violations"][0]["code"] == "ROOF_BUILDING_MISMATCH"
        created = api.post("/energy/scenarios", json=payload(count=1)).json()
        wrong_update = api.put(f"/energy/scenarios/{created['id']}", json=cross_building)
        assert wrong_update.status_code == 422
        assert wrong_update.json()["detail"]["violations"][0]["code"] == "ROOF_BUILDING_MISMATCH"
        assert api.get(f"/energy/scenarios/{created['id']}").json()["building_id"] == "D4"
        assert api.get("/energy/weather/scenarios", params={"date": "2026-02-30"}).status_code == 422
        for path in ("/api/buildings", "/api/buildings/D4/demand", "/api/weather/scenarios",
                     "/api/scenarios", "/api/scenarios/missing", "/api/scenarios/missing/simulate",
                     "/api/scenarios/missing/recommend"):
            assert api.get(path).status_code == 404


def test_locked_database_is_bounded_and_writes_no_partial_scenario(tmp_path, monkeypatch) -> None:
    path = tmp_path / "api.sqlite3"
    with client(tmp_path, monkeypatch) as api:
        assert api.get("/energy/buildings").status_code == 200
        connection = sqlite3.connect(path)
        try:
            connection.execute("BEGIN EXCLUSIVE")
            response = api.post("/energy/scenarios", json=payload(count=1))
            assert response.status_code == 503
            assert response.json()["detail"]["code"] == "database_unavailable"
        finally:
            connection.rollback()
            connection.close()
        with sqlite3.connect(path) as check:
            assert check.execute("SELECT count(*) FROM scenarios").fetchone()[0] == 4


def test_literal_energy_building_and_create_update_delete_round_trip(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        buildings = api.get("/energy/buildings")
        assert buildings.status_code == 200 and any(item["id"] == "D4" for item in buildings.json())
        building = api.get("/energy/buildings/D4")
        assert building.status_code == 200 and building.json()["room_count"] == 69
        assert api.get("/energy/buildings/missing").status_code == 404
        assert api.get("/energy/scenarios/missing").status_code == 404
        demand = api.get("/energy/buildings/D4/demand", params={"date": "2026-05-18"})
        assert demand.status_code == 200 and len(demand.json()["intervals"]) == 96
        assert demand.json()["intervals"][0]["power_unit"] == "kW"
        assert demand.json()["assumption"]["type"] == "simulation-assumption"

        created = api.post("/energy/scenarios", json=payload())
        assert created.status_code == 201
        scenario_id = created.json()["id"]
        update = payload(count=1)
        update["name"] = "Updated through literal route"
        updated = api.put(f"/energy/scenarios/{scenario_id}", json=update)
        assert updated.status_code == 200 and updated.json()["name"] == update["name"]
        assert len(updated.json()["arrays"]) == 1
        assert api.get(f"/energy/scenarios/{scenario_id}").json() == updated.json()
        deleted = api.delete(f"/energy/scenarios/{scenario_id}")
        assert deleted.status_code == 204 and not deleted.content
        assert api.get(f"/energy/scenarios/{scenario_id}").status_code == 404


def test_literal_simulation_is_repeatable_and_rankings_explain_exclusions(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        summaries = api.get("/energy/buildings/D4/scenarios")
        assert summaries.status_code == 200
        assert summaries.json() == [{
            "id": "D4-scenario-south-2x8", "building_id": "D4",
            "name": "D4 south 2x8 fixture", "weather_preset": "clear",
            "array_count": 1, "updated_at": "2026-01-01T00:00:00+09:00",
        }]
        assert api.get("/energy/buildings/missing/scenarios").status_code == 404
        source = api.post("/energy/scenarios", json=payload(count=1)).json()
        path = f"/energy/scenarios/{source['id']}/simulate"
        first = api.post(path, json={"date": "2026-05-18"})
        second = api.post(path, json={"date": "2026-05-18"})
        assert first.status_code == 200 and second.json() == first.json()
        assert first.json()["weather_source"] == "scenario"
        assert first.json()["generation_assumption"]["calibration"] == "not-engineering-calibrated"
        assert first.json()["arrays"][0]["capacity_kwp"] == 1.764
        noon = first.json()["arrays"][0]["intervals"][48]
        assert set(noon) == {"timestamp", "generation_energy_kwh", "plane_of_array_factor", "temperature_factor", "system_factor"}
        assert 0 <= noon["plane_of_array_factor"] <= 1
        assert 0 <= noon["temperature_factor"] <= 1
        assert noon["system_factor"] == 0.9
        rankings = api.get("/energy/rankings", params={"date": "2026-05-18"})
        repeated = api.get("/energy/rankings", params={"date": "2026-05-18"})
        assert rankings.status_code == 200 and rankings.json() == repeated.json()
        entries = rankings.json()["rankings"]
        ranked = next(item for item in entries if item["scenario_id"] == source["id"])
        seeded = next(item for item in entries if item["scenario_id"] == "D4-scenario-south-2x8")
        assert ranked["status"] == "ranked" and ranked["score_unit"] == "normalized-weighted-score"
        assert seeded["status"] == "excluded"
        assert seeded["exclusion_reason"] == "simulation_incomplete_for_date"


def test_literal_layout_and_nonfinite_validation_are_structured_422_without_writes(tmp_path, monkeypatch) -> None:
    path = tmp_path / "api.sqlite3"
    with client(tmp_path, monkeypatch) as api:
        assert api.get("/energy/buildings").status_code == 200
        overlapping = payload()
        overlapping["arrays"][1]["origin_x_m"] = overlapping["arrays"][0]["origin_x_m"]
        response = api.post("/energy/scenarios", json=overlapping)
        assert response.status_code == 422
        assert any(item["code"] == "ARRAY_OVERLAP" for item in response.json()["detail"]["violations"])
        raw = __import__("json").dumps(payload(count=1)).replace('"origin_x_m": 15.0', '"origin_x_m": NaN')
        nonfinite = api.post("/energy/scenarios", content=raw, headers={"Content-Type": "application/json"})
        assert nonfinite.status_code == 422
        detail = nonfinite.json()["detail"]
        assert detail["code"] == "request_validation_error"
        assert detail["message_en"] and detail["message_ko"] and detail["details"]
        malformed_date = api.get("/energy/rankings", params={"date": "2026-02-30"}).json()["detail"]
        assert malformed_date["code"] == "request_validation_error"
        with sqlite3.connect(path) as check:
            assert check.execute("SELECT count(*) FROM scenarios").fetchone()[0] == 4


def test_locked_reads_simulate_recommend_and_rankings_return_503_without_state_change(tmp_path, monkeypatch) -> None:
    path = tmp_path / "api.sqlite3"
    with client(tmp_path, monkeypatch) as api:
        scenario = api.post("/energy/scenarios", json=payload(count=1)).json()
        api.post(f"/energy/scenarios/{scenario['id']}/simulate", json={"date": "2026-05-18"})
        with sqlite3.connect(path) as before:
            snapshot = before.execute("SELECT count(*), sum((SELECT count(*) FROM scenario_intervals)) FROM scenarios").fetchone()
        lock = sqlite3.connect(path)
        try:
            lock.execute("BEGIN EXCLUSIVE")
            requests = (
                ("get", f"/energy/scenarios/{scenario['id']}", None),
                ("get", "/energy/buildings/D4/demand?date=2026-05-18", None),
                ("post", f"/energy/scenarios/{scenario['id']}/simulate", {"date": "2026-05-18"}),
                ("post", f"/energy/scenarios/{scenario['id']}/recommend", {"date": "2026-05-18"}),
                ("put", f"/energy/scenarios/{scenario['id']}", payload(count=1)),
                ("delete", f"/energy/scenarios/{scenario['id']}", None),
                ("get", "/energy/rankings?date=2026-05-18", None),
            )
            for method, url, body in requests:
                response = getattr(api, method)(url, json=body) if body else getattr(api, method)(url)
                assert response.status_code == 503
                assert response.json()["detail"]["code"] == "database_unavailable"

        finally:
            lock.rollback()
            lock.close()
        with sqlite3.connect(path) as after:
            current = after.execute("SELECT count(*), sum((SELECT count(*) FROM scenario_intervals)) FROM scenarios").fetchone()
        assert current == snapshot


def test_rankings_closes_every_database_connection_after_response(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        assert api.get("/energy/buildings").status_code == 200
        original_connect = Database.connect
        tracked = []

        class TrackedConnection:
            def __init__(self, connection):
                self.connection = connection
                self.closed = False

            def __getattr__(self, name):
                return getattr(self.connection, name)

            def __enter__(self):
                self.connection.__enter__()
                return self

            def __exit__(self, *args):
                return self.connection.__exit__(*args)

            def close(self):
                self.closed = True
                return self.connection.close()

        def connect(database):
            wrapper = TrackedConnection(original_connect(database))
            tracked.append(wrapper)
            return wrapper

        monkeypatch.setattr(Database, "connect", connect)
        response = api.get("/energy/rankings", params={"date": "2026-05-18", "weather_preset": "clear"})
        assert response.status_code == 200
        assert tracked
        assert all(connection.closed for connection in tracked)


def test_campus_seeds_and_explainable_comparable_rankings(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        buildings = api.get("/energy/buildings").json()
        by_id = {item["id"]: item for item in buildings}
        assert {"D2", "D3", "D4", "D1", "C1"} <= set(by_id)
        assert all(by_id[item]["roof_zone_count"] == 1 for item in ("D2", "D3", "D4"))
        assert by_id["C1"]["roof_zone_count"] == 0
        d3_roof = api.get("/energy/buildings/D3").json()["roofs"][0]
        assert d3_roof == {"id": "D3-roof-main", "zones": [{
            "id": "D3-roof-main-zone", "polygon_meters": [
                {"x_meters": 0.0, "y_meters": 0.0}, {"x_meters": 30.0, "y_meters": 0.0},
                {"x_meters": 30.0, "y_meters": 46.0}, {"x_meters": 0.0, "y_meters": 46.0},
            ],
        }], "obstacles": []}
        assert d3_roof["zones"][0]["polygon_meters"] != api.get("/energy/buildings/D4").json()["roofs"][0]["zones"][0]["polygon_meters"]

        for building_id in ("D1", "D2", "D3", "D4"):
            scenarios = api.get(f"/energy/buildings/{building_id}/scenarios").json()
            assert scenarios
            response = api.post(f"/energy/scenarios/{scenarios[0]['id']}/simulate", json={"date": "2026-05-18"})
            assert response.status_code == 200, response.text

        ranking = api.get("/energy/rankings", params={"date": "2026-05-18", "weather_preset": "clear"})
        assert ranking.status_code == 200, ranking.text
        body = ranking.json()
        assert body["weather_preset"] == "clear"
        assert body["assumptions"]["demand_quality"] == "predicted"
        ranked = [item for item in body["rankings"] if item["status"] == "ranked"]
        assert len(ranked) >= 4
        assert [item["rank"] for item in ranked] == list(range(1, len(ranked) + 1))
        for item in ranked:
            assert set(item["component_scores"]) == {"annualized_yield", "roof_utilization", "self_sufficiency", "grid_reduction", "constraints"}
            assert item["metrics"]["annualized_kwh_per_kwp"] > 0
            assert item["metrics"]["constraint_violation_count"] == 0
        excluded = {item["building_id"]: item for item in body["rankings"] if item["status"] == "excluded"}
        assert excluded["C1"]["exclusion_reason"] == "missing_roof_metadata"
        assert excluded["C1"]["score"] is None and excluded["C1"]["component_scores"] is None
        assert "D1" not in excluded
        assert api.get("/energy/rankings", params={"date": "2026-05-18", "weather_preset": "clear"}).json() == body


def test_rankings_exclude_unlike_weather_and_recommendation_is_new_editable_copy(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        original = api.get("/energy/scenarios/D4-scenario-south-2x8").json()
        api.post("/energy/scenarios/D4-scenario-south-2x8/simulate", json={"date": "2026-05-18"})
        ranking = api.get("/energy/rankings", params={"date": "2026-05-18", "weather_preset": "overcast"}).json()
        d4 = next(item for item in ranking["rankings"] if item["scenario_id"] == original["id"])
        assert d4["status"] == "excluded" and d4["exclusion_reason"] == "weather_preset_mismatch"
        recommendation = api.post(f"/energy/scenarios/{original['id']}/recommend", json={"date": "2026-05-18"})
        assert recommendation.status_code == 201
        suggested = recommendation.json()["scenario"]
        assert suggested["id"] != original["id"]
        assert api.get(f"/energy/scenarios/{suggested['id']}").status_code == 200
        assert api.get(f"/energy/scenarios/{original['id']}").json()["arrays"] == original["arrays"]
        changed = payload(count=1)
        changed["name"] = "independent recommendation edit"
        assert api.put(f"/energy/scenarios/{suggested['id']}", json=changed).status_code == 200
        assert api.get(f"/energy/scenarios/{original['id']}").json()["arrays"] == original["arrays"]


def test_locked_first_request_initialization_is_translated_to_503(tmp_path, monkeypatch) -> None:
    path = tmp_path / "init-lock.sqlite3"
    Database(path).initialize()
    monkeypatch.setenv("WEATHER_ENERGY_DB", str(path))
    _ready_paths.discard(str(path))
    lock = sqlite3.connect(path)
    try:
        lock.execute("BEGIN EXCLUSIVE")
        with TestClient(create_app()) as api:
            response = api.get("/energy/buildings")
            assert response.status_code == 503
            assert response.json()["detail"]["code"] == "database_unavailable"
    finally:
        lock.rollback()
        lock.close()
    with TestClient(create_app()) as api:
        assert api.get("/energy/buildings").status_code == 200
