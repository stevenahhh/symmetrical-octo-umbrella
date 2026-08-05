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


def test_create_reuses_client_array_labels_without_global_id_collisions(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        first = api.post("/energy/scenarios", json=payload(count=1))
        second = api.post("/energy/scenarios", json=payload(count=1))
        assert first.status_code == 201 and second.status_code == 201
        assert first.json()["id"] != second.json()["id"]
        assert first.json()["arrays"][0]["id"] != second.json()["arrays"][0]["id"]


def test_update_replaces_client_array_ids_without_cross_scenario_collisions(
    tmp_path, monkeypatch,
) -> None:
    with client(tmp_path, monkeypatch) as api:
        first = api.post("/energy/scenarios", json=payload(count=1)).json()
        second = api.post("/energy/scenarios", json=payload(count=1)).json()
        update = payload(count=1)
        update["arrays"][0]["id"] = first["arrays"][0]["id"]

        response = api.put(f"/energy/scenarios/{second['id']}", json=update)

        assert response.status_code == 200, response.text
        assert response.json()["arrays"][0]["id"] == f"{second['id']}-array-1"
        assert api.get(f"/energy/scenarios/{first['id']}").json() == first


def test_recommendation_uses_the_valid_source_footprint_for_wide_modules(
    tmp_path, monkeypatch,
) -> None:
    with client(tmp_path, monkeypatch) as api:
        source_payload = payload(count=1)
        source_payload["arrays"][0].update({
            "rows": 1, "columns": 1, "origin_x_m": 15.5, "module_width_m": 20.0,
        })
        source = api.post("/energy/scenarios", json=source_payload)
        assert source.status_code == 201, source.text

        response = api.post(
            f"/energy/scenarios/{source.json()['id']}/recommend",
            json={"date": "2026-05-18"},
        )

        assert response.status_code == 201, response.text
        assert response.json()["scenario"]["arrays"][0]["columns"] == 1


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
        assert wrong_update.json()["detail"]["code"] == "scenario_building_mismatch"
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


def test_legacy_scenario_update_preserves_simulated_intervals(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        created = api.post("/energy/scenarios", json=payload(count=1)).json()
        simulated = api.post(
            f"/energy/scenarios/{created['id']}/simulate", json={"date": "2026-05-18"},
        )
        assert simulated.status_code == 200, simulated.text
        before = api.get(f"/energy/scenarios/{created['id']}").json()["intervals"]
        assert len(before) == 96

        changed = payload(count=1)
        changed["name"] = "Renamed without losing simulation"
        updated = api.put(f"/energy/scenarios/{created['id']}", json=changed)

        assert updated.status_code == 200, updated.text
        assert updated.json()["intervals"] == before
        assert api.get(f"/energy/scenarios/{created['id']}").json()["intervals"] == before


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


def test_installation_plan_representative_and_analysis_run_contract(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        plan_payload = payload(count=1)
        plan_payload.pop("weather_preset")
        first_response = api.post("/energy/installation-plans", json=plan_payload)
        second_payload = {**plan_payload, "name": "Alternative plan"}
        second_payload["arrays"] = [{**item, "origin_x_m": 20.0} for item in plan_payload["arrays"]]
        second_response = api.post("/energy/installation-plans", json=second_payload)
        assert first_response.status_code == 201, first_response.text
        assert second_response.status_code == 201, second_response.text
        first, second = first_response.json(), second_response.json()

        listed = api.get("/energy/buildings/D4/installation-plans")
        assert listed.status_code == 200
        assert {item["id"] for item in listed.json()} >= {first["id"], second["id"]}
        selected = api.put("/energy/buildings/D4/representative-plan", json={
            "installation_plan_id": first["id"],
        })
        assert selected.status_code == 200
        replaced = api.put("/energy/buildings/D4/representative-plan", json={
            "installation_plan_id": second["id"],
        })
        assert replaced.status_code == 200
        assert replaced.json()["installation_plan_id"] == second["id"]
        assert api.delete(f"/energy/installation-plans/{second['id']}").status_code == 409

        scenario_payload = {
            "building_id": "D4", "name": "Representative comparison",
            "representative_plan_id": first["id"], "alternative_plan_id": second["id"],
            "baseline": "no_solar", "conditions": {
                "demand_source": "predicted", "weather_preset": "overcast",
                "electricity_price_krw_per_kwh": 160,
                "carbon_intensity_kg_co2e_per_kwh": 0.45,
            },
        }
        scenario_response = api.post("/energy/analysis-scenarios", json=scenario_payload)
        assert scenario_response.status_code == 201, scenario_response.text
        scenario = scenario_response.json()
        assert api.get(f"/energy/analysis-scenarios/{scenario['id']}").json() == scenario

        assert api.get("/energy/buildings/D4/analysis-scenarios").json() == [scenario]
        first_run = api.post(f"/energy/analysis-scenarios/{scenario['id']}/runs",
                             json={"date": "2026-05-18"})
        changed_scenario = {**scenario_payload, "name": "Updated comparison",
                            "conditions": {**scenario_payload["conditions"],
                                           "weather_preset": "clear"}}
        updated_response = api.put(f"/energy/analysis-scenarios/{scenario['id']}",
                                   json=changed_scenario)
        assert updated_response.status_code == 200, updated_response.text
        second_run = api.post(f"/energy/analysis-scenarios/{scenario['id']}/runs",
                              json={"date": "2026-05-19"})
        assert first_run.status_code == 201, first_run.text
        assert second_run.status_code == 201, second_run.text
        first_snapshot = first_run.json()
        assert first_snapshot["id"] != second_run.json()["id"]
        assert first_snapshot["scenario_snapshot"] == scenario
        assert second_run.json()["scenario_snapshot"] == updated_response.json()
        assert first_snapshot["plan_snapshots"]["representative"]["arrays"] == first["arrays"]
        assert len(first_snapshot["intervals"]) == 96
        assert all(item["baseline_generation_energy_kwh"] == 0
                   for item in first_snapshot["intervals"])
        assert first_snapshot["totals"]["baseline"]["grid_draw_energy_kwh"] == first_snapshot[
            "totals"]["baseline"]["demand_energy_kwh"]
        assert first_snapshot["date"] == "2026-05-18"
        assert api.get("/energy/buildings/D4/representative-plan").json()[
            "installation_plan_id"] == second["id"]
        assert api.get(f"/energy/analysis-runs/{first_snapshot['id']}").json() == first_snapshot
        history = api.get(f"/energy/analysis-scenarios/{scenario['id']}/runs").json()
        assert [item["id"] for item in history] == [second_run.json()["id"], first_snapshot["id"]]

        assert api.delete("/energy/buildings/D4/representative-plan").status_code == 204
        referenced_delete = api.delete(f"/energy/installation-plans/{second['id']}")
        assert referenced_delete.status_code == 409
        assert referenced_delete.json()["detail"]["code"] == "analysis_scenario_installation_plan"
        assert api.delete(f"/energy/installation-plans/{first['id']}").status_code == 409
        assert api.delete(f"/energy/analysis-scenarios/{scenario['id']}").status_code == 204
        retained_history = api.get(f"/energy/analysis-scenarios/{scenario['id']}/runs")
        assert retained_history.status_code == 200
        assert [item["id"] for item in retained_history.json()] == [
            second_run.json()["id"], first_snapshot["id"],
        ]
        assert api.delete(f"/energy/installation-plans/{second['id']}").status_code == 204
        assert api.delete(f"/energy/installation-plans/{first['id']}").status_code == 204
        assert api.get(f"/energy/analysis-runs/{first_snapshot['id']}").json() == first_snapshot
        assert api.put(f"/energy/analysis-runs/{first_snapshot['id']}", json={}).status_code == 405
        assert api.delete(f"/energy/analysis-runs/{first_snapshot['id']}").status_code == 405


def test_building_analysis_history_includes_direct_and_scenario_runs(tmp_path,
                                                                     monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        direct = api.post("/energy/analysis-runs", json={
            "installation_plan_id": "D4-scenario-south-2x8",
            "conditions": {"date": "2026-05-18", "weather_preset": "clear"},
        })
        assert direct.status_code == 201, direct.text

        scenario = api.post("/energy/analysis-scenarios", json={
            "building_id": "D4", "name": "History comparison",
            "representative_plan_id": "D4-scenario-south-2x8",
            "alternative_plan_id": None, "baseline": "no_solar",
            "conditions": {
                "demand_source": "predicted", "weather_preset": "clear",
                "electricity_price_krw_per_kwh": 160,
                "carbon_intensity_kg_co2e_per_kwh": 0.45,
            },
        })
        assert scenario.status_code == 201, scenario.text
        scenario_run = api.post(
            f"/energy/analysis-scenarios/{scenario.json()['id']}/runs",
            json={"date": "2026-05-18"},
        )
        assert scenario_run.status_code == 201, scenario_run.text

        history = api.get("/energy/buildings/D4/analysis-runs")
        assert history.status_code == 200, history.text
        runs = history.json()
        assert [item["id"] for item in runs] == [scenario_run.json()["id"], direct.json()["id"]]
        by_id = {item["id"]: item for item in runs}
        assert by_id[direct.json()["id"]]["run_type"] == "direct"
        assert by_id[scenario_run.json()["id"]]["run_type"] == "scenario"
        assert "installation_plan" in by_id[direct.json()["id"]]
        assert "analysis_scenario_id" in by_id[scenario_run.json()["id"]]


def test_analysis_scenario_rejects_blank_representative_plan_id(tmp_path,
                                                                 monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        response = api.post("/energy/analysis-scenarios", json={
            "building_id": "D4", "name": "Invalid definition",
            "representative_plan_id": "  \t ", "alternative_plan_id": None,
            "baseline": "no_solar", "conditions": {
                "demand_source": "predicted", "weather_preset": "clear",
                "electricity_price_krw_per_kwh": 160,
                "carbon_intensity_kg_co2e_per_kwh": 0.45,
            },
        })
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "request_validation_error"


def test_rankings_can_compare_only_explicit_representative_plans(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        plan_payload = payload(count=1)
        plan_payload.pop("weather_preset")
        plan = api.post("/energy/installation-plans", json=plan_payload).json()
        selected = api.put("/energy/buildings/D4/representative-plan", json={
            "installation_plan_id": plan["id"],
        })
        assert selected.status_code == 200

        response = api.get("/energy/rankings", params={
            "date": "2026-05-18",
            "weather_preset": "clear",
            "representative_only": "true",
        })
        assert response.status_code == 200, response.text
        entries = response.json()["rankings"]
        d4 = next(item for item in entries if item["building_id"] == "D4")
        assert d4["scenario_id"] == plan["id"]
        assert d4["status"] == "ranked"
        assert all(
            item["scenario_id"] in {None, plan["id"]}
            for item in entries
        )
        assert any(
            item["exclusion_reason"] == "no_representative_plan"
            for item in entries
            if item["building_id"] != "D4"
        )


def test_plan_boundaries_normalize_text_and_reject_building_reassignment(tmp_path,
                                                                         monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        plan_payload = payload(count=1)
        plan_payload.pop("weather_preset")
        plan_payload["name"] = "  Trimmed plan  "
        created = api.post("/energy/installation-plans", json=plan_payload)
        assert created.status_code == 201, created.text
        plan = created.json()
        assert plan["name"] == "Trimmed plan"

        blank = {**plan_payload, "name": "   \t"}
        assert api.post("/energy/installation-plans", json=blank).status_code == 422

        moved = {**plan_payload, "building_id": "D3", "name": "Moved"}
        moved_response = api.put(f"/energy/installation-plans/{plan['id']}", json=moved)
        assert moved_response.status_code == 422
        assert moved_response.json()["detail"]["code"] == "installation_plan_building_mismatch"
        assert api.get(f"/energy/installation-plans/{plan['id']}").json()["building_id"] == "D4"

        definition = {
            "building_id": "D4", "name": "  Trimmed analysis  ",
            "representative_plan_id": plan["id"], "alternative_plan_id": "  ",
            "baseline": "no_solar", "conditions": {
                "demand_source": "predicted", "weather_preset": "clear",
                "electricity_price_krw_per_kwh": 160,
                "carbon_intensity_kg_co2e_per_kwh": 0.45,
            },
        }
        saved = api.post("/energy/analysis-scenarios", json=definition)
        assert saved.status_code == 201, saved.text
        assert saved.json()["name"] == "Trimmed analysis"
        assert saved.json()["alternative_plan_id"] is None
        definition["name"] = "   "
        assert api.post("/energy/analysis-scenarios", json=definition).status_code == 422


def test_analysis_cost_conditions_validate_and_survive_definition_and_run_snapshots(
    tmp_path, monkeypatch,
) -> None:
    with client(tmp_path, monkeypatch) as api:
        definition = {
            "building_id": "D4", "name": "Custom assumptions",
            "representative_plan_id": "D4-scenario-south-2x8",
            "alternative_plan_id": None, "baseline": "no_solar",
            "conditions": {
                "demand_source": "predicted", "weather_preset": "clear",
                "electricity_price_krw_per_kwh": 275,
                "carbon_intensity_kg_co2e_per_kwh": 0.61,
            },
        }
        created = api.post("/energy/analysis-scenarios", json=definition)
        assert created.status_code == 201, created.text
        assert created.json()["conditions"] == definition["conditions"]

        definition["conditions"] = {**definition["conditions"],
                                    "electricity_price_krw_per_kwh": 310,
                                    "carbon_intensity_kg_co2e_per_kwh": 0.72}
        updated = api.put(
            f"/energy/analysis-scenarios/{created.json()['id']}", json=definition,
        )
        assert updated.status_code == 200, updated.text
        run = api.post(
            f"/energy/analysis-scenarios/{created.json()['id']}/runs",
            json={"date": "2026-05-18"},
        )
        assert run.status_code == 201, run.text
        assert run.json()["scenario_snapshot"]["conditions"] == definition["conditions"]
        assert api.get(f"/energy/analysis-runs/{run.json()['id']}").json()[
            "scenario_snapshot"
        ]["conditions"] == definition["conditions"]

        for field in ("electricity_price_krw_per_kwh",
                      "carbon_intensity_kg_co2e_per_kwh"):
            invalid = {**definition, "conditions": {**definition["conditions"], field: -0.01}}
            assert api.post("/energy/analysis-scenarios", json=invalid).status_code == 422


def test_array_and_representative_ids_trim_and_reject_whitespace(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        create_payload = payload(count=1)
        create_payload["arrays"][0]["id"] = "  client-array  "
        created = api.post("/energy/scenarios", json=create_payload)
        assert created.status_code == 201, created.text

        blank_create = payload(count=1)
        blank_create["arrays"][0]["id"] = "  \t "
        assert api.post("/energy/scenarios", json=blank_create).status_code == 422

        trimmed_update = payload(count=1)
        trimmed_update["arrays"][0]["id"] = "  trimmed-array  "
        trimmed = api.put(
            f"/energy/scenarios/{created.json()['id']}", json=trimmed_update,
        )
        assert trimmed.status_code == 200, trimmed.text
        assert trimmed.json()["arrays"][0]["id"] == f"{created.json()['id']}-array-1"

        invalid_update = payload(count=1)
        invalid_update["arrays"][0]["id"] = "  \t "
        response = api.put(f"/energy/scenarios/{created.json()['id']}", json=invalid_update)
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "request_validation_error"

        representative = api.put("/energy/buildings/D4/representative-plan", json={
            "installation_plan_id": "  D4-scenario-south-2x8  ",
        })
        assert representative.status_code == 200, representative.text
        assert representative.json()["installation_plan_id"] == "D4-scenario-south-2x8"
        blank_representative = api.put("/energy/buildings/D4/representative-plan", json={
            "installation_plan_id": "   ",
        })
        assert blank_representative.status_code == 422


def test_required_resource_ids_trim_at_api_boundaries(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        scenario_payload = payload(count=1)
        scenario_payload["building_id"] = "  D4  "
        for field in ("roof_id", "roof_zone_id", "module_id"):
            scenario_payload["arrays"][0][field] = f"  {scenario_payload['arrays'][0][field]}  "
        scenario = api.post("/energy/scenarios", json=scenario_payload)
        assert scenario.status_code == 201, scenario.text
        assert scenario.json()["building_id"] == "D4"
        assert {
            field: scenario.json()["arrays"][0][field]
            for field in ("roof_id", "roof_zone_id", "module_id")
        } == {
            "roof_id": "D4-roof-west",
            "roof_zone_id": "D4-roof-west-main",
            "module_id": "module-default-441wp",
        }

        plan_payload = payload(count=1)
        plan_payload.pop("weather_preset")
        plan_payload["building_id"] = "  D4  "
        plan = api.post("/energy/installation-plans", json=plan_payload)
        assert plan.status_code == 201, plan.text
        assert plan.json()["building_id"] == "D4"

        definition = {
            "building_id": "  D4  ", "name": "Trim identifiers",
            "representative_plan_id": plan.json()["id"], "alternative_plan_id": None,
            "baseline": "no_solar", "conditions": {
                "demand_source": "predicted", "weather_preset": "clear",
            },
        }
        analysis_scenario = api.post("/energy/analysis-scenarios", json=definition)
        assert analysis_scenario.status_code == 201, analysis_scenario.text
        assert analysis_scenario.json()["building_id"] == "D4"

        run = api.post("/energy/analysis-runs", json={
            "installation_plan_id": f"  {plan.json()['id']}  ",
            "conditions": {"date": "2026-05-18", "weather_preset": "clear"},
        })
        assert run.status_code == 201, run.text
        assert run.json()["installation_plan_id"] == plan.json()["id"]


def test_required_resource_ids_reject_whitespace_with_structured_422(
    tmp_path, monkeypatch,
) -> None:
    cases = (
        ("/energy/scenarios", payload(count=1), ("building_id",)),
        ("/energy/installation-plans",
         {key: value for key, value in payload(count=1).items() if key != "weather_preset"},
         ("building_id",)),
        ("/energy/analysis-scenarios", {
            "building_id": "D4", "name": "Invalid identifiers",
            "representative_plan_id": "D4-scenario-south-2x8", "alternative_plan_id": None,
            "baseline": "no_solar", "conditions": {
                "demand_source": "predicted", "weather_preset": "clear",
            },
        }, ("building_id",)),
        ("/energy/analysis-runs", {
            "installation_plan_id": "D4-scenario-south-2x8",
            "conditions": {"date": "2026-05-18", "weather_preset": "clear"},
        }, ("installation_plan_id",)),
    )
    with client(tmp_path, monkeypatch) as api:
        for path, valid, field_path in cases:
            invalid = __import__("copy").deepcopy(valid)
            target = invalid
            for key in field_path[:-1]:
                target = target[key]
            target[field_path[-1]] = "  \t "
            response = api.post(path, json=invalid)
            assert response.status_code == 422, (field_path, response.text)
            assert response.json()["detail"]["code"] == "request_validation_error"

        for field in ("roof_id", "roof_zone_id", "module_id"):
            invalid = payload(count=1)
            invalid["arrays"][0][field] = "  \t "
            response = api.post("/energy/scenarios", json=invalid)
            assert response.status_code == 422, (field, response.text)
            assert response.json()["detail"]["code"] == "request_validation_error"


def test_analysis_scenario_update_rejects_building_reassignment(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        definition = {
            "building_id": "D4", "name": "Owned by D4",
            "representative_plan_id": "D4-scenario-south-2x8",
            "alternative_plan_id": None, "baseline": "no_solar", "conditions": {
                "demand_source": "predicted", "weather_preset": "clear",
            },
        }
        created = api.post("/energy/analysis-scenarios", json=definition)
        assert created.status_code == 201, created.text
        moved = {
            **definition, "building_id": "D3",
            "representative_plan_id": "D3-scenario-campus-baseline",
        }
        response = api.put(
            f"/energy/analysis-scenarios/{created.json()['id']}", json=moved,
        )
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "analysis_scenario_building_mismatch"
        assert api.get(f"/energy/analysis-scenarios/{created.json()['id']}").json()[
            "building_id"
        ] == "D4"


def test_representative_rejects_plan_from_another_building(tmp_path, monkeypatch) -> None:
    with client(tmp_path, monkeypatch) as api:
        response = api.put("/energy/buildings/D3/representative-installation-plan", json={
            "installation_plan_id": "D4-scenario-south-2x8",
        })
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "installation_plan_building_mismatch"


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
