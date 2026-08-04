"""Built-in sqlite3 database and repositories for campus energy scenarios."""

from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from .models import PanelArray, Scenario, ScenarioInterval
from .schema import create_schema
from .seed import CAMPUS_BUILDINGS, seed_buildings

_ARRAY_COLUMNS = (
    "id, scenario_id, roof_id, roof_zone_id, module_id, origin_x_m, origin_y_m, "
    "rows, columns, azimuth_deg, tilt_deg, orientation, module_width_m, "
    "module_length_m, module_efficiency_percent, module_nominal_power_wp, inter_panel_gap_m"
)
_INTERVAL_COLUMNS = (
    "timestamp, ambient_temperature_c, global_irradiance_w_m2, predicted_demand_kw, "
    "predicted_demand_energy_kwh, generation_energy_kwh, weather_source, demand_quality"
)


class Database:
    """Owns connection policy; every connection enforces foreign keys."""

    def __init__(self, path: str | os.PathLike[str], timeout_seconds: float = 0.1) -> None:
        if not isinstance(timeout_seconds, (int, float)) or isinstance(timeout_seconds, bool):
            raise ValueError("timeout_seconds must be numeric")
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        self.path = Path(path)
        self.timeout_seconds = float(timeout_seconds)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=self.timeout_seconds)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {int(self.timeout_seconds * 1000)}")
        return connection

    def initialize(self) -> None:
        with closing(self.connect()) as connection:
            with connection:
                create_schema(connection)
                seed_buildings(connection, CAMPUS_BUILDINGS)


@dataclass(frozen=True)
class BuildingSummary:
    id: str
    display_name: str
    timezone: str
    demand_quality: str
    room_count: int
    roof_zone_count: int


class CampusRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def list_buildings(self) -> tuple[BuildingSummary, ...]:
        sql = """
            SELECT b.id, b.display_name, b.timezone, b.demand_quality,
                   count(DISTINCT r.id) AS room_count,
                   count(DISTINCT z.id) AS roof_zone_count
            FROM buildings b
            LEFT JOIN rooms r ON r.building_id = b.id
            LEFT JOIN roof_zones z ON z.building_id = b.id
            GROUP BY b.id ORDER BY b.id
        """
        with closing(self.database.connect()) as connection:
            return tuple(BuildingSummary(**dict(row)) for row in connection.execute(sql))

    def get_building(self, building_id: str) -> BuildingSummary | None:
        return next((item for item in self.list_buildings() if item.id == building_id), None)


class ScenarioRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def save(self, scenario: Scenario) -> None:
        arrays_sql = f"INSERT INTO panel_arrays ({_ARRAY_COLUMNS}) VALUES ({','.join('?' * 17)})"
        intervals_sql = (
            "INSERT INTO scenario_intervals (scenario_id, " + _INTERVAL_COLUMNS + ") "
            f"VALUES ({','.join('?' * 9)})"
        )
        with closing(self.database.connect()) as connection:
            with connection:
                connection.execute(
                    "INSERT INTO scenarios VALUES (?,?,?,?,?,?) "
                    "ON CONFLICT(id) DO UPDATE SET building_id=excluded.building_id, "
                    "name=excluded.name, weather_preset=excluded.weather_preset, "
                    "created_at=excluded.created_at, updated_at=excluded.updated_at",
                    (scenario.id, scenario.building_id, scenario.name,
                     scenario.weather_preset, scenario.created_at, scenario.updated_at),
                )
                connection.execute("DELETE FROM panel_arrays WHERE scenario_id = ?", (scenario.id,))
                connection.execute("DELETE FROM scenario_intervals WHERE scenario_id = ?", (scenario.id,))
                connection.executemany(arrays_sql, (
                    (item.id, item.scenario_id, item.roof_id, item.roof_zone_id,
                     item.module_id, item.origin_x_m, item.origin_y_m, item.rows,
                     item.columns, item.azimuth_deg, item.tilt_deg, item.orientation,
                     item.module_width_m, item.module_length_m,
                     item.module_efficiency_percent, item.module_nominal_power_wp,
                     item.inter_panel_gap_m)
                    for item in scenario.arrays
                ))
                connection.executemany(intervals_sql, (
                    (scenario.id, item.timestamp, item.ambient_temperature_c,
                     item.global_irradiance_w_m2, item.predicted_demand_kw,
                     item.predicted_demand_energy_kwh, item.generation_energy_kwh,
                     item.weather_source, item.demand_quality)
                    for item in scenario.intervals
                ))

    def get(self, scenario_id: str) -> Scenario | None:
        with closing(self.database.connect()) as connection:
            row = connection.execute(
                "SELECT id, building_id, name, weather_preset, created_at, updated_at "
                "FROM scenarios WHERE id = ?", (scenario_id,),
            ).fetchone()
            if row is None:
                return None
            arrays = tuple(PanelArray(**dict(item)) for item in connection.execute(
                f"SELECT {_ARRAY_COLUMNS} FROM panel_arrays WHERE scenario_id = ? ORDER BY id",
                (scenario_id,),
            ))
            intervals = tuple(ScenarioInterval(**dict(item)) for item in connection.execute(
                f"SELECT {_INTERVAL_COLUMNS} FROM scenario_intervals "
                "WHERE scenario_id = ? ORDER BY timestamp", (scenario_id,),
            ))
        return Scenario(**dict(row), arrays=arrays, intervals=intervals)

    def list_for_building(self, building_id: str) -> tuple[Scenario, ...]:
        with closing(self.database.connect()) as connection:
            ids = tuple(row[0] for row in connection.execute(
                "SELECT id FROM scenarios WHERE building_id = ? ORDER BY id", (building_id,),
            ))
        return tuple(item for scenario_id in ids if (item := self.get(scenario_id)) is not None)

    def delete(self, scenario_id: str) -> bool:
        with closing(self.database.connect()) as connection:
            with connection:
                result = connection.execute("DELETE FROM scenarios WHERE id = ?", (scenario_id,))
                return result.rowcount > 0
