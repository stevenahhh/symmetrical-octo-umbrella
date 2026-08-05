"""Deterministic campus solar ranking data access and scoring."""
from __future__ import annotations

import json
from contextlib import closing
from dataclasses import dataclass, replace
from datetime import date
from typing import Any

from .geometry_service import validate_geometry
from .models import Scenario
from .persistence import (
    BuildingSummary,
    CampusRepository,
    Database,
    InstallationPlanRepository,
    RepresentativePlanRepository,
    ScenarioRepository,
)
from .simulation_service import calculate_simulation

RANKING_WEIGHTS = {
    "annualized_yield": 0.3,
    "roof_utilization": 0.2,
    "self_sufficiency": 0.2,
    "grid_reduction": 0.2,
    "constraints": 0.1,
}
ANNUALIZED_YIELD_REFERENCE = 1800.0


@dataclass(frozen=True)
class RankingRequest:
    date: date
    weather_preset: str


@dataclass(frozen=True)
class RankingResult:
    date: date
    weather_preset: str
    assumptions: dict[str, Any]
    rankings: tuple[dict[str, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "date": self.date,
            "weather_preset": self.weather_preset,
            "assumptions": self.assumptions,
            "rankings": list(self.rankings),
        }


def _polygon_area(points: list[dict[str, float]]) -> float:
    return abs(sum(
        points[index]["xMeters"] * points[(index + 1) % len(points)]["yMeters"]
        - points[(index + 1) % len(points)]["xMeters"] * points[index]["yMeters"]
        for index in range(len(points))
    )) / 2


def _entry(building: BuildingSummary, scenario=None, *, reason=None,
           building_status: str = "incomplete") -> dict[str, Any]:
    return {
        "scenario_id": scenario.id if scenario else None,
        "building_id": building.id,
        "building_name": building.display_name,
        "building_status": building_status,
        "status": "excluded",
        "rank": None,
        "score": None,
        "score_unit": "normalized-weighted-score",
        "total_generation_energy_kwh": None,
        "capacity_kwp": None,
        "exclusion_reason": reason,
        "demand_quality": "predicted",
        "weather_source": "scenario",
        "component_scores": None,
        "metrics": None,
    }


def rank_campus(
    database: Database,
    request: RankingRequest,
    *,
    representative_only: bool = False,
) -> RankingResult:
    """Rank comparable persisted scenarios and explain every exclusion."""
    campus = CampusRepository(database)
    repository = ScenarioRepository(database)
    plan_repository = InstallationPlanRepository(database)
    representative_repository = RepresentativePlanRepository(database)
    buildings = campus.list_buildings()
    ranked: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    with closing(database.connect()) as connection:
        roof_areas = {
            building.id: sum(_polygon_area(json.loads(row[0])) for row in connection.execute(
                "SELECT polygon_json FROM roof_zones WHERE building_id=?", (building.id,),
            )) for building in buildings
        }

    for building in buildings:
        if representative_only:
            representative = representative_repository.get(building.id)
            if representative is None:
                excluded.append(_entry(
                    building,
                    reason="no_representative_plan",
                    building_status="no_scenario",
                ))
                continue
            plan = plan_repository.get(representative.installation_plan_id)
            if plan is None:
                excluded.append(_entry(
                    building,
                    reason="no_representative_plan",
                    building_status="no_scenario",
                ))
                continue
            candidate = Scenario(
                id=plan.id,
                building_id=plan.building_id,
                name=plan.name,
                weather_preset=request.weather_preset,
                created_at=plan.created_at,
                updated_at=plan.updated_at,
                arrays=plan.arrays,
                intervals=(),
            )
            intervals, _ = calculate_simulation(
                database,
                candidate,
                request.date,
                request.weather_preset,
            )
            scenarios = (replace(candidate, intervals=intervals),)
        else:
            scenarios = repository.list_for_building(building.id)
        if not roof_areas[building.id]:
            excluded.append(_entry(building, reason="missing_roof_metadata"))
            continue
        if not scenarios:
            excluded.append(_entry(building, reason="no_scenario", building_status="no_scenario"))
            continue
        for scenario in scenarios:
            entry = _entry(building, scenario)
            capacity = sum(item.rows * item.columns * item.module_nominal_power_wp / 1000
                           for item in scenario.arrays)
            entry["capacity_kwp"] = capacity or None
            if scenario.weather_preset != request.weather_preset:
                entry["exclusion_reason"] = "weather_preset_mismatch"
                excluded.append(entry)
                continue
            complete = len(scenario.intervals) == 96 and all(
                item.timestamp[:10] == request.date.isoformat() for item in scenario.intervals)
            if not scenario.arrays or not complete:
                entry["exclusion_reason"] = "simulation_incomplete_for_date"
                excluded.append(entry)
                continue

            violations = validate_geometry(database, building.id, scenario.arrays)
            generation = sum(item.generation_energy_kwh for item in scenario.intervals)
            demand_energy = sum(item.predicted_demand_energy_kwh for item in scenario.intervals)
            direct = sum(min(item.generation_energy_kwh, item.predicted_demand_energy_kwh)
                         for item in scenario.intervals)
            panel_area = sum(item.rows * item.columns * item.module_width_m * item.module_length_m
                             for item in scenario.arrays)
            annualized = generation / capacity * 365
            utilization = min(panel_area / roof_areas[building.id], 1)
            self_sufficiency = direct / demand_energy if demand_energy else 0
            metrics = {
                "annualized_kwh_per_kwp": annualized,
                "roof_utilization_ratio": utilization,
                "self_sufficiency_ratio": self_sufficiency,
                "grid_reduction_ratio": self_sufficiency,
                "constraint_violation_count": len(violations),
            }
            components = {
                "annualized_yield": min(annualized / ANNUALIZED_YIELD_REFERENCE, 1),
                "roof_utilization": utilization,
                "self_sufficiency": self_sufficiency,
                "grid_reduction": self_sufficiency,
                "constraints": 1.0 if not violations else 0.0,
            }
            score = sum(components[key] * weight for key, weight in RANKING_WEIGHTS.items())
            entry.update({
                "building_status": "simulated",
                "status": "ranked",
                "score": score,
                "total_generation_energy_kwh": generation,
                "exclusion_reason": None,
                "component_scores": components,
                "metrics": metrics,
            })
            ranked.append(entry)

    ranked.sort(key=lambda item: (-item["score"], item["scenario_id"]))
    for index, item in enumerate(ranked, 1):
        item["rank"] = index
    excluded.sort(key=lambda item: (item["building_id"], item["scenario_id"] or ""))
    return RankingResult(
        date=request.date,
        weather_preset=request.weather_preset,
        assumptions={
            "annualization_days": 365,
            "annualized_yield_reference_kwh_per_kwp": ANNUALIZED_YIELD_REFERENCE,
            "weights": RANKING_WEIGHTS,
            "demand_quality": "predicted",
            "weather_source": "scenario",
            "comparability": "same date and deterministic weather preset only",
        },
        rankings=tuple(ranked + excluded),
    )
