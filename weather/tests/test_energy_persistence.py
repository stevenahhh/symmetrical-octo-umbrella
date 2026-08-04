from __future__ import annotations

import sqlite3
from dataclasses import replace

import pytest

from weather.energy.models import PanelArray, Scenario, ScenarioInterval
from weather.energy.persistence import Database, ScenarioRepository
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
