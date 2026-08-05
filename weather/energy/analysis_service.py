"""Immutable single-building analysis execution over editable installation plans."""
from __future__ import annotations

from datetime import date
from typing import Any

from .models import (
    DEFAULT_CARBON_INTENSITY_KG_CO2E_PER_KWH,
    DEFAULT_ELECTRICITY_PRICE_KRW_PER_KWH,
    AnalysisRun,
    AnalysisScenario,
    InstallationPlan,
    Scenario,
)
from .persistence import (
    AnalysisRunRepository,
    CampusRepository,
    Database,
    InstallationPlanRepository,
    RepresentativePlanRepository,
)
from .simulation_service import calculate_simulation


def _array_snapshot(item) -> dict[str, Any]:
    value = item.to_dict()
    value["installation_plan_id"] = value.pop("scenario_id")
    return value


def _plan_snapshot(plan: InstallationPlan) -> dict[str, Any]:
    return {
        "id": plan.id, "building_id": plan.building_id, "name": plan.name,
        "created_at": plan.created_at, "updated_at": plan.updated_at,
        "arrays": [_array_snapshot(item) for item in plan.arrays],
    }


def _calculate_plan(database: Database, plan: InstallationPlan, day: date,
                    weather_preset: str) -> dict[str, Any]:
    source = Scenario(
        id=plan.id, building_id=plan.building_id, name=plan.name,
        weather_preset=weather_preset, created_at=plan.created_at,
        updated_at=plan.updated_at, arrays=plan.arrays, intervals=(),
    )
    _, result = calculate_simulation(database, source, day, weather_preset)
    result["date"] = day.isoformat()
    return result


def execute_analysis_scenario_run(
    database: Database,
    scenario: AnalysisScenario,
    day: date,
    *,
    run_id: str,
    created_at: str,
) -> AnalysisRun:
    """Run an editable definition and persist one self-contained immutable snapshot."""
    plans = InstallationPlanRepository(database)
    representative = plans.get(scenario.representative_plan_id)
    if representative is None:
        raise LookupError(scenario.representative_plan_id)
    alternative = plans.get(scenario.alternative_plan_id) if scenario.alternative_plan_id else None
    weather_preset = scenario.conditions["weather_preset"]
    proposed = _calculate_plan(database, representative, day, weather_preset)
    alternative_result = (
        _calculate_plan(database, alternative, day, weather_preset) if alternative else None
    )
    demand_total = proposed["totals"]["demand_energy_kwh"]
    baseline = {
        "demand_energy_kwh": demand_total, "generation_energy_kwh": 0.0,
        "grid_draw_energy_kwh": demand_total, "self_consumption_energy_kwh": 0.0,
        "surplus_energy_kwh": 0.0,
    }
    intervals = []
    for index, proposed_slot in enumerate(proposed["intervals"]):
        intervals.append({
            "timestamp": proposed_slot["timestamp"],
            "predicted_demand_energy_kwh": proposed_slot["predicted_demand_energy_kwh"],
            "global_irradiance_w_m2": proposed_slot["global_irradiance_w_m2"],
            "baseline_generation_energy_kwh": 0.0,
            "proposed_generation_energy_kwh": proposed_slot["generation_energy_kwh"],
            "alternative_generation_energy_kwh": (
                alternative_result["intervals"][index]["generation_energy_kwh"]
                if alternative_result else None
            ),
        })

    campus_representatives = []
    campus = CampusRepository(database)
    for selection in RepresentativePlanRepository(database).list_all():
        plan = plans.get(selection.installation_plan_id)
        building = campus.get_building(selection.building_id)
        if plan is None or building is None:
            continue
        result = proposed if plan.id == representative.id else _calculate_plan(
            database, plan, day, weather_preset,
        )
        campus_representatives.append({
            "building_id": building.id, "building_name": building.display_name,
            "installation_plan_id": plan.id,
            "generation_energy_kwh": result["totals"]["generation_energy_kwh"],
            "demand_energy_kwh": result["totals"]["demand_energy_kwh"],
        })

    plan_snapshots = {
        "representative": _plan_snapshot(representative),
        "alternative": _plan_snapshot(alternative) if alternative else None,
    }
    payload = {
        "id": run_id, "analysis_scenario_id": scenario.id,
        "building_id": scenario.building_id, "created_at": created_at,
        "date": day.isoformat(), "scenario_snapshot": scenario.to_dict(),
        "plan_snapshots": plan_snapshots, "intervals": intervals,
        "totals": {
            "baseline": baseline, "proposed": proposed["totals"],
            "alternative": alternative_result["totals"] if alternative_result else None,
        },
        "campus_representatives": campus_representatives,
    }
    return AnalysisRunRepository(database).create_snapshot(
        run_id=run_id, scenario=scenario, created_at=created_at,
        plan_snapshots=plan_snapshots, payload=payload,
    )


def execute_analysis_run(
    database: Database,
    plan: InstallationPlan,
    day: date,
    weather_preset: str,
    *,
    run_id: str,
    created_at: str,
) -> AnalysisRun:
    """Calculate and atomically persist a complete append-only snapshot."""
    calculation_input = Scenario(
        id=plan.id,
        building_id=plan.building_id,
        name=plan.name,
        weather_preset=weather_preset,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        arrays=plan.arrays,
        intervals=(),
    )
    _, result = calculate_simulation(database, calculation_input, day, weather_preset)
    result["date"] = day.isoformat()
    plan_snapshot = _plan_snapshot(plan)
    conditions = {
        "date": day.isoformat(),
        "weather_preset": weather_preset,
        "timezone": "Asia/Seoul",
        "interval_minutes": 15,
        "generation_model": "deterministic-python-v1",
        "electricity_price_krw_per_kwh": DEFAULT_ELECTRICITY_PRICE_KRW_PER_KWH,
        "carbon_intensity_kg_co2e_per_kwh": DEFAULT_CARBON_INTENSITY_KG_CO2E_PER_KWH,
    }
    return AnalysisRunRepository(database).create(
        run_id=run_id,
        building_id=plan.building_id,
        installation_plan_id=plan.id,
        created_at=created_at,
        plan_snapshot=plan_snapshot,
        conditions=conditions,
        result=result,
    )
