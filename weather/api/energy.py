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
    from weather.energy.api_models import (AnalysisRunCreate, AnalysisRunHistoryOut, AnalysisRunOut,
        AnalysisScenarioCreate, AnalysisScenarioOut, BuildingDetailOut, BuildingOut, DateRequest,
        DemandOut, DirectAnalysisRunOut, InstallationPlanCreate, InstallationPlanOut,
        InstallationPlanSummaryOut, RankingsOut, RecommendationOut, RepresentativePlanOut,
        RepresentativePlanSet, ScenarioCreate, ScenarioOut, ScenarioSummaryOut, SimulationOut,
        WeatherPresetOut)
    from weather.energy.analysis_service import execute_analysis_run, execute_analysis_scenario_run
    from weather.energy.demand_service import building_demand
    from weather.energy.geometry_service import validate_geometry
    from weather.energy.models import AnalysisScenario, InstallationPlan, PanelArray, Scenario
    from weather.energy.persistence import (AnalysisRunRepository, AnalysisScenarioBuildingMismatch,
        AnalysisScenarioPlanConflict, AnalysisScenarioRepository, CampusRepository, Database,
        InstallationPlanBuildingMismatch,
        InstallationPlanRepository, RepresentativePlanConflict, RepresentativePlanRepository,
        ScenarioBuildingMismatch, ScenarioRepository)
    from weather.energy.ranking_service import RankingRequest, rank_campus
    from weather.energy.roof_service import building_roofs
    from weather.energy.simulation_service import (NoValidRecommendationCandidate,
        recommendation_candidates, simulate)
    from weather.energy.weather_scenarios import PRESET_NAMES, build_preset_series
except ModuleNotFoundError:
    from energy.api_models import (AnalysisRunCreate, AnalysisRunHistoryOut, AnalysisRunOut, AnalysisScenarioCreate,
        AnalysisScenarioOut, BuildingDetailOut, BuildingOut, DateRequest, DemandOut,
        DirectAnalysisRunOut, InstallationPlanCreate, InstallationPlanOut,
        InstallationPlanSummaryOut, RankingsOut, RecommendationOut, RepresentativePlanOut,
        RepresentativePlanSet, ScenarioCreate, ScenarioOut, ScenarioSummaryOut, SimulationOut,
        WeatherPresetOut)
    from energy.analysis_service import execute_analysis_run, execute_analysis_scenario_run
    from energy.demand_service import building_demand
    from energy.geometry_service import validate_geometry
    from energy.models import AnalysisScenario, InstallationPlan, PanelArray, Scenario
    from energy.persistence import (AnalysisRunRepository, AnalysisScenarioBuildingMismatch,
        AnalysisScenarioPlanConflict, AnalysisScenarioRepository, CampusRepository, Database,
        InstallationPlanBuildingMismatch,
        InstallationPlanRepository, RepresentativePlanConflict, RepresentativePlanRepository,
        ScenarioBuildingMismatch, ScenarioRepository)
    from energy.ranking_service import RankingRequest, rank_campus
    from energy.roof_service import building_roofs
    from energy.simulation_service import (NoValidRecommendationCandidate,
        recommendation_candidates, simulate)
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

def _database_error(_exc: sqlite3.OperationalError) -> HTTPException:
    return HTTPException(503, {"code": "database_unavailable",
        "message_en": "The database is temporarily unavailable.",
        "message_ko": "\ub370\uc774\ud130\ubca0\uc774\uc2a4\ub97c \uc0ac\uc6a9\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."})

def _scenario(repository: ScenarioRepository, scenario_id: str) -> Scenario:
    value = repository.get(scenario_id)
    if value is None:
        raise _missing("scenario_not_found", scenario_id)
    return value


def _plan(repository: InstallationPlanRepository, plan_id: str) -> InstallationPlan:
    value = repository.get(plan_id)
    if value is None:
        raise _missing("installation_plan_not_found", plan_id)
    return value


def _plan_payload(plan: InstallationPlan) -> dict:
    arrays = []
    for item in plan.arrays:
        value = item.to_dict()
        value["installation_plan_id"] = value.pop("scenario_id")
        arrays.append(value)
    return {"id": plan.id, "building_id": plan.building_id, "name": plan.name,
            "created_at": plan.created_at, "updated_at": plan.updated_at, "arrays": arrays}


