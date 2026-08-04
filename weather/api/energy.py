"""Typed FastAPI routes for campus energy scenarios."""
from __future__ import annotations
import os
import sqlite3
import threading
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

try:
    from weather.energy.api_models import (BuildingDetailOut, BuildingOut, DateRequest, DemandOut,
        RankingsOut, RecommendationOut, ScenarioCreate, ScenarioOut, ScenarioSummaryOut,
        SimulationOut, WeatherPresetOut)
    from weather.energy.demand_service import building_demand
    from weather.energy.geometry_service import validate_geometry
    from weather.energy.models import PanelArray, Scenario
    from weather.energy.persistence import CampusRepository, Database, ScenarioRepository
    from weather.energy.ranking_service import RankingRequest, rank_campus
    from weather.energy.roof_service import building_roofs
    from weather.energy.simulation_service import recommendation_candidates, simulate
    from weather.energy.weather_scenarios import PRESET_NAMES, build_preset_series
except ModuleNotFoundError:
    from energy.api_models import (BuildingDetailOut, BuildingOut, DateRequest, DemandOut, RankingsOut,
        RecommendationOut, ScenarioCreate, ScenarioOut, ScenarioSummaryOut, SimulationOut, WeatherPresetOut)
    from energy.demand_service import building_demand
    from energy.geometry_service import validate_geometry
    from energy.models import PanelArray, Scenario
    from energy.persistence import CampusRepository, Database, ScenarioRepository
    from energy.ranking_service import RankingRequest, rank_campus
    from energy.roof_service import building_roofs
    from energy.simulation_service import recommendation_candidates, simulate
    from energy.weather_scenarios import PRESET_NAMES, build_preset_series

router = APIRouter(tags=["campus-energy"])
_ready_paths: set[str] = set()
_ready_lock = threading.Lock()
KST = timezone(timedelta(hours=9))

def database() -> Database:
    default = Path(__file__).parent.parent / "data" / "energy.sqlite3"
    path = os.environ.get("WEATHER_ENERGY_DB", str(default))
    db = Database(path)
    with _ready_lock:
        if path not in _ready_paths:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            db.initialize()
            _ready_paths.add(path)
    return db

def _missing(code: str, identifier: str) -> HTTPException:
    return HTTPException(404, {"code": code, "message_en": f"Resource '{identifier}' was not found.",
                               "message_ko": f"'{identifier}' \uc790\uc6d0\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."})

def _conflict(violations: list[dict], status_code: int = 409) -> HTTPException:
    return HTTPException(status_code, {"code": "invalid_geometry",
        "message_en": "The panel layout contradicts roof geometry constraints.",
        "message_ko": "\ud328\ub110 \ubc30\uce58\uac00 \uc625\uc0c1 \uae30\ud558 \uc81c\uc57d\uacfc \ucda9\ub3cc\ud569\ub2c8\ub2e4.",
        "violations": violations})

def _database_error(exc: sqlite3.OperationalError) -> HTTPException:
    return HTTPException(503, {"code": "database_unavailable", "message_en": str(exc),
        "message_ko": "\ub370\uc774\ud130\ubca0\uc774\uc2a4\ub97c \uc0ac\uc6a9\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."})

def _scenario(repository: ScenarioRepository, scenario_id: str) -> Scenario:
    value = repository.get(scenario_id)
    if value is None:
        raise _missing("scenario_not_found", scenario_id)
    return value

@router.get("/energy/buildings", response_model=list[BuildingOut])
def buildings(db: Database = Depends(database)):
    return CampusRepository(db).list_buildings()

@router.get("/energy/buildings/{building_id}/scenarios", response_model=list[ScenarioSummaryOut])
def building_scenarios(building_id: str, db: Database = Depends(database)):
    if CampusRepository(db).get_building(building_id) is None:
        raise _missing("building_not_found", building_id)
    return [{
        "id": item.id, "building_id": item.building_id, "name": item.name,
        "weather_preset": item.weather_preset, "array_count": len(item.arrays),
        "updated_at": item.updated_at,
    } for item in ScenarioRepository(db).list_for_building(building_id)]

@router.get("/energy/buildings/{building_id}", response_model=BuildingDetailOut)
def building(building_id: str, db: Database = Depends(database)):
    result = CampusRepository(db).get_building(building_id)
    if result is None:
        raise _missing("building_not_found", building_id)
    return {**asdict(result), "roofs": building_roofs(db, building_id)}

@router.get("/energy/buildings/{building_id}/demand", response_model=DemandOut)
def demand(building_id: str, date: date = Query(...), db: Database = Depends(database)):
    result = building_demand(db, building_id, date)
    if result is None:
        raise _missing("building_not_found", building_id)
    return result

@router.get("/energy/weather/scenarios", response_model=list[WeatherPresetOut])
def weather_scenarios(date: date = Query(...)):
    return [{"preset": preset, "series": build_preset_series(date, preset).to_dict()} for preset in PRESET_NAMES]

