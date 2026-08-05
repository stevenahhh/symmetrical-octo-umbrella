"""Pydantic v2 contracts for the campus energy HTTP boundary."""
from __future__ import annotations
from datetime import date
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, allow_inf_nan=False)

class AssumptionOut(ApiModel):
    type: Literal["simulation-assumption"] = "simulation-assumption"
    quality: Literal["predicted"] = "predicted"
    calibration: Literal["not-engineering-calibrated"] = "not-engineering-calibrated"

class BuildingOut(ApiModel):
    id: str; display_name: str; timezone: str; demand_quality: str
    room_count: int; roof_zone_count: int

class RoofPointOut(ApiModel):
    x_meters: float; y_meters: float

class RoofZoneOut(ApiModel):
    id: str; polygon_meters: list[RoofPointOut]

class RoofObstacleOut(ApiModel):
    id: str; roof_zone_id: str; polygon_meters: list[RoofPointOut]

class RoofOut(ApiModel):
    id: str; zones: list[RoofZoneOut]; obstacles: list[RoofObstacleOut]

class BuildingDetailOut(BuildingOut):
    roofs: list[RoofOut]

class DemandIntervalOut(ApiModel):
    timestamp: str; predicted_demand_kw: float; predicted_demand_energy_kwh: float
    power_unit: Literal["kW"] = "kW"; energy_unit: Literal["kWh"] = "kWh"
    quality: Literal["predicted"] = "predicted"

class DemandOut(ApiModel):
    building_id: str; date: date; interval_minutes: Literal[15] = 15
    timezone: Literal["Asia/Seoul"] = "Asia/Seoul"; quality: Literal["predicted"] = "predicted"
    assumption: AssumptionOut; intervals: list[DemandIntervalOut]; total_energy_kwh: float

class WeatherIntervalOut(ApiModel):
    timestamp: str; ambient_temperature_c: float; global_irradiance_w_m2: float
    cloud_factor: float; solar_altitude_deg: float; source: Literal["scenario", "estimated"]
    quality_text: str; field_sources: dict[str, str]

class WeatherSeriesOut(ApiModel):
    status: Literal["available", "unavailable"]; source: Literal["scenario", "estimated"]
    scenario_id: str | None; location_id: str; timezone: str; quality_text: str
    intervals: list[WeatherIntervalOut]; error_code: str | None = None

class WeatherPresetOut(ApiModel):
    preset: Literal["clear", "partly_cloudy", "overcast"]; series: WeatherSeriesOut

class PanelArrayIn(ApiModel):
    id: str = Field(min_length=1); roof_id: str = Field(min_length=1)
    roof_zone_id: str = Field(min_length=1); module_id: str = Field(min_length=1)
    origin_x_m: float; origin_y_m: float
    rows: int = Field(ge=1, le=100); columns: int = Field(ge=1, le=100)
    azimuth_deg: float = Field(ge=0, lt=360); tilt_deg: float = Field(ge=0, le=45)
    orientation: Literal["portrait", "landscape"]
    module_width_m: float = Field(gt=0); module_length_m: float = Field(gt=0)
    module_efficiency_percent: float = Field(ge=0, le=100)
    module_nominal_power_wp: float = Field(gt=0); inter_panel_gap_m: float = Field(ge=0)

    @field_validator("id", "roof_id", "roof_zone_id", "module_id", mode="before")
    @classmethod
    def normalize_required_ids(cls, value):
        return value.strip() if isinstance(value, str) else value

class ScenarioCreate(ApiModel):
    building_id: str = Field(min_length=1); name: str = Field(min_length=1, max_length=120)
    weather_preset: Literal["clear", "partly_cloudy", "overcast"]
    arrays: list[PanelArrayIn] = Field(min_length=1, max_length=20)

    @field_validator("building_id", "name", mode="before")
    @classmethod
    def normalize_required_text(cls, value):
        return value.strip() if isinstance(value, str) else value

class InstallationPlanCreate(ApiModel):
    building_id: str = Field(min_length=1); name: str = Field(min_length=1, max_length=120)
    arrays: list[PanelArrayIn] = Field(min_length=1, max_length=20)

    @field_validator("building_id", "name", mode="before")
    @classmethod
    def normalize_required_text(cls, value):
        return value.strip() if isinstance(value, str) else value

class InstallationPlanArrayOut(PanelArrayIn):
    installation_plan_id: str

