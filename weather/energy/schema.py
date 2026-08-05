"""SQLite schema for seeded campus data and saved simulations."""

from __future__ import annotations

import sqlite3

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    display_name TEXT NOT NULL,
    timezone TEXT NOT NULL,
    demand_quality TEXT NOT NULL,
    assumption_type TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS load_profiles (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    room_type TEXT NOT NULL UNIQUE,
    standby_kw REAL NOT NULL CHECK(standby_kw >= 0),
    occupied_plug_kw REAL NOT NULL CHECK(occupied_plug_kw >= 0),
    lighting_small_kw REAL NOT NULL CHECK(lighting_small_kw >= 0),
    lighting_medium_kw REAL NOT NULL CHECK(lighting_medium_kw >= 0),
    lighting_large_kw REAL NOT NULL CHECK(lighting_large_kw >= 0),
    computer_kw_each REAL NOT NULL CHECK(computer_kw_each >= 0),
    large_screen_kw REAL NOT NULL CHECK(large_screen_kw >= 0),
    occupied_hvac_kw_each REAL NOT NULL CHECK(occupied_hvac_kw_each >= 0),
    server_hvac_kw_each REAL NOT NULL CHECK(server_hvac_kw_each >= 0),
    quality TEXT NOT NULL,
    assumption_type TEXT NOT NULL,
    calibration TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    load_profile_id TEXT NOT NULL REFERENCES load_profiles(id),
    room_number TEXT NOT NULL,
    floor_number INTEGER NOT NULL CHECK(floor_number >= 0),
    wing_id TEXT NOT NULL,
    room_size TEXT NOT NULL CHECK(room_size IN ('small','medium','large')),
    room_type TEXT NOT NULL,
    computer_count INTEGER NOT NULL CHECK(computer_count >= 0),
    has_large_screen INTEGER NOT NULL CHECK(has_large_screen IN (0,1)),
    hvac_unit_count INTEGER NOT NULL CHECK(hvac_unit_count >= 0),
    quality TEXT NOT NULL,
    UNIQUE(building_id, room_number)
);
CREATE TABLE IF NOT EXISTS timetable_events (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    weekday TEXT NOT NULL,
    start_minute INTEGER NOT NULL CHECK(start_minute >= 0 AND start_minute < 1440),
    duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0),
    subject TEXT NOT NULL,
    professor_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roof_zones (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    roof_id TEXT NOT NULL,
    building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    coordinate_system TEXT NOT NULL CHECK(coordinate_system = 'roof-local-meters'),
    polygon_json TEXT NOT NULL,
    edge_margin_m REAL NOT NULL CHECK(edge_margin_m >= 0),
    UNIQUE(roof_id, id)
);
CREATE TABLE IF NOT EXISTS roof_obstacles (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    roof_id TEXT NOT NULL,
    roof_zone_id TEXT NOT NULL,
    polygon_json TEXT NOT NULL,
    clearance_m REAL NOT NULL CHECK(clearance_m >= 0),
    FOREIGN KEY(roof_id, roof_zone_id) REFERENCES roof_zones(roof_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    building_id TEXT NOT NULL REFERENCES buildings(id),
    name TEXT NOT NULL,
    weather_preset TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS panel_arrays (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    roof_id TEXT NOT NULL,
    roof_zone_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    origin_x_m REAL NOT NULL,
    origin_y_m REAL NOT NULL,
    rows INTEGER NOT NULL CHECK(rows >= 1),
    columns INTEGER NOT NULL CHECK(columns >= 1),
    azimuth_deg REAL NOT NULL CHECK(azimuth_deg >= 0 AND azimuth_deg < 360),
    tilt_deg REAL NOT NULL CHECK(tilt_deg >= 0 AND tilt_deg <= 45),
    orientation TEXT NOT NULL CHECK(orientation IN ('portrait','landscape')),
    module_width_m REAL NOT NULL CHECK(module_width_m > 0),
    module_length_m REAL NOT NULL CHECK(module_length_m > 0),
    module_efficiency_percent REAL NOT NULL CHECK(module_efficiency_percent >= 0 AND module_efficiency_percent <= 100),
    module_nominal_power_wp REAL NOT NULL CHECK(module_nominal_power_wp > 0),
    inter_panel_gap_m REAL NOT NULL CHECK(inter_panel_gap_m >= 0),
    FOREIGN KEY(roof_id, roof_zone_id) REFERENCES roof_zones(roof_id, id)
);
CREATE TABLE IF NOT EXISTS scenario_intervals (
    scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    ambient_temperature_c REAL NOT NULL,
    global_irradiance_w_m2 REAL NOT NULL CHECK(global_irradiance_w_m2 >= 0),
    predicted_demand_kw REAL NOT NULL CHECK(predicted_demand_kw >= 0),
    predicted_demand_energy_kwh REAL NOT NULL CHECK(predicted_demand_energy_kwh >= 0),
    generation_energy_kwh REAL NOT NULL CHECK(generation_energy_kwh >= 0),
    weather_source TEXT NOT NULL,
    demand_quality TEXT NOT NULL,
    PRIMARY KEY(scenario_id, timestamp)
);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_events_room ON timetable_events(room_id);
CREATE INDEX IF NOT EXISTS idx_arrays_scenario ON panel_arrays(scenario_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scenarios_building_id_id
    ON scenarios(building_id, id);

-- Existing scenarios are installation plans. This compatibility view preserves every
-- legacy row while giving new code an explicit read boundary without dual writes.
CREATE VIEW IF NOT EXISTS installation_plans AS
SELECT id, building_id, name, created_at, updated_at FROM scenarios;

CREATE TABLE IF NOT EXISTS building_representative_plans (
    building_id TEXT PRIMARY KEY REFERENCES buildings(id) ON DELETE CASCADE,
    installation_plan_id TEXT NOT NULL UNIQUE,
    selected_at TEXT NOT NULL,
    FOREIGN KEY(building_id, installation_plan_id)
        REFERENCES scenarios(building_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS analysis_scenarios (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    building_id TEXT NOT NULL REFERENCES buildings(id),
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    representative_plan_id TEXT NOT NULL,
    alternative_plan_id TEXT,
    baseline TEXT NOT NULL CHECK(baseline = 'no_solar'),
    conditions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(alternative_plan_id IS NULL OR alternative_plan_id <> representative_plan_id),
    FOREIGN KEY(building_id, representative_plan_id)
        REFERENCES scenarios(building_id, id) ON DELETE RESTRICT,
    FOREIGN KEY(building_id, alternative_plan_id)
        REFERENCES scenarios(building_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_analysis_scenarios_building_updated
    ON analysis_scenarios(building_id, updated_at, id);

CREATE TABLE IF NOT EXISTS analysis_runs (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    building_id TEXT NOT NULL REFERENCES buildings(id),
    installation_plan_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    plan_snapshot_json TEXT NOT NULL,
    conditions_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    analysis_scenario_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_building_created
    ON analysis_runs(building_id, created_at, id);
CREATE TRIGGER IF NOT EXISTS analysis_runs_no_update
BEFORE UPDATE ON analysis_runs
BEGIN
    SELECT RAISE(ABORT, 'analysis runs are immutable');
END;
CREATE TRIGGER IF NOT EXISTS analysis_runs_no_delete
BEFORE DELETE ON analysis_runs
BEGIN
    SELECT RAISE(ABORT, 'analysis runs are immutable');
END;
"""


_ANALYSIS_SCENARIOS_V3_SQL = """
CREATE TABLE analysis_scenarios (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    building_id TEXT NOT NULL REFERENCES buildings(id),
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    representative_plan_id TEXT NOT NULL,
    alternative_plan_id TEXT,
    baseline TEXT NOT NULL CHECK(baseline = 'no_solar'),
    conditions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(alternative_plan_id IS NULL OR alternative_plan_id <> representative_plan_id),
    FOREIGN KEY(building_id, representative_plan_id)
        REFERENCES scenarios(building_id, id) ON DELETE RESTRICT,
    FOREIGN KEY(building_id, alternative_plan_id)
        REFERENCES scenarios(building_id, id) ON DELETE RESTRICT
)
"""

_ANALYSIS_SCENARIO_MIGRATION_ARCHIVE_SQL = """
CREATE TABLE IF NOT EXISTS analysis_scenario_migration_archive (
    id TEXT PRIMARY KEY,
    building_id TEXT NOT NULL,
    name TEXT NOT NULL,
    representative_plan_id TEXT NOT NULL,
    alternative_plan_id TEXT,
    baseline TEXT NOT NULL,
    conditions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    migration_reason TEXT NOT NULL
)
"""


def _migrate_analysis_scenarios(connection: sqlite3.Connection) -> None:
    """Rebuild v2 definitions so saved plan references are database-enforced."""
    foreign_key_columns = {
        row[3] for row in connection.execute("PRAGMA foreign_key_list(analysis_scenarios)")
        if row[2] == "scenarios"
    }
    if {"representative_plan_id", "alternative_plan_id"} <= foreign_key_columns:
        return
    connection.execute("DROP INDEX IF EXISTS idx_analysis_scenarios_building_updated")
    connection.execute("ALTER TABLE analysis_scenarios RENAME TO analysis_scenarios_v2")
    connection.execute(_ANALYSIS_SCENARIOS_V3_SQL)
    connection.execute(_ANALYSIS_SCENARIO_MIGRATION_ARCHIVE_SQL)
    connection.execute(
        "INSERT OR REPLACE INTO analysis_scenario_migration_archive "
        "(id, building_id, name, representative_plan_id, alternative_plan_id, baseline, "
        "conditions_json, created_at, updated_at, migration_reason) "
        "SELECT legacy.id, legacy.building_id, legacy.name, legacy.representative_plan_id, "
        "legacy.alternative_plan_id, legacy.baseline, legacy.conditions_json, "
        "legacy.created_at, legacy.updated_at, "
        "CASE WHEN representative.id IS NULL THEN 'missing_representative_plan' "
        "WHEN alternative.id IS NULL THEN 'missing_alternative_plan' "
        "ELSE 'duplicate_alternative_plan' END "
        "FROM analysis_scenarios_v2 AS legacy "
        "LEFT JOIN scenarios AS representative "
        "ON representative.id = legacy.representative_plan_id "
        "AND representative.building_id = legacy.building_id "
        "LEFT JOIN scenarios AS alternative "
        "ON alternative.id = NULLIF(trim(legacy.alternative_plan_id), '') "
        "AND alternative.building_id = legacy.building_id "
        "WHERE representative.id IS NULL OR "
        "(NULLIF(trim(legacy.alternative_plan_id), '') IS NOT NULL "
        "AND (alternative.id IS NULL OR alternative.id = representative.id))"
    )
    connection.execute(
        "INSERT INTO analysis_scenarios "
        "(id, building_id, name, representative_plan_id, alternative_plan_id, baseline, "
        "conditions_json, created_at, updated_at) "
        "SELECT legacy.id, legacy.building_id, legacy.name, representative.id, "
        "CASE WHEN alternative.id IS NOT NULL AND alternative.id <> representative.id "
        "THEN alternative.id ELSE NULL END, legacy.baseline, legacy.conditions_json, "
        "legacy.created_at, legacy.updated_at "
        "FROM analysis_scenarios_v2 AS legacy "
        "JOIN scenarios AS representative "
        "ON representative.id = legacy.representative_plan_id "
        "AND representative.building_id = legacy.building_id "
        "LEFT JOIN scenarios AS alternative "
        "ON alternative.id = NULLIF(trim(legacy.alternative_plan_id), '') "
        "AND alternative.building_id = legacy.building_id"
    )
    connection.execute("DROP TABLE analysis_scenarios_v2")


def _migrate_analysis_cost_conditions(connection: sqlite3.Connection) -> None:
    """Backfill assumptions in legacy editable definitions and immutable snapshots."""
    price_path = "$.electricity_price_krw_per_kwh"
    carbon_path = "$.carbon_intensity_kg_co2e_per_kwh"
    connection.execute(
        "UPDATE analysis_scenarios SET conditions_json=json_set(conditions_json, ?, "
        "COALESCE(json_extract(conditions_json, ?), 160), ?, "
        "COALESCE(json_extract(conditions_json, ?), 0.45))",
        (price_path, price_path, carbon_path, carbon_path),
    )
    # The migration is the only permitted rewrite of historical snapshots. Remove
    # and restore the update guard within the surrounding initialization transaction.
    connection.execute("DROP TRIGGER IF EXISTS analysis_runs_no_update")
    connection.execute(
        "UPDATE analysis_runs SET conditions_json=json_set(conditions_json, ?, "
        "COALESCE(json_extract(conditions_json, ?), 160), ?, "
        "COALESCE(json_extract(conditions_json, ?), 0.45))",
        (price_path, price_path, carbon_path, carbon_path),
    )
    connection.execute(
        "UPDATE analysis_runs SET result_json=json_set(result_json, "
        "'$.scenario_snapshot.conditions.electricity_price_krw_per_kwh', "
        "COALESCE(json_extract(result_json, "
        "'$.scenario_snapshot.conditions.electricity_price_krw_per_kwh'), 160), "
        "'$.scenario_snapshot.conditions.carbon_intensity_kg_co2e_per_kwh', "
        "COALESCE(json_extract(result_json, "
        "'$.scenario_snapshot.conditions.carbon_intensity_kg_co2e_per_kwh'), 0.45)) "
        "WHERE analysis_scenario_id IS NOT NULL"
    )
    connection.execute(
        "CREATE TRIGGER analysis_runs_no_update BEFORE UPDATE ON analysis_runs "
        "BEGIN SELECT RAISE(ABORT, 'analysis runs are immutable'); END"
    )


def create_schema(connection: sqlite3.Connection) -> None:
    previous_version = connection.execute("PRAGMA user_version").fetchone()[0]
    connection.executescript(SCHEMA_SQL)
    columns = {row[1] for row in connection.execute("PRAGMA table_info(analysis_runs)")}
    if "analysis_scenario_id" not in columns:
        connection.execute("ALTER TABLE analysis_runs ADD COLUMN analysis_scenario_id TEXT")
    _migrate_analysis_scenarios(connection)
    if previous_version < 4:
        _migrate_analysis_cost_conditions(connection)
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_analysis_scenarios_building_updated "
        "ON analysis_scenarios(building_id, updated_at, id)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_analysis_runs_scenario_created "
        "ON analysis_runs(analysis_scenario_id, created_at DESC, id DESC)"
    )
    connection.execute("PRAGMA user_version = 4")