@router.post("/energy/scenarios", response_model=ScenarioOut, status_code=status.HTTP_201_CREATED)
def create_scenario(payload: ScenarioCreate, db: Database = Depends(database)):
    try:
        building = CampusRepository(db).get_building(payload.building_id)
    except sqlite3.OperationalError as exc:
        raise _database_error(exc) from exc
    if building is None:
        raise _missing("building_not_found", payload.building_id)
    scenario_id = f"scenario-{uuid4()}"
    now = datetime.now(KST).isoformat()
    arrays = tuple(PanelArray(scenario_id=scenario_id, **item.model_dump()) for item in payload.arrays)
    try:
        violations = validate_geometry(db, arrays)
    except sqlite3.OperationalError as exc:
        raise _database_error(exc) from exc
    if violations:
        raise _conflict(violations, 422)
    try:
        scenario = Scenario(id=scenario_id, created_at=now, updated_at=now, arrays=arrays,
                            intervals=(), **payload.model_dump(exclude={"arrays"}))
        ScenarioRepository(db).save(scenario)
    except ValueError as exc:
        raise HTTPException(409, {"code": "contradictory_scenario", "message_en": str(exc),
            "message_ko": "\uc2dc\ub098\ub9ac\uc624 \ub0b4\uc6a9\uc774 \uc11c\ub85c \ubaa8\uc21c\ub429\ub2c8\ub2e4."}) from exc
    except sqlite3.OperationalError as exc:
        raise _database_error(exc) from exc
    return scenario

@router.get("/energy/scenarios/{scenario_id}", response_model=ScenarioOut)
def get_scenario(scenario_id: str, db: Database = Depends(database)):
    return _scenario(ScenarioRepository(db), scenario_id)

@router.post("/energy/scenarios/{scenario_id}/simulate", response_model=SimulationOut)
def run_simulation(scenario_id: str, payload: DateRequest, db: Database = Depends(database)):
    repository = ScenarioRepository(db)
    scenario = _scenario(repository, scenario_id)
    violations = validate_geometry(db, scenario.arrays)
    if violations:
        raise _conflict(violations, 422)
    _, result = simulate(db, scenario, payload.date)
    return result

@router.post("/energy/scenarios/{scenario_id}/recommend", response_model=RecommendationOut,
             status_code=status.HTTP_201_CREATED)
def recommend(scenario_id: str, request: DateRequest, db: Database = Depends(database)):
    repository = ScenarioRepository(db)
    source = _scenario(repository, scenario_id)
    if not source.arrays:
        raise HTTPException(409, {"code": "incomplete_scenario", "message_en": "Source has no arrays.",
                                  "message_ko": "\uc6d0\ubcf8 \uc2dc\ub098\ub9ac\uc624\uc5d0 \ubc30\uc5f4\uc774 \uc5c6\uc2b5\ub2c8\ub2e4."})
    suggested_id = f"scenario-{uuid4()}"
    arrays, scores = recommendation_candidates(source, suggested_id, db)
    now = datetime.now(KST).isoformat()
    suggested = Scenario(id=suggested_id, building_id=source.building_id,
        name=f"{source.name} recommendation {request.date.isoformat()}", weather_preset=source.weather_preset,
        created_at=now, updated_at=now, arrays=arrays, intervals=())
    repository.save(suggested)
    return {"source_scenario_id": source.id, "scenario": suggested, "candidate_scores": scores}


@router.put("/energy/scenarios/{scenario_id}", response_model=ScenarioOut)
def update_scenario(scenario_id: str, payload: ScenarioCreate,
                    db: Database = Depends(database)):
    repository = ScenarioRepository(db)
    current = _scenario(repository, scenario_id)
    if CampusRepository(db).get_building(payload.building_id) is None:
        raise _missing("building_not_found", payload.building_id)
    arrays = tuple(PanelArray(scenario_id=scenario_id, **item.model_dump()) for item in payload.arrays)
    violations = validate_geometry(db, arrays)
    if violations:
        raise _conflict(violations, 422)
    try:
        updated = Scenario(
            id=scenario_id, building_id=payload.building_id, name=payload.name,
            weather_preset=payload.weather_preset, created_at=current.created_at,
            updated_at=datetime.now(KST).isoformat(), arrays=arrays, intervals=(),
        )
    except ValueError as exc:
        raise HTTPException(422, {"code": "invalid_scenario", "message_en": str(exc),
            "message_ko": "\uc2dc\ub098\ub9ac\uc624 \ub0b4\uc6a9\uc774 \uc720\ud6a8\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.", "details": []}) from exc
    repository.save(updated)
    return updated


@router.delete("/energy/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(scenario_id: str, db: Database = Depends(database)) -> Response:
    repository = ScenarioRepository(db)
    _scenario(repository, scenario_id)
    repository.delete(scenario_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/energy/rankings", response_model=RankingsOut)
def rankings(date: date = Query(...), weather_preset: str = Query("clear"),
             db: Database = Depends(database)):
    if weather_preset not in PRESET_NAMES:
        raise HTTPException(422, {"code": "invalid_weather_preset",
            "message_en": "A deterministic weather preset is required.",
            "message_ko": "\uacb0\uc815\uc801 \uae30\uc0c1 \ud504\ub9ac\uc14b\uc774 \ud544\uc694\ud569\ub2c8\ub2e4."})
    request = RankingRequest(date=date, weather_preset=weather_preset)
    return rank_campus(db, request).to_dict()