def _run_payload(run) -> dict:
    if run.analysis_scenario_id is not None:
        return {**run.result, "run_type": "scenario"}
    return {"run_type": "direct", "id": run.id, "building_id": run.building_id,
            "installation_plan_id": run.installation_plan_id, "created_at": run.created_at,
            "installation_plan": run.plan_snapshot, "conditions": run.conditions,
            "result": run.result}


def _analysis_scenario(repository: AnalysisScenarioRepository,
                       scenario_id: str) -> AnalysisScenario:
    value = repository.get(scenario_id)
    if value is None:
        raise _missing("analysis_scenario_not_found", scenario_id)
    return value


def _plan_delete_conflict(plan_id: str) -> HTTPException:
    return HTTPException(409, {"code": "representative_installation_plan",
        "message_en": "Unset or replace the representative installation plan before deletion.",
        "message_ko": "삭제하기 전에 대표 설치안을 해제하거나 교체해야 합니다.",
        "installation_plan_id": plan_id})


def _analysis_plan_delete_conflict(plan_id: str) -> HTTPException:
    return HTTPException(409, {"code": "analysis_scenario_installation_plan",
        "message_en": "Delete or edit analysis scenarios that reference this plan first.",
        "message_ko": "먼저 이 설치안을 참조하는 분석 시나리오를 삭제하거나 변경해야 합니다.",
        "installation_plan_id": plan_id})

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

@router.post("/energy/installation-plans", response_model=InstallationPlanOut,
             status_code=status.HTTP_201_CREATED)
def create_installation_plan(payload: InstallationPlanCreate, db: Database = Depends(database)):
    if CampusRepository(db).get_building(payload.building_id) is None:
        raise _missing("building_not_found", payload.building_id)
    plan_id = f"plan-{uuid4()}"
    now = datetime.now(KST).isoformat()
    arrays = tuple(PanelArray(
        id=f"{plan_id}-array-{index + 1}", scenario_id=plan_id,
        **item.model_dump(exclude={"id"}),
    ) for index, item in enumerate(payload.arrays))
    violations = validate_geometry(db, payload.building_id, arrays)
    if violations:
        raise _conflict(violations, 422)
    plan = InstallationPlan(id=plan_id, building_id=payload.building_id, name=payload.name,
                            created_at=now, updated_at=now, arrays=arrays)
    InstallationPlanRepository(db).save(plan)
    return _plan_payload(plan)


@router.get("/energy/buildings/{building_id}/installation-plans",
            response_model=list[InstallationPlanSummaryOut])
def building_installation_plans(building_id: str, db: Database = Depends(database)):
    if CampusRepository(db).get_building(building_id) is None:
        raise _missing("building_not_found", building_id)
    repository = InstallationPlanRepository(db)
    representative = RepresentativePlanRepository(db).get(building_id)
    return [{"id": item.id, "building_id": item.building_id, "name": item.name,
             "array_count": len(item.arrays), "updated_at": item.updated_at,
             "is_representative": representative is not None
                                  and representative.installation_plan_id == item.id}
            for item in repository.list_for_building(building_id)]


@router.get("/energy/installation-plans/{plan_id}", response_model=InstallationPlanOut)
def get_installation_plan(plan_id: str, db: Database = Depends(database)):
    return _plan_payload(_plan(InstallationPlanRepository(db), plan_id))


@router.put("/energy/installation-plans/{plan_id}", response_model=InstallationPlanOut)
def update_installation_plan(plan_id: str, payload: InstallationPlanCreate,
                             db: Database = Depends(database)):
    repository = InstallationPlanRepository(db)
    current = _plan(repository, plan_id)
    if CampusRepository(db).get_building(payload.building_id) is None:
        raise _missing("building_not_found", payload.building_id)
    if payload.building_id != current.building_id:
        raise HTTPException(422, {"code": "installation_plan_building_mismatch",
            "message_en": "An installation plan cannot be moved to another building.",
            "message_ko": "설치안을 다른 건물로 이동할 수 없습니다."})
    arrays = tuple(PanelArray(
        id=f"{plan_id}-array-{index + 1}", scenario_id=plan_id,
        **item.model_dump(exclude={"id"}),
    ) for index, item in enumerate(payload.arrays))
    violations = validate_geometry(db, payload.building_id, arrays)
    if violations:
        raise _conflict(violations, 422)
    updated = InstallationPlan(
        id=plan_id, building_id=payload.building_id, name=payload.name,
        created_at=current.created_at, updated_at=datetime.now(KST).isoformat(), arrays=arrays,
    )
    try:
        repository.save(updated)
    except InstallationPlanBuildingMismatch as exc:
        raise HTTPException(422, {"code": "installation_plan_building_mismatch",
            "message_en": "An installation plan cannot be moved to another building.",
            "message_ko": "설치안을 다른 건물로 이동할 수 없습니다."}) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, {"code": "installation_plan_update_conflict",
            "message_en": "The installation plan could not be updated because it is in use.",
            "message_ko": "설치안을 변경할 수 없습니다."}) from exc
    return _plan_payload(updated)


