"""Built-in sqlite3 database and repositories for campus energy scenarios."""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import (
    AnalysisRun,
    AnalysisScenario,
    InstallationPlan,
    PanelArray,
    RepresentativePlan,
    Scenario,
    ScenarioInterval,
)
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


class RepresentativePlanConflict(RuntimeError):
    pass


class AnalysisScenarioPlanConflict(RuntimeError):
    pass


class InstallationPlanBuildingMismatch(ValueError):
    pass


class AnalysisScenarioBuildingMismatch(ValueError):
    pass


class ScenarioBuildingMismatch(ValueError):
    pass


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
                current = connection.execute(
                    "SELECT building_id FROM scenarios WHERE id = ?", (scenario.id,),
                ).fetchone()
                if current is not None and current["building_id"] != scenario.building_id:
                    raise ScenarioBuildingMismatch(scenario.id)
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
                if connection.execute(
                    "SELECT 1 FROM building_representative_plans WHERE installation_plan_id=?",
                    (scenario_id,),
                ).fetchone() is not None:
                    raise RepresentativePlanConflict(scenario_id)
                if connection.execute(
                    "SELECT 1 FROM analysis_scenarios WHERE representative_plan_id=? "
                    "OR alternative_plan_id=?",
                    (scenario_id, scenario_id),
                ).fetchone() is not None:
                    raise AnalysisScenarioPlanConflict(scenario_id)
                result = connection.execute("DELETE FROM scenarios WHERE id = ?", (scenario_id,))
                return result.rowcount > 0


class InstallationPlanRepository:
    """Typed installation-plan boundary backed by lossless legacy scenario rows."""

    def __init__(self, database: Database) -> None:
        self.database = database

    def get(self, installation_plan_id: str) -> InstallationPlan | None:
        with closing(self.database.connect()) as connection:
            row = connection.execute(
                "SELECT id, building_id, name, created_at, updated_at "
                "FROM installation_plans WHERE id=?", (installation_plan_id,),
            ).fetchone()
            if row is None:
                return None
            arrays = tuple(PanelArray(**dict(item)) for item in connection.execute(
                f"SELECT {_ARRAY_COLUMNS} FROM panel_arrays WHERE scenario_id=? ORDER BY id",
                (installation_plan_id,),
            ))
        return InstallationPlan(**dict(row), arrays=arrays)

    def list_for_building(self, building_id: str) -> tuple[InstallationPlan, ...]:
        with closing(self.database.connect()) as connection:
            ids = tuple(row[0] for row in connection.execute(
                "SELECT id FROM installation_plans WHERE building_id=? ORDER BY id", (building_id,),
            ))
        return tuple(item for item_id in ids if (item := self.get(item_id)) is not None)

    def save(self, plan: InstallationPlan) -> None:
        arrays_sql = f"INSERT INTO panel_arrays ({_ARRAY_COLUMNS}) VALUES ({','.join('?' * 17)})"
        with closing(self.database.connect()) as connection:
            with connection:
                current = connection.execute(
                    "SELECT building_id FROM scenarios WHERE id=?", (plan.id,),
                ).fetchone()
                if current is not None and current["building_id"] != plan.building_id:
                    raise InstallationPlanBuildingMismatch(plan.id)
                connection.execute(
                    "INSERT INTO scenarios (id, building_id, name, weather_preset, created_at, updated_at) "
                    "VALUES (?,?,?,'clear',?,?) ON CONFLICT(id) DO UPDATE SET "
                    "name=excluded.name, updated_at=excluded.updated_at",
                    (plan.id, plan.building_id, plan.name, plan.created_at, plan.updated_at),
                )
                connection.execute("DELETE FROM panel_arrays WHERE scenario_id=?", (plan.id,))
                connection.executemany(arrays_sql, (
                    (item.id, item.scenario_id, item.roof_id, item.roof_zone_id,
                     item.module_id, item.origin_x_m, item.origin_y_m, item.rows,
                     item.columns, item.azimuth_deg, item.tilt_deg, item.orientation,
                     item.module_width_m, item.module_length_m,
                     item.module_efficiency_percent, item.module_nominal_power_wp,
                     item.inter_panel_gap_m)
                    for item in plan.arrays
                ))

    def delete(self, installation_plan_id: str) -> bool:
        return ScenarioRepository(self.database).delete(installation_plan_id)


class RepresentativePlanRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def get(self, building_id: str) -> RepresentativePlan | None:
        with closing(self.database.connect()) as connection:
            row = connection.execute(
                "SELECT building_id, installation_plan_id, selected_at "
                "FROM building_representative_plans WHERE building_id=?", (building_id,),
            ).fetchone()
        return RepresentativePlan(**dict(row)) if row is not None else None

    def set(self, building_id: str, installation_plan_id: str, selected_at: str) -> RepresentativePlan:
        representative = RepresentativePlan(building_id, installation_plan_id, selected_at)
        with closing(self.database.connect()) as connection:
            with connection:
                plan = connection.execute(
                    "SELECT building_id FROM installation_plans WHERE id=?", (installation_plan_id,),
                ).fetchone()
                if plan is None:
                    raise LookupError(installation_plan_id)
                if plan["building_id"] != building_id:
                    raise InstallationPlanBuildingMismatch(installation_plan_id)
                connection.execute(
                    "INSERT INTO building_representative_plans "
                    "(building_id, installation_plan_id, selected_at) VALUES (?,?,?) "
                    "ON CONFLICT(building_id) DO UPDATE SET "
                    "installation_plan_id=excluded.installation_plan_id, selected_at=excluded.selected_at",
                    (building_id, installation_plan_id, selected_at),
                )
        return representative

    def unset(self, building_id: str) -> bool:
        with closing(self.database.connect()) as connection:
            with connection:
                result = connection.execute(
                    "DELETE FROM building_representative_plans WHERE building_id=?", (building_id,),
                )
                return result.rowcount > 0

    def list_all(self) -> tuple[RepresentativePlan, ...]:
        with closing(self.database.connect()) as connection:
            rows = tuple(connection.execute(
                "SELECT building_id, installation_plan_id, selected_at "
                "FROM building_representative_plans ORDER BY building_id"
            ))
        return tuple(RepresentativePlan(**dict(row)) for row in rows)


class AnalysisScenarioRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    @staticmethod
    def _json(value: dict[str, Any]) -> str:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    @staticmethod
    def _from_row(row: sqlite3.Row) -> AnalysisScenario:
        return AnalysisScenario(
            id=row["id"], building_id=row["building_id"], name=row["name"],
            representative_plan_id=row["representative_plan_id"],
            alternative_plan_id=row["alternative_plan_id"], baseline=row["baseline"],
            conditions=json.loads(row["conditions_json"]), created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def get(self, scenario_id: str) -> AnalysisScenario | None:
        with closing(self.database.connect()) as connection:
            row = connection.execute(
                "SELECT * FROM analysis_scenarios WHERE id=?", (scenario_id,),
            ).fetchone()
        return self._from_row(row) if row is not None else None

    def list_for_building(self, building_id: str) -> tuple[AnalysisScenario, ...]:
        with closing(self.database.connect()) as connection:
            rows = tuple(connection.execute(
                "SELECT * FROM analysis_scenarios WHERE building_id=? "
                "ORDER BY updated_at DESC, id DESC", (building_id,),
            ))
        return tuple(self._from_row(row) for row in rows)

    def save(self, scenario: AnalysisScenario) -> None:
        plan_ids = tuple(filter(None, (
            scenario.representative_plan_id, scenario.alternative_plan_id,
        )))
        with closing(self.database.connect()) as connection:
            with connection:
                current = connection.execute(
                    "SELECT building_id FROM analysis_scenarios WHERE id=?", (scenario.id,),
                ).fetchone()
                if current is not None and current["building_id"] != scenario.building_id:
                    raise AnalysisScenarioBuildingMismatch(scenario.id)
                rows = tuple(connection.execute(
                    f"SELECT id, building_id FROM installation_plans WHERE id IN "
                    f"({','.join('?' for _ in plan_ids)})", plan_ids,
                ))
                if len(rows) != len(plan_ids):
                    found = {row["id"] for row in rows}
                    raise LookupError(next(item for item in plan_ids if item not in found))
                if any(row["building_id"] != scenario.building_id for row in rows):
                    raise InstallationPlanBuildingMismatch(scenario.building_id)
                connection.execute(
                    "INSERT INTO analysis_scenarios VALUES (?,?,?,?,?,?,?,?,?) "
                    "ON CONFLICT(id) DO UPDATE SET "
                    "name=excluded.name, representative_plan_id=excluded.representative_plan_id, "
                    "alternative_plan_id=excluded.alternative_plan_id, baseline=excluded.baseline, "
                    "conditions_json=excluded.conditions_json, updated_at=excluded.updated_at",
                    (scenario.id, scenario.building_id, scenario.name,
                     scenario.representative_plan_id, scenario.alternative_plan_id,
                     scenario.baseline, self._json(scenario.conditions), scenario.created_at,
                     scenario.updated_at),
                )

    def delete(self, scenario_id: str) -> bool:
        with closing(self.database.connect()) as connection:
            with connection:
                result = connection.execute(
                    "DELETE FROM analysis_scenarios WHERE id=?", (scenario_id,),
                )
                return result.rowcount > 0


class AnalysisRunRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    @staticmethod
    def _json(value: dict[str, Any]) -> str:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    def create(self, *, run_id: str, building_id: str, installation_plan_id: str,
               created_at: str, plan_snapshot: dict[str, Any], conditions: dict[str, Any],
               result: dict[str, Any]) -> AnalysisRun:
        run = AnalysisRun(run_id, building_id, installation_plan_id, created_at,
                          plan_snapshot, conditions, result)
        with closing(self.database.connect()) as connection:
            with connection:
                connection.execute(
                    "INSERT INTO analysis_runs "
                    "(id, building_id, installation_plan_id, created_at, plan_snapshot_json, "
                    "conditions_json, result_json, analysis_scenario_id) VALUES (?,?,?,?,?,?,?,?)",
                    (run.id, run.building_id, run.installation_plan_id, run.created_at,
                     self._json(run.plan_snapshot), self._json(run.conditions),
                     self._json(run.result), run.analysis_scenario_id),
                )
        stored = self.get(run.id)
        if stored is None:  # pragma: no cover - insertion and lookup share one committed database
            raise RuntimeError(f"analysis run '{run.id}' was not persisted")
        return stored

    def get(self, run_id: str) -> AnalysisRun | None:
        with closing(self.database.connect()) as connection:
            row = connection.execute(
                "SELECT id, building_id, installation_plan_id, created_at, plan_snapshot_json, "
                "conditions_json, result_json, analysis_scenario_id "
                "FROM analysis_runs WHERE id=?", (run_id,),
            ).fetchone()
        if row is None:
            return None
        return AnalysisRun(
            id=row["id"], building_id=row["building_id"],
            installation_plan_id=row["installation_plan_id"], created_at=row["created_at"],
            plan_snapshot=json.loads(row["plan_snapshot_json"]),
            conditions=json.loads(row["conditions_json"]), result=json.loads(row["result_json"]),
            analysis_scenario_id=row["analysis_scenario_id"],
        )

    def create_snapshot(self, *, run_id: str, scenario: AnalysisScenario, created_at: str,
                        plan_snapshots: dict[str, Any], payload: dict[str, Any]) -> AnalysisRun:
        run = AnalysisRun(
            id=run_id, building_id=scenario.building_id,
            installation_plan_id=scenario.representative_plan_id, created_at=created_at,
            plan_snapshot=plan_snapshots, conditions=scenario.conditions, result=payload,
            analysis_scenario_id=scenario.id,
        )
        with closing(self.database.connect()) as connection:
            with connection:
                connection.execute(
                    "INSERT INTO analysis_runs "
                    "(id, building_id, installation_plan_id, created_at, plan_snapshot_json, "
                    "conditions_json, result_json, analysis_scenario_id) VALUES (?,?,?,?,?,?,?,?)",
                    (run.id, run.building_id, run.installation_plan_id, run.created_at,
                     self._json(run.plan_snapshot), self._json(run.conditions),
                     self._json(run.result), run.analysis_scenario_id),
                )
        return run

    def list_for_scenario(self, scenario_id: str) -> tuple[AnalysisRun, ...]:
        with closing(self.database.connect()) as connection:
            ids = tuple(row[0] for row in connection.execute(
                "SELECT id FROM analysis_runs WHERE analysis_scenario_id=? "
                "ORDER BY created_at DESC, id DESC", (scenario_id,),
            ))
        return tuple(item for item_id in ids if (item := self.get(item_id)) is not None)

    def list_for_building(self, building_id: str) -> tuple[AnalysisRun, ...]:
        with closing(self.database.connect()) as connection:
            ids = tuple(row[0] for row in connection.execute(
                "SELECT id FROM analysis_runs WHERE building_id=? "
                "ORDER BY created_at DESC, id DESC",
                (building_id,),
            ))
        return tuple(item for item_id in ids if (item := self.get(item_id)) is not None)