class InstallationPlanOut(ApiModel):
    id: str; building_id: str; name: str; created_at: str; updated_at: str
    arrays: list[InstallationPlanArrayOut]

class InstallationPlanSummaryOut(ApiModel):
    id: str; building_id: str; name: str; array_count: int; updated_at: str
    is_representative: bool

class RepresentativePlanSet(ApiModel):
    installation_plan_id: str = Field(min_length=1)

    @field_validator("installation_plan_id", mode="before")
    @classmethod
    def normalize_installation_plan_id(cls, value):
        return value.strip() if isinstance(value, str) else value

class RepresentativePlanOut(ApiModel):
    building_id: str; installation_plan_id: str; selected_at: str

class ScenarioIntervalOut(ApiModel):
    timestamp: str; ambient_temperature_c: float; global_irradiance_w_m2: float
    predicted_demand_kw: float; predicted_demand_energy_kwh: float
    generation_energy_kwh: float; weather_source: str; demand_quality: str

class PanelArrayOut(PanelArrayIn):
    scenario_id: str

class ScenarioOut(ApiModel):
    id: str; building_id: str; name: str; weather_preset: str; created_at: str; updated_at: str
    arrays: list[PanelArrayOut]; intervals: list[ScenarioIntervalOut]

class ScenarioSummaryOut(ApiModel):
    id: str; building_id: str; name: str; weather_preset: str
    array_count: int; updated_at: str

class DateRequest(ApiModel):
    date: date

class GenerationIntervalOut(ApiModel):
    timestamp: str; generation_energy_kwh: float
    plane_of_array_factor: float = Field(ge=0, le=1)
    temperature_factor: float = Field(ge=0, le=1)
    system_factor: float = Field(ge=0, le=1)

class ArraySimulationOut(ApiModel):
    array_id: str; module_count: int; capacity_kwp: float
    intervals: list[GenerationIntervalOut]; total_generation_energy_kwh: float

class BalanceIntervalOut(ApiModel):
    timestamp: str; predicted_demand_energy_kwh: float; generation_energy_kwh: float
    global_irradiance_w_m2: float = Field(ge=0)
    self_consumption_energy_kwh: float; grid_draw_energy_kwh: float; surplus_energy_kwh: float

class SimulationTotalsOut(ApiModel):
    demand_energy_kwh: float; generation_energy_kwh: float
    self_consumption_energy_kwh: float; grid_draw_energy_kwh: float; surplus_energy_kwh: float

class GenerationAssumptionOut(ApiModel):
    type: Literal["simulation-assumption"]; calibration: Literal["not-engineering-calibrated"]
    model: Literal["deterministic-python-v1"]; system_loss_fraction: float

class SimulationOut(ApiModel):
    scenario_id: str; date: date; interval_minutes: Literal[15] = 15
    demand_quality: Literal["predicted"] = "predicted"; weather_source: Literal["scenario"] = "scenario"
    generation_assumption: GenerationAssumptionOut
    intervals: list[BalanceIntervalOut]; arrays: list[ArraySimulationOut]; totals: SimulationTotalsOut

class AnalysisConditionsIn(ApiModel):
    date: date
    weather_preset: Literal["clear", "partly_cloudy", "overcast"]

class AnalysisRunCreate(ApiModel):
    installation_plan_id: str = Field(min_length=1)
    conditions: AnalysisConditionsIn

    @field_validator("installation_plan_id", mode="before")
    @classmethod
    def normalize_installation_plan_id(cls, value):
        return value.strip() if isinstance(value, str) else value

class AnalysisConditionsOut(AnalysisConditionsIn):
    timezone: Literal["Asia/Seoul"]
    interval_minutes: Literal[15]
    generation_model: Literal["deterministic-python-v1"]
    electricity_price_krw_per_kwh: float = Field(default=160, ge=0)
    carbon_intensity_kg_co2e_per_kwh: float = Field(default=0.45, ge=0)

class DirectAnalysisRunOut(ApiModel):
    run_type: Literal["direct"]
    id: str; building_id: str; installation_plan_id: str; created_at: str
    installation_plan: InstallationPlanOut
    conditions: AnalysisConditionsOut
    result: SimulationOut

class AnalysisScenarioConditions(ApiModel):
    demand_source: Literal["predicted"]
    weather_preset: Literal["clear", "partly_cloudy", "overcast"]
    electricity_price_krw_per_kwh: float = Field(default=160, ge=0)
    carbon_intensity_kg_co2e_per_kwh: float = Field(default=0.45, ge=0)