@router.delete("/energy/installation-plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_installation_plan(plan_id: str, db: Database = Depends(database)) -> Response:
    repository = InstallationPlanRepository(db)
    _plan(repository, plan_id)
    try:
        repository.delete(plan_id)
    except RepresentativePlanConflict as exc:
        raise _plan_delete_conflict(plan_id) from exc
    except AnalysisScenarioPlanConflict as exc:
        raise _analysis_plan_delete_conflict(plan_id) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/energy/buildings/{building_id}/representative-plan",
            response_model=RepresentativePlanOut)
@router.get("/energy/buildings/{building_id}/representative-installation-plan",
            response_model=RepresentativePlanOut, include_in_schema=False)
def get_representative_installation_plan(building_id: str, db: Database = Depends(database)):
    if CampusRepository(db).get_building(building_id) is None:
        raise _missing("building_not_found", building_id)
    value = RepresentativePlanRepository(db).get(building_id)
    if value is None:
        raise _missing("representative_installation_plan_not_found", building_id)
    return value


@router.put("/energy/buildings/{building_id}/representative-plan",
            response_model=RepresentativePlanOut)
@router.put("/energy/buildings/{building_id}/representative-installation-plan",
            response_model=RepresentativePlanOut, include_in_schema=False)
def set_representative_installation_plan(building_id: str, payload: RepresentativePlanSet,
                                         db: Database = Depends(database)):
    if CampusRepository(db).get_building(building_id) is None:
        raise _missing("building_not_found", building_id)
    try:
        return RepresentativePlanRepository(db).set(
            building_id, payload.installation_plan_id, datetime.now(KST).isoformat(),
        )
    except LookupError as exc:
        raise _missing("installation_plan_not_found", payload.installation_plan_id) from exc
    except InstallationPlanBuildingMismatch as exc:
        raise HTTPException(422, {"code": "installation_plan_building_mismatch",
            "message_en": "The installation plan belongs to another building.",
            "message_ko": "설치안이 다른 건물에 속합니다."}) from exc


