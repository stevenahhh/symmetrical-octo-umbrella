"""Deterministic PV, energy-balance, and recommendation services."""
from __future__ import annotations
import math
from dataclasses import replace
from datetime import date, datetime
from .demand_service import building_demand
from .models import PanelArray, Scenario, ScenarioInterval
from .persistence import Database, ScenarioRepository
from .weather_scenarios import build_preset_series

def simulate(database: Database, scenario: Scenario, day: date) -> tuple[Scenario, dict]:
    demand = building_demand(database, scenario.building_id, day)
    if demand is None:
        raise LookupError(scenario.building_id)
    weather = build_preset_series(day, scenario.weather_preset)
    array_results = []
    generation_by_slot = [0.0] * 96
    for array in scenario.arrays:
        capacity = array.rows * array.columns * array.module_nominal_power_wp / 1000
        slots = []
        for index, weather_slot in enumerate(weather.intervals):
            hour = index / 4
            sun_azimuth = 180 + (hour - 12) * 15
            altitude = math.radians(max(weather_slot.solar_altitude_deg, 0))
            tilt = math.radians(array.tilt_deg)
            incidence = max(0.0, min(1.0, math.sin(altitude) * math.cos(tilt) + math.cos(altitude) * math.sin(tilt) * math.cos(math.radians(sun_azimuth - array.azimuth_deg))))
            cell_temp = weather_slot.ambient_temperature_c + weather_slot.global_irradiance_w_m2 * incidence * 25 / 800
            temp_factor = max(0.0, min(1.0, 1 - 0.004 * max(cell_temp - 25, 0)))
            energy = capacity * weather_slot.global_irradiance_w_m2 / 1000 / 4 * incidence * temp_factor * 0.9
            generation_by_slot[index] += energy
            slots.append({
                "timestamp": weather_slot.timestamp,
                "generation_energy_kwh": energy,
                "plane_of_array_factor": incidence,
                "temperature_factor": temp_factor,
                "system_factor": 0.9,
            })
        array_results.append({
            "array_id": array.id, "module_count": array.rows * array.columns,
            "capacity_kwp": capacity, "intervals": slots,
            "total_generation_energy_kwh": sum(item["generation_energy_kwh"] for item in slots),
        })
    intervals = []
    persisted = []
    for index, (demand_slot, weather_slot) in enumerate(zip(demand["intervals"], weather.intervals)):
        generation = generation_by_slot[index]
        demand_energy = demand_slot["predicted_demand_energy_kwh"]
        consumed = min(generation, demand_energy)
        intervals.append({
            "timestamp": weather_slot.timestamp, "predicted_demand_energy_kwh": demand_energy,
            "generation_energy_kwh": generation,
            "global_irradiance_w_m2": weather_slot.global_irradiance_w_m2,
            "self_consumption_energy_kwh": consumed,
            "grid_draw_energy_kwh": max(demand_energy - generation, 0),
            "surplus_energy_kwh": max(generation - demand_energy, 0),
        })
        persisted.append(ScenarioInterval(
            timestamp=weather_slot.timestamp, ambient_temperature_c=weather_slot.ambient_temperature_c,
            global_irradiance_w_m2=weather_slot.global_irradiance_w_m2,
            predicted_demand_kw=demand_slot["predicted_demand_kw"],
            predicted_demand_energy_kwh=demand_energy, generation_energy_kwh=generation,
            weather_source="scenario", demand_quality="predicted"))
    updated = replace(scenario, updated_at=datetime.now().astimezone().isoformat(), intervals=tuple(persisted))
    ScenarioRepository(database).save(updated)
    mapping = {
        "demand_energy_kwh": "predicted_demand_energy_kwh",
        "generation_energy_kwh": "generation_energy_kwh",
        "self_consumption_energy_kwh": "self_consumption_energy_kwh",
        "grid_draw_energy_kwh": "grid_draw_energy_kwh",
        "surplus_energy_kwh": "surplus_energy_kwh",
    }
    totals = {output: sum(item[source] for item in intervals) for output, source in mapping.items()}
    return updated, {
        "scenario_id": scenario.id, "date": day, "interval_minutes": 15,
        "demand_quality": "predicted", "weather_source": "scenario",
        "generation_assumption": {"type": "simulation-assumption",
            "calibration": "not-engineering-calibrated", "model": "deterministic-python-v1",
            "system_loss_fraction": 0.1},
        "intervals": intervals, "arrays": array_results, "totals": totals,
    }

def recommendation_candidates(source: Scenario, suggested_id: str, database: Database):
    from .geometry_service import validate_geometry
    template = source.arrays[0]
    options = []
    scores = []
    for columns in (12, 8, 4):
        for tilt in (25.0, 15.0, 35.0):
            candidate = replace(template, id=f"{suggested_id}-array-1", scenario_id=suggested_id,
                                origin_x_m=15.5, origin_y_m=10.0, rows=2, columns=columns,
                                azimuth_deg=180.0, tilt_deg=tilt, orientation="portrait")
            valid = not validate_geometry(database, source.building_id, (candidate,))
            score = float(columns * 200 - abs(tilt - 25))
            scores.append({"candidate_id": f"2x{columns}-{int(tilt)}", "module_count": columns * 2,
                           "azimuth_deg": 180.0, "tilt_deg": tilt, "orientation": "portrait",
                           "score": score, "valid": valid})
            if valid:
                options.append((score, candidate))
    return (max(options, key=lambda item: item[0])[1],), scores
