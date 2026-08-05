from __future__ import annotations

import sqlite3
from dataclasses import replace

import pytest

from weather.energy.models import AnalysisScenario, PanelArray, Scenario, ScenarioInterval
from weather.energy.persistence import (
    AnalysisRunRepository,
    AnalysisScenarioBuildingMismatch,
    AnalysisScenarioPlanConflict,
    AnalysisScenarioRepository,
    Database,
    InstallationPlanBuildingMismatch,
    InstallationPlanRepository,
    RepresentativePlanConflict,
    RepresentativePlanRepository,
    ScenarioBuildingMismatch,
    ScenarioRepository,
)
from weather.energy.seed import D4_SEED_COUNTS, SeedBuilding, seed_buildings


def array(array_id: str, scenario_id: str = "scenario-test") -> PanelArray:
    return PanelArray(
        id=array_id, scenario_id=scenario_id, roof_id="D4-roof-west",
        roof_zone_id="D4-roof-west-main", module_id="module-default-441wp",
        origin_x_m=10.125, origin_y_m=11.875, rows=2, columns=8,
        azimuth_deg=180.0, tilt_deg=25.0, orientation="portrait",
        module_width_m=1.05, module_length_m=2.10,
        module_efficiency_percent=20.0, module_nominal_power_wp=441.0,
        inter_panel_gap_m=0.02,
    )


def scenario(*arrays: PanelArray) -> Scenario:
    return Scenario(
        id="scenario-test", building_id="D4", name="Two-array persistence check",
        weather_preset="clear", created_at="2026-05-15T12:00:00+09:00",
        updated_at="2026-05-15T12:00:00+09:00", arrays=arrays,
        intervals=(ScenarioInterval(
            timestamp="2026-05-15T12:00:00+09:00", ambient_temperature_c=24.125,
            global_irradiance_w_m2=912.75, predicted_demand_kw=42.625,
            predicted_demand_energy_kwh=10.65625,
            generation_energy_kwh=1.234567890123, weather_source="scenario",
            demand_quality="predicted",
        ),),
    )


def test_initializer_is_idempotent_and_enables_foreign_keys(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    database.initialize()
    with database.connect() as connection:
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )}
        assert {"buildings", "rooms", "timetable_events", "load_profiles",
                "roof_zones", "roof_obstacles", "scenarios", "panel_arrays",
                "scenario_intervals"} <= tables
        counts = {table: connection.execute(
            f"SELECT count(*) FROM {table}").fetchone()[0] for table in D4_SEED_COUNTS}
    assert counts == D4_SEED_COUNTS


def test_d4_seed_matches_frontend_fixture_and_has_repeatable_extension_path(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    with database.connect() as connection:
        room = connection.execute(
            "SELECT room_type, computer_count, has_large_screen FROM rooms WHERE id = ?",
            ("d4-108",),
        ).fetchone()
        roof = connection.execute(
            "SELECT roof_id, polygon_json, edge_margin_m FROM roof_zones WHERE id = ?",
            ("D4-roof-west-main",),
        ).fetchone()
        fixture_array = connection.execute(
            "SELECT rows, columns, module_nominal_power_wp, tilt_deg FROM panel_arrays WHERE id = ?",
            ("D4-array-south-2x8",),
        ).fetchone()
        seed_buildings(connection)
        extension = SeedBuilding(
            id="X1", display_name="Extension fixture", rooms=(), roof_zones=(),
        )
        seed_buildings(connection, (extension,))
        seed_buildings(connection, (extension,))
        stable_rooms = connection.execute("SELECT count(*) FROM rooms WHERE building_id = 'D4'").fetchone()[0]
        extension_count = connection.execute(
            "SELECT count(*) FROM buildings WHERE id = 'X1'"
        ).fetchone()[0]
    assert tuple(room) == ("computer_lab", 34, 1)
    assert roof[0] == "D4-roof-west"
    assert '"xMeters":31' in roof[1]
    assert roof[2] == 0.5
    assert tuple(fixture_array) == (2, 8, 441.0, 25.0)
    assert stable_rooms == 69
    assert extension_count == 1


def test_foreign_keys_reject_orphan_event_and_array(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    with database.connect() as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO timetable_events "
                "(id, room_id, weekday, start_minute, duration_minutes, subject, professor_id) "
                "VALUES ('orphan-event', 'missing-room', 'Mon', 540, 60, 'X', 'P-X')")
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO panel_arrays "
                "(id, scenario_id, roof_id, roof_zone_id, module_id, origin_x_m, origin_y_m, "
                "rows, columns, azimuth_deg, tilt_deg, orientation, module_width_m, "
                "module_length_m, module_efficiency_percent, module_nominal_power_wp, inter_panel_gap_m) "
                "VALUES ('orphan-array', 'missing-scenario', 'missing-roof', 'missing-zone', "
                "'module-default-441wp', 1, 1, 1, 1, 180, 25, 'portrait', 1.05, 2.1, 20, 441, .02)")


