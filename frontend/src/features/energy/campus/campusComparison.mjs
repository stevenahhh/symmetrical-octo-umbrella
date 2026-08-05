export class CampusComparisonContractError extends TypeError {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.name = "CampusComparisonContractError";
    this.code = "invalid_campus_comparison_payload";
    this.field = field;
  }
}
const fail = (field, message) => { throw new CampusComparisonContractError(field, message); };
const text = (value, field) => typeof value === "string" && value ? value : fail(field, "text required");
const finite = (value, field) => typeof value === "number" && Number.isFinite(value) ? value : fail(field, "finite number required");
const STATUS = new Set(["no_scenario", "incomplete", "simulated"]);
const REASONS = {
  missing_roof_metadata: "옥상 메타데이터가 없어 비교에서 제외됨",
  no_scenario: "저장된 설치 시나리오가 없음",
  no_representative_plan: "대표 설치안이 선택되지 않음",
  simulation_incomplete_for_date: "선택 날짜의 96개 시뮬레이션 구간이 없어 제외됨",
  weather_preset_mismatch: "선택한 기상 프리셋과 달라 제외됨",
};

export function parseCampusComparison(value, expected = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("payload", "object required");
  const date = text(value.date, "date");
  const weatherPreset = text(value.weather_preset, "weather_preset");
  if (expected.date !== undefined && date !== expected.date) fail("date", "must match requested date");
  if (expected.weatherPreset !== undefined && weatherPreset !== expected.weatherPreset) fail("weather_preset", "must match requested weather preset");
  if (!Array.isArray(value.rankings)) fail("rankings", "array required");
  const entries = value.rankings.map((item, index) => {
    const field = `rankings[${index}]`;
    if (!STATUS.has(item?.building_status)) fail(`${field}.building_status`, "known status required");
    if (item.status === "excluded") {
      if (item.score !== null) fail(`${field}.score`, "excluded score must be null");
      return { scenarioId: item.scenario_id, buildingId: text(item.building_id, `${field}.building_id`), buildingName: text(item.building_name, `${field}.building_name`), buildingStatus: item.building_status, status: "excluded", rank: null, score: null, reason: text(item.exclusion_reason, `${field}.exclusion_reason`), reasonLabel: REASONS[item.exclusion_reason] ?? item.exclusion_reason, components: null, metrics: null };
    }
    const components = item.component_scores;
    const metrics = item.metrics;
    return { scenarioId: text(item.scenario_id, `${field}.scenario_id`), buildingId: text(item.building_id, `${field}.building_id`), buildingName: text(item.building_name, `${field}.building_name`), buildingStatus: item.building_status, status: "ranked", rank: finite(item.rank, `${field}.rank`), score: finite(item.score, `${field}.score`), components: { annualizedYield: finite(components?.annualized_yield, `${field}.component_scores.annualized_yield`), roofUtilization: finite(components?.roof_utilization, `${field}.component_scores.roof_utilization`), selfSufficiency: finite(components?.self_sufficiency, `${field}.component_scores.self_sufficiency`), gridReduction: finite(components?.grid_reduction, `${field}.component_scores.grid_reduction`), constraints: finite(components?.constraints, `${field}.component_scores.constraints`) }, metrics: { annualizedKwhPerKwp: finite(metrics?.annualized_kwh_per_kwp, `${field}.metrics.annualized_kwh_per_kwp`), roofUtilizationRatio: finite(metrics?.roof_utilization_ratio, `${field}.metrics.roof_utilization_ratio`), selfSufficiencyRatio: finite(metrics?.self_sufficiency_ratio, `${field}.metrics.self_sufficiency_ratio`), gridReductionRatio: finite(metrics?.grid_reduction_ratio, `${field}.metrics.grid_reduction_ratio`), constraintViolationCount: finite(metrics?.constraint_violation_count, `${field}.metrics.constraint_violation_count`) } };
  });
  const assumptions = value.assumptions ?? fail("assumptions", "object required");
  return { date, weatherPreset, ranked: entries.filter((item) => item.status === "ranked"), excluded: entries.filter((item) => item.status === "excluded"), statusByBuilding: Object.fromEntries(entries.map((item) => [item.buildingId, item.buildingStatus])), assumptions: { annualizationDays: finite(assumptions.annualization_days, "assumptions.annualization_days"), weights: assumptions.weights, demandQuality: text(assumptions.demand_quality, "assumptions.demand_quality"), weatherSource: text(assumptions.weather_source, "assumptions.weather_source"), comparability: assumptions.comparability } };
}

export function parseRecommendationResponse(value, expected = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("payload", "object required");
  const sourceScenarioId = text(value.source_scenario_id, "source_scenario_id");
  if (expected.sourceScenarioId !== undefined && sourceScenarioId !== expected.sourceScenarioId) {
    fail("source_scenario_id", "must match requested source scenario");
  }
  const scenario = value.scenario;
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) fail("scenario", "object required");
  return { id: text(scenario.id, "scenario.id"), buildingId: text(scenario.building_id, "scenario.building_id") };
}

export function recommendationScenarioRequest({ sourceScenarioId, date }) {
  return { sourceScenarioId: text(sourceScenarioId, "sourceScenarioId"), date: text(date, "date"), openMode: "new-editable-copy" };
}