class AnalysisScenarioCreate(ApiModel):
    building_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=120)
    representative_plan_id: str = Field(min_length=1)
    alternative_plan_id: str | None = None
    baseline: Literal["no_solar"]
    conditions: AnalysisScenarioConditions

    @field_validator("building_id", "name", mode="before")
    @classmethod
    def normalize_required_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("representative_plan_id", mode="before")
    @classmethod
    def normalize_representative_plan_id(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("alternative_plan_id", mode="before")
    @classmethod
    def normalize_optional_plan_id(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @model_validator(mode="after")
    def distinct_plans(self):
        if self.alternative_plan_id == self.representative_plan_id:
            raise ValueError("alternative_plan_id must differ from representative_plan_id")
        return self

class AnalysisScenarioOut(AnalysisScenarioCreate):
    id: str; created_at: str; updated_at: str

class AnalysisRunIntervalOut(ApiModel):
    timestamp: str; predicted_demand_energy_kwh: float; global_irradiance_w_m2: float
    baseline_generation_energy_kwh: float
    proposed_generation_energy_kwh: float
    alternative_generation_energy_kwh: float | None

class AnalysisPlanSnapshotsOut(ApiModel):
    representative: InstallationPlanOut
    alternative: InstallationPlanOut | None

class CampusRepresentativeAnalysisOut(ApiModel):
    building_id: str; building_name: str; installation_plan_id: str
    generation_energy_kwh: float; demand_energy_kwh: float

class AnalysisRunOut(ApiModel):
    run_type: Literal["scenario"]
    id: str; analysis_scenario_id: str; building_id: str; created_at: str; date: date
    scenario_snapshot: AnalysisScenarioOut
    plan_snapshots: AnalysisPlanSnapshotsOut
    intervals: list[AnalysisRunIntervalOut]
    totals: dict[str, SimulationTotalsOut | None]
    campus_representatives: list[CampusRepresentativeAnalysisOut]

AnalysisRunHistoryOut = Annotated[
    AnalysisRunOut | DirectAnalysisRunOut,
    Field(discriminator="run_type"),
]

class CandidateScoreOut(ApiModel):
    candidate_id: str; module_count: int; azimuth_deg: float; tilt_deg: float
    orientation: str; score: float; valid: bool

class RecommendationOut(ApiModel):
    source_scenario_id: str; scenario: ScenarioOut; candidate_scores: list[CandidateScoreOut]

class RankingComponentsOut(ApiModel):
    annualized_yield: float = Field(ge=0, le=1)
    roof_utilization: float = Field(ge=0, le=1)
    self_sufficiency: float = Field(ge=0, le=1)
    grid_reduction: float = Field(ge=0, le=1)
    constraints: float = Field(ge=0, le=1)

class RankingMetricsOut(ApiModel):
    annualized_kwh_per_kwp: float = Field(ge=0)
    roof_utilization_ratio: float = Field(ge=0, le=1)
    self_sufficiency_ratio: float = Field(ge=0, le=1)
    grid_reduction_ratio: float = Field(ge=0, le=1)
    constraint_violation_count: int = Field(ge=0)

class RankingAssumptionsOut(ApiModel):
    annualization_days: Literal[365] = 365
    annualized_yield_reference_kwh_per_kwp: float
    weights: dict[str, float]
    demand_quality: Literal["predicted"] = "predicted"
    weather_source: Literal["scenario"] = "scenario"
    comparability: str

class RankingEntryOut(ApiModel):
    scenario_id: str | None; building_id: str; building_name: str
    building_status: Literal["no_scenario", "incomplete", "simulated"]
    status: Literal["ranked", "excluded"]
    rank: int | None; score: float | None; score_unit: Literal["normalized-weighted-score"]
    total_generation_energy_kwh: float | None; capacity_kwp: float | None
    exclusion_reason: str | None; demand_quality: Literal["predicted"]
    weather_source: Literal["scenario"]
    component_scores: RankingComponentsOut | None
    metrics: RankingMetricsOut | None

class RankingsOut(ApiModel):
    date: date; weather_preset: Literal["clear", "partly_cloudy", "overcast"]
    assumptions: RankingAssumptionsOut; rankings: list[RankingEntryOut]