def test_scenario_and_two_arrays_round_trip_without_numeric_drift(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    repository = ScenarioRepository(database)
    original = scenario(array("array-one"), replace(
        array("array-two"), origin_x_m=20.000000000000004, azimuth_deg=135.5))
    repository.save(original)
    assert repository.get(original.id) == original

    with pytest.raises(ScenarioBuildingMismatch):
        repository.save(replace(original, building_id="D3"))
    assert repository.get(original.id) == original


def test_invalid_roof_rolls_back_scenario_arrays_and_intervals(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    repository = ScenarioRepository(database)
    invalid = scenario(array("valid-first"), replace(array("orphan"), roof_id="missing-roof"))
    with pytest.raises(sqlite3.IntegrityError):
        repository.save(invalid)
    assert repository.get(invalid.id) is None
    with database.connect() as connection:
        assert connection.execute(
            "SELECT count(*) FROM panel_arrays WHERE scenario_id = ?", (invalid.id,)
        ).fetchone()[0] == 0
        assert connection.execute(
            "SELECT count(*) FROM scenario_intervals WHERE scenario_id = ?", (invalid.id,)
        ).fetchone()[0] == 0


@pytest.mark.parametrize("bad_value", [
    lambda: replace(array("bad"), origin_x_m=float("nan")),
    lambda: replace(array("bad"), columns=0),
    lambda: replace(array("bad"), tilt_deg=46),
    lambda: replace(scenario(), created_at="not-an-iso-timestamp"),
])
def test_malformed_models_are_rejected_before_sql(bad_value) -> None:
    with pytest.raises(ValueError):
        bad_value()


def test_multiple_installation_plans_and_atomic_representative_replacement(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    scenarios = ScenarioRepository(database)
    plans = InstallationPlanRepository(database)
    representatives = RepresentativePlanRepository(database)
    first = replace(scenario(array("plan-one-array")), id="plan-one", arrays=(
        replace(array("plan-one-array"), scenario_id="plan-one"),
    ), intervals=())
    second = replace(first, id="plan-two", name="Second", arrays=(
        replace(array("plan-two-array"), scenario_id="plan-two", origin_x_m=20.0),
    ))
    scenarios.save(first)
    scenarios.save(second)

    assert {item.id for item in plans.list_for_building("D4")} >= {"plan-one", "plan-two"}
    representatives.set("D4", first.id, "2026-05-15T12:00:00+09:00")
    representatives.set("D4", second.id, "2026-05-15T12:01:00+09:00")
    assert representatives.get("D4").installation_plan_id == second.id
    with database.connect() as connection:
        assert connection.execute(
            "SELECT count(*) FROM building_representative_plans WHERE building_id='D4'"
        ).fetchone()[0] == 1

    with pytest.raises(RepresentativePlanConflict):
        plans.delete(second.id)
    assert representatives.unset("D4") is True
    assert plans.delete(second.id) is True
    assert plans.get(first.id).arrays == first.arrays


def test_plan_updates_preserve_legacy_intervals_and_reject_building_reassignment(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    legacy = scenario(array("legacy-array"))
    ScenarioRepository(database).save(legacy)
    plans = InstallationPlanRepository(database)
    plan = plans.get(legacy.id)

    plans.save(replace(plan, name="Renamed plan"))
    assert ScenarioRepository(database).get(legacy.id).intervals == legacy.intervals

    with pytest.raises(InstallationPlanBuildingMismatch):
        plans.save(replace(plan, building_id="D3"))
    assert plans.get(legacy.id).building_id == "D4"


def test_analysis_scenario_plan_references_prevent_plan_deletion(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    plans = InstallationPlanRepository(database)
    definitions = AnalysisScenarioRepository(database)
    definition = AnalysisScenario(
        id="analysis-scenario-test", building_id="D4", name="Saved comparison",
        representative_plan_id="D4-scenario-south-2x8", alternative_plan_id=None,
        baseline="no_solar", conditions={"weather_preset": "clear"},
        created_at="2026-05-15T12:00:00+09:00",
        updated_at="2026-05-15T12:00:00+09:00",
    )
    definitions.save(definition)

    with pytest.raises(AnalysisScenarioPlanConflict):
        plans.delete(definition.representative_plan_id)
    with database.connect() as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "DELETE FROM scenarios WHERE id=?", (definition.representative_plan_id,),
            )
    assert definitions.get(definition.id) == definition


def test_analysis_scenario_repository_rejects_building_reassignment(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    definitions = AnalysisScenarioRepository(database)
    definition = AnalysisScenario(
        id="analysis-scenario-owner", building_id="D4", name="Owned by D4",
        representative_plan_id="D4-scenario-south-2x8", alternative_plan_id=None,
        baseline="no_solar", conditions={"weather_preset": "clear"},
        created_at="2026-05-15T12:00:00+09:00",
        updated_at="2026-05-15T12:00:00+09:00",
    )
    definitions.save(definition)

    moved = replace(
        definition, building_id="D3", representative_plan_id="D3-scenario-campus-baseline",
        updated_at="2026-05-15T12:01:00+09:00",
    )
    with pytest.raises(AnalysisScenarioBuildingMismatch):
        definitions.save(moved)
    assert definitions.get(definition.id) == definition


def test_analysis_runs_are_append_only_snapshots_independent_of_plan_and_representative(tmp_path) -> None:
    database = Database(tmp_path / "energy.sqlite3")
    database.initialize()
    plans = InstallationPlanRepository(database)
    representatives = RepresentativePlanRepository(database)
    runs = AnalysisRunRepository(database)
    source = plans.get("D4-scenario-south-2x8")
    representatives.set("D4", source.id, "2026-05-15T12:00:00+09:00")
    first = runs.create(
        run_id="analysis-run-one", building_id="D4", installation_plan_id=source.id,
        created_at="2026-05-15T12:00:00+09:00",
        plan_snapshot={"id": source.id, "name": source.name, "arrays": [source.arrays[0].to_dict()]},
        conditions={"date": "2026-05-18", "weather_preset": "clear"},
        result={"totals": {"generation_energy_kwh": 1.25}},
    )
    second = runs.create(
        run_id="analysis-run-two", building_id="D4", installation_plan_id=source.id,
        created_at="2026-05-15T12:01:00+09:00", plan_snapshot=first.plan_snapshot,
        conditions={"date": "2026-05-19", "weather_preset": "overcast"},
        result={"totals": {"generation_energy_kwh": 0.5}},
    )

    changed = replace(source, name="Changed later", arrays=(
        replace(source.arrays[0], columns=4),
    ))
    plans.save(changed)
    assert runs.get(first.id) == first
    assert [item.id for item in runs.list_for_building("D4")] == [second.id, first.id]
    assert representatives.get("D4").installation_plan_id == source.id
    with database.connect() as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("UPDATE analysis_runs SET result_json='{}' WHERE id=?", (first.id,))
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("DELETE FROM analysis_runs WHERE id=?", (first.id,))


def test_v2_migration_archives_dangling_references_before_normalizing_definitions(
    tmp_path,
) -> None:
    path = tmp_path / "v2.sqlite3"
    database = Database(path)
    database.initialize()
    valid_plan = "D4-scenario-south-2x8"
    with database.connect() as connection:
        with connection:
            connection.executescript("""
                DROP TABLE analysis_scenarios;
                CREATE TABLE analysis_scenarios (
                    id TEXT PRIMARY KEY, building_id TEXT NOT NULL REFERENCES buildings(id),
                    name TEXT NOT NULL, representative_plan_id TEXT NOT NULL,
                    alternative_plan_id TEXT, baseline TEXT NOT NULL,
                    conditions_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
            """)
            rows = (
                ("valid", "D4", "Valid", valid_plan, None),
                ("bad-alternative", "D4", "Clear alternative", valid_plan, "missing-alt"),
                ("bad-representative", "D4", "Drop definition", "missing-representative", None),
            )
            connection.executemany(
                "INSERT INTO analysis_scenarios VALUES (?,?,?,?,?,'no_solar','{}',?,?)",
                ((*row, "2026-05-15T12:00:00+09:00", "2026-05-15T12:00:00+09:00")
                 for row in rows),
            )
            connection.execute(
                "INSERT INTO analysis_runs "
                "(id, building_id, installation_plan_id, created_at, plan_snapshot_json, "
                "conditions_json, result_json, analysis_scenario_id) "
                "VALUES (?,?,?,?,?,?,?,?)",
                ("orphaned-definition-run", "D4", "missing-representative",
                 "2026-05-15T12:01:00+09:00", '{"preserved":true}',
                 '{"weather_preset":"clear"}', '{"generation_energy_kwh":1.25}',
                 "bad-representative"),
            )
            connection.execute("PRAGMA user_version = 2")

    database.initialize()
    database.initialize()

    with database.connect() as connection:
        migrated = tuple(connection.execute(
            "SELECT id, representative_plan_id, alternative_plan_id "
            "FROM analysis_scenarios ORDER BY id"
        ))
        assert [tuple(row) for row in migrated] == [
            ("bad-alternative", valid_plan, None),
            ("valid", valid_plan, None),
        ]
        archived = tuple(connection.execute(
            "SELECT id, representative_plan_id, alternative_plan_id, migration_reason "
            "FROM analysis_scenario_migration_archive ORDER BY id"
        ))
        assert [tuple(row) for row in archived] == [
            ("bad-alternative", valid_plan, "missing-alt", "missing_alternative_plan"),
            ("bad-representative", "missing-representative", None,
             "missing_representative_plan"),
        ]
        preserved_run = connection.execute(
            "SELECT installation_plan_id, plan_snapshot_json, conditions_json, result_json, "
            "analysis_scenario_id FROM analysis_runs WHERE id='orphaned-definition-run'"
        ).fetchone()
        assert preserved_run[0] == "missing-representative"
        assert preserved_run[1] == '{"preserved":true}'
        assert __import__("json").loads(preserved_run[2]) == {
            "weather_preset": "clear",
            "electricity_price_krw_per_kwh": 160,
            "carbon_intensity_kg_co2e_per_kwh": 0.45,
        }
        assert __import__("json").loads(preserved_run[3]) == {
            "generation_energy_kwh": 1.25,
            "scenario_snapshot": {"conditions": {
                "electricity_price_krw_per_kwh": 160,
                "carbon_intensity_kg_co2e_per_kwh": 0.45,
            }},
        }
        assert preserved_run[4] == "bad-representative"
        with pytest.raises(sqlite3.IntegrityError, match="analysis runs are immutable"):
            connection.execute(
                "UPDATE analysis_runs SET result_json='{}' WHERE id='orphaned-definition-run'"
            )
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 4


def test_v3_cost_condition_migration_backfills_editable_and_immutable_snapshots(
    tmp_path,
) -> None:
    path = tmp_path / "v3-costs.sqlite3"
    database = Database(path)
    database.initialize()
    with database.connect() as connection:
        with connection:
            connection.execute(
                "INSERT INTO analysis_scenarios VALUES (?,?,?,?,?,'no_solar',?,?,?)",
                ("legacy-costs", "D4", "Legacy costs", "D4-scenario-south-2x8", None,
                 '{"demand_source":"predicted","weather_preset":"clear"}',
                 "2026-05-15T12:00:00+09:00", "2026-05-15T12:00:00+09:00"),
            )
            connection.execute(
                "INSERT INTO analysis_runs "
                "(id, building_id, installation_plan_id, created_at, plan_snapshot_json, "
                "conditions_json, result_json, analysis_scenario_id) VALUES (?,?,?,?,?,?,?,?)",
                ("legacy-cost-run", "D4", "D4-scenario-south-2x8",
                 "2026-05-15T12:01:00+09:00", '{}',
                 '{"demand_source":"predicted","weather_preset":"clear"}',
                 '{"scenario_snapshot":{"conditions":{"demand_source":"predicted",'
                 '"weather_preset":"clear"}}}', "legacy-costs"),
            )
            connection.execute("PRAGMA user_version = 3")

    database.initialize()
    definition = AnalysisScenarioRepository(database).get("legacy-costs")
    run = AnalysisRunRepository(database).get("legacy-cost-run")
    expected = {
        "electricity_price_krw_per_kwh": 160,
        "carbon_intensity_kg_co2e_per_kwh": 0.45,
    }
    assert {key: definition.conditions[key] for key in expected} == expected
    assert {key: run.conditions[key] for key in expected} == expected
    assert {key: run.result["scenario_snapshot"]["conditions"][key]
            for key in expected} == expected
    with database.connect() as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 4


def test_legacy_scenarios_are_exposed_as_plans_without_data_loss(tmp_path) -> None:
    path = tmp_path / "legacy.sqlite3"
    database = Database(path)
    database.initialize()
    legacy = scenario(array("legacy-array"))
    ScenarioRepository(database).save(legacy)
    with database.connect() as connection:
        with connection:
            connection.executescript("""
                DROP TRIGGER analysis_runs_no_update;
                DROP TRIGGER analysis_runs_no_delete;
                DROP TABLE analysis_runs;
                DROP TABLE analysis_scenarios;
                CREATE TABLE analysis_scenarios (
                    id TEXT PRIMARY KEY, building_id TEXT NOT NULL REFERENCES buildings(id),
                    name TEXT NOT NULL, representative_plan_id TEXT NOT NULL,
                    alternative_plan_id TEXT, baseline TEXT NOT NULL,
                    conditions_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                INSERT INTO analysis_scenarios VALUES (
                    'legacy-analysis', 'D4', 'Legacy analysis', 'scenario-test', NULL,
                    'no_solar', '{}', '2026-05-15T12:00:00+09:00',
                    '2026-05-15T12:00:00+09:00'
                );
                CREATE TABLE analysis_runs (
                    id TEXT PRIMARY KEY, building_id TEXT NOT NULL,
                    installation_plan_id TEXT NOT NULL, created_at TEXT NOT NULL,
                    plan_snapshot_json TEXT NOT NULL, conditions_json TEXT NOT NULL,
                    result_json TEXT NOT NULL
                );
                INSERT INTO analysis_runs VALUES (
                    'legacy-run', 'D4', 'scenario-test', '2026-05-15T12:00:00+09:00',
                    '{}', '{}', '{}'
                );
                DROP TABLE building_representative_plans;
                DROP VIEW installation_plans;
                DROP INDEX idx_scenarios_building_id_id;
                PRAGMA user_version = 0;
            """)

    database.initialize()

    migrated = InstallationPlanRepository(database).get(legacy.id)
    assert migrated.id == legacy.id
    assert migrated.arrays == legacy.arrays
    assert ScenarioRepository(database).get(legacy.id) == legacy
    with database.connect() as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] >= 3
        assert connection.execute(
            "SELECT count(*) FROM scenario_intervals WHERE scenario_id=?", (legacy.id,)
        ).fetchone()[0] == 1
        assert connection.execute(
            "SELECT representative_plan_id FROM analysis_scenarios WHERE id='legacy-analysis'"
        ).fetchone()[0] == legacy.id
        foreign_key_columns = {
            row[3] for row in connection.execute("PRAGMA foreign_key_list(analysis_scenarios)")
            if row[2] == "scenarios"
        }
        assert {"representative_plan_id", "alternative_plan_id"} <= foreign_key_columns
        columns = {row[1] for row in connection.execute("PRAGMA table_info(analysis_runs)")}
        assert "analysis_scenario_id" in columns
        assert connection.execute(
            "SELECT result_json FROM analysis_runs WHERE id='legacy-run'"
        ).fetchone()[0] == "{}"