@router.delete("/energy/buildings/{building_id}/representative-plan",
               status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/energy/buildings/{building_id}/representative-installation-plan",
               status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
def unset_representative_installation_plan(building_id: str,
                                           db: Database = Depends(database)) -> Response:
    if CampusRepository(db).get_building(building_id) is None:
        raise _missing("building_not_found", building_id)
    RepresentativePlanRepository(db).unset(building_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _save_analysis_scenario(payload: AnalysisScenarioCreate, scenario_id: str,
                            created_at: str, db: Database) -> AnalysisScenario:
    if CampusRepository(db).get_building(payload.building_id) is None:
        raise _missing("building_not_found", payload.building_id)
    scenario = AnalysisScenario(
        id=scenario_id, created_at=created_at, updated_at=datetime.now(KST).isoformat(),
        **payload.model_dump(),
    )
    try:
        AnalysisScenarioRepository(db).save(scenario)
    except LookupError as exc:
        raise _missing("installation_plan_not_found", str(exc.args[0])) from exc
    except InstallationPlanBuildingMismatch as exc:
        raise HTTPException(422, {"code": "installation_plan_building_mismatch",
            "message_en": "Every analysis plan must belong to the analysis building.",
            "message_ko": "모든 분석 설치안은 분석 건물에 속해야 합니다."}) from exc
    except AnalysisScenarioBuildingMismatch as exc:
        raise HTTPException(422, {"code": "analysis_scenario_building_mismatch",
            "message_en": "An analysis scenario cannot be moved to another building.",
            "message_ko": "분석 시나리오를 다른 건물로 이동할 수 없습니다."}) from exc
    return scenario


@router.post("/energy/analysis-scenarios", response_model=AnalysisScenarioOut,
             status_code=status.HTTP_201_CREATED)
def create_analysis_scenario(payload: AnalysisScenarioCreate,
                             db: Database = Depends(database)):
    now = datetime.now(KST).isoformat()
    return _save_analysis_scenario(payload, f"analysis-scenario-{uuid4()}", now, db)


@router.get("/energy/buildings/{building_id}/analysis-scenarios",
            response_model=list[AnalysisScenarioOut])
def building_analysis_scenarios(building_id: str, db: Database = Depends(database)):
    if CampusRepository(db).get_building(building_id) is None:
        raise _missing("building_not_found", building_id)
    return AnalysisScenarioRepository(db).list_for_building(building_id)


@router.get("/energy/analysis-scenarios/{scenario_id}", response_model=AnalysisScenarioOut)
def get_analysis_scenario(scenario_id: str, db: Database = Depends(database)):
    return _analysis_scenario(AnalysisScenarioRepository(db), scenario_id)


@router.put("/energy/analysis-scenarios/{scenario_id}", response_model=AnalysisScenarioOut)
def update_analysis_scenario(scenario_id: str, payload: AnalysisScenarioCreate,
                             db: Database = Depends(database)):
    repository = AnalysisScenarioRepository(db)
    current = _analysis_scenario(repository, scenario_id)
    if payload.building_id != current.building_id:
        raise HTTPException(422, {"code": "analysis_scenario_building_mismatch",
            "message_en": "An analysis scenario cannot be moved to another building.",
            "message_ko": "분석 시나리오를 다른 건물로 이동할 수 없습니다."})
    return _save_analysis_scenario(payload, scenario_id, current.created_at, db)


@router.delete("/energy/analysis-scenarios/{scenario_id}",
               status_code=status.HTTP_204_NO_CONTENT)
def delete_analysis_scenario(scenario_id: str, db: Database = Depends(database)) -> Response:
    repository = AnalysisScenarioRepository(db)
    _analysis_scenario(repository, scenario_id)
    repository.delete(scenario_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/energy/analysis-scenarios/{scenario_id}/runs", response_model=AnalysisRunOut,
             status_code=status.HTTP_201_CREATED)
def run_analysis_scenario(scenario_id: str, payload: DateRequest,
                          db: Database = Depends(database)):
    scenario = _analysis_scenario(AnalysisScenarioRepository(db), scenario_id)
    plans = InstallationPlanRepository(db)
    for plan_id in filter(None, (scenario.representative_plan_id,
                                 scenario.alternative_plan_id)):
        plan = _plan(plans, plan_id)
        violations = validate_geometry(db, scenario.building_id, plan.arrays)
        if violations:
            raise _conflict(violations, 422)
    try:
        run = execute_analysis_scenario_run(
            db, scenario, payload.date, run_id=f"analysis-run-{uuid4()}",
            created_at=datetime.now(KST).isoformat(),
        )
    except LookupError as exc:
        raise _missing("installation_plan_not_found", str(exc.args[0])) from exc
    return _run_payload(run)


@router.get("/energy/analysis-scenarios/{scenario_id}/runs",
            response_model=list[AnalysisRunOut])
def analysis_scenario_runs(scenario_id: str, db: Database = Depends(database)):
    return [_run_payload(item) for item in
            AnalysisRunRepository(db).list_for_scenario(scenario_id)]


@router.post("/energy/analysis-runs", response_model=DirectAnalysisRunOut,
             status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_analysis_run(payload: AnalysisRunCreate, db: Database = Depends(database)):
    plan = _plan(InstallationPlanRepository(db), payload.installation_plan_id)
    violations = validate_geometry(db, plan.building_id, plan.arrays)
    if violations:
        raise _conflict(violations, 422)
    run = execute_analysis_run(
        db, plan, payload.conditions.date, payload.conditions.weather_preset,
        run_id=f"analysis-run-{uuid4()}", created_at=datetime.now(KST).isoformat(),
    )
    return _run_payload(run)


@router.get("/energy/analysis-runs/{run_id}", response_model=AnalysisRunHistoryOut)
def get_analysis_run(run_id: str, db: Database = Depends(database)):
    run = AnalysisRunRepository(db).get(run_id)
    if run is None:
        raise _missing("analysis_run_not_found", run_id)
    return _run_payload(run)


@router.get("/energy/buildings/{building_id}/analysis-runs",
            response_model=list[AnalysisRunHistoryOut])
def building_analysis_runs(building_id: str, db: Database = Depends(database)):
    if CampusRepository(db).get_building(building_id) is None:
        raise _missing("building_not_found", building_id)
    return [_run_payload(item) for item in AnalysisRunRepository(db).list_for_building(building_id)]


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
    arrays = tuple(PanelArray(
        id=f"{scenario_id}-array-{index + 1}", scenario_id=scenario_id,
        **item.model_dump(exclude={"id"}),
    ) for index, item in enumerate(payload.arrays))
    try:
        violations = validate_geometry(db, payload.building_id, arrays)
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
    violations = validate_geometry(db, scenario.building_id, scenario.arrays)
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
    try:
        arrays, scores = recommendation_candidates(source, suggested_id, db)
    except NoValidRecommendationCandidate as exc:
        raise HTTPException(409, {"code": "no_valid_recommendation_candidate",
            "message_en": "No valid recommendation fits the current roof constraints.",
            "message_ko": "현재 옥상 제약 조건에 맞는 추천 설치안을 만들 수 없습니다."}) from exc
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
    if payload.building_id != current.building_id:
        raise HTTPException(422, {"code": "scenario_building_mismatch",
            "message_en": "A scenario cannot be moved to another building.",
            "message_ko": "시나리오를 다른 건물로 이동할 수 없습니다."})
    if CampusRepository(db).get_building(payload.building_id) is None:
        raise _missing("building_not_found", payload.building_id)
    try:
        arrays = tuple(PanelArray(
            id=f"{scenario_id}-array-{index + 1}", scenario_id=scenario_id,
            **item.model_dump(exclude={"id"}),
        ) for index, item in enumerate(payload.arrays))
        updated = Scenario(
            id=scenario_id, building_id=payload.building_id, name=payload.name,
            weather_preset=payload.weather_preset, created_at=current.created_at,
            updated_at=datetime.now(KST).isoformat(), arrays=arrays, intervals=current.intervals,
        )
    except ValueError as exc:
        raise HTTPException(422, {"code": "request_validation_error", "message_en": str(exc),
            "message_ko": "\uc2dc\ub098\ub9ac\uc624 \ub0b4\uc6a9\uc774 \uc720\ud6a8\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.", "details": []}) from exc
    violations = validate_geometry(db, payload.building_id, arrays)
    if violations:
        raise _conflict(violations, 422)
    try:
        repository.save(updated)
    except ScenarioBuildingMismatch as exc:
        raise HTTPException(422, {"code": "scenario_building_mismatch",
            "message_en": "A scenario cannot be moved to another building.",
            "message_ko": "시나리오를 다른 건물로 이동할 수 없습니다."}) from exc
    return updated


@router.delete("/energy/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(scenario_id: str, db: Database = Depends(database)) -> Response:
    repository = ScenarioRepository(db)
    _scenario(repository, scenario_id)
    try:
        repository.delete(scenario_id)
    except RepresentativePlanConflict as exc:
        raise _plan_delete_conflict(scenario_id) from exc
    except AnalysisScenarioPlanConflict as exc:
        raise _analysis_plan_delete_conflict(scenario_id) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/energy/rankings", response_model=RankingsOut)
def rankings(date: date = Query(...), weather_preset: str = Query("clear"),
             representative_only: bool = Query(False),
             db: Database = Depends(database)):
    if weather_preset not in PRESET_NAMES:
        raise HTTPException(422, {"code": "invalid_weather_preset",
            "message_en": "A deterministic weather preset is required.",
            "message_ko": "\uacb0\uc815\uc801 \uae30\uc0c1 \ud504\ub9ac\uc14b\uc774 \ud544\uc694\ud569\ub2c8\ub2e4."})
    request = RankingRequest(date=date, weather_preset=weather_preset)
    return rank_campus(db, request, representative_only=representative_only).to_dict()
