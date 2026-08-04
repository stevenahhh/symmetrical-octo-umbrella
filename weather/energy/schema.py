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
"""


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(SCHEMA_SQL)
