const WEATHER_PRESETS = new Set(["clear", "partly_cloudy", "overcast"]);
const TIMEZONE = "Asia/Seoul";
const INTERVAL_MINUTES = 15;
const GENERATION_MODEL = "deterministic-python-v1";

export class AnalysisContractError extends TypeError {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.name = "AnalysisContractError";
    this.code = "invalid_analysis_payload";
    this.field = field;
  }
}

const fail = (field, message) => { throw new AnalysisContractError(field, message); };
const record = (value, field) => value && typeof value === "object" && !Array.isArray(value) ? value : fail(field, "object required");
const text = (value, field) => typeof value === "string" && value.trim() ? value : fail(field, "text required");
const finite = (value, field) => typeof value === "number" && Number.isFinite(value) ? value : fail(field, "finite number required");
const nonnegative = (value, field) => { const parsed = finite(value, field); if (parsed < 0) fail(field, "nonnegative number required"); return parsed; };
const close = (first, second) => Math.abs(first - second) <= 1e-6;
const ratio = (numerator, denominator) => denominator === 0 ? 0 : numerator / denominator;

function parseRunIdentity(input, expected) {
  const id = text(input.id, "run.id");
  const buildingId = text(input.building_id, "run.building_id");
  if (expected.runId !== undefined && id !== expected.runId) fail("run.id", "must match the requested run ID");
  if (expected.buildingId !== undefined && buildingId !== expected.buildingId) fail("run.building_id", "must match the requested building");
  return { id, buildingId };
}

const CONDITION_CONTEXT_FIELDS = Object.freeze({
  demandSource: "demand_source",
  weatherPreset: "weather_preset",
  timezone: "timezone",
  intervalMinutes: "interval_minutes",
  generationModel: "generation_model",
  electricityPriceKrwPerKwh: "electricity_price_krw_per_kwh",
  carbonIntensityKgCo2ePerKwh: "carbon_intensity_kg_co2e_per_kwh",
});

function assertRunContext(run, expected) {
  if (expected.date !== undefined && run.date !== expected.date) fail("run.date", "must match the requested execution date");
  for (const [field, payloadField] of Object.entries(CONDITION_CONTEXT_FIELDS)) {
    if (expected.conditions?.[field] !== undefined && run.conditions[field] !== expected.conditions[field]) {
      fail(`run.conditions.${payloadField}`, "must match the requested execution conditions");
    }
  }
  return run;
}

function analysisDeltas(baseline, proposed, alternative, conditions) {
  const gridImportReductionEnergyKwh = baseline.gridImportEnergyKwh - proposed.gridImportEnergyKwh;
  return {
    generationEnergyKwh: proposed.generationEnergyKwh,
    gridImportReductionEnergyKwh,
    gridImportReductionRatio: ratio(baseline.gridImportEnergyKwh - proposed.gridImportEnergyKwh, baseline.gridImportEnergyKwh),
    selfSufficiencyRatio: ratio(proposed.directSolarUseEnergyKwh, proposed.demandEnergyKwh),
    selfConsumptionRatio: ratio(proposed.directSolarUseEnergyKwh, proposed.generationEnergyKwh),
    alternativeGenerationDifferenceEnergyKwh: alternative ? proposed.generationEnergyKwh - alternative.generationEnergyKwh : null,
    costSavingsKrw: gridImportReductionEnergyKwh * conditions.electricityPriceKrwPerKwh,
    carbonReductionKgCo2e: gridImportReductionEnergyKwh * conditions.carbonIntensityKgCo2ePerKwh,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function weatherPreset(value, field) {
  const preset = text(value, field);
  if (!WEATHER_PRESETS.has(preset)) fail(field, "known preset required");
  return preset;
}

function parsePlan(value, field) {
  const input = record(value, field);
  if (!Array.isArray(input.arrays)) fail(`${field}.arrays`, "array required");
  return {
    id: text(input.id, `${field}.id`),
    buildingId: text(input.building_id, `${field}.building_id`),
    name: text(input.name, `${field}.name`),
    arrays: input.arrays.length,
  };
}

function parseTotals(value, field) {
  const input = record(value, field);
  const totals = {
    demandEnergyKwh: nonnegative(input.demand_energy_kwh, `${field}.demand_energy_kwh`),
    generationEnergyKwh: nonnegative(input.generation_energy_kwh, `${field}.generation_energy_kwh`),
    gridImportEnergyKwh: nonnegative(input.grid_draw_energy_kwh, `${field}.grid_draw_energy_kwh`),
    directSolarUseEnergyKwh: nonnegative(input.self_consumption_energy_kwh, `${field}.self_consumption_energy_kwh`),
    surplusEnergyKwh: nonnegative(input.surplus_energy_kwh, `${field}.surplus_energy_kwh`),
  };
  if (!close(totals.demandEnergyKwh, totals.gridImportEnergyKwh + totals.directSolarUseEnergyKwh)) fail(field, "demand conservation required");
  if (!close(totals.generationEnergyKwh, totals.directSolarUseEnergyKwh + totals.surplusEnergyKwh)) fail(field, "generation conservation required");
  return totals;
}

export function analysisScenarioInput({ buildingId, name, representativePlanId, alternativePlanId = null, weatherPreset: preset, electricityPriceKrwPerKwh = 160, carbonIntensityKgCo2ePerKwh = 0.45 }) {
  return {
    building_id: text(buildingId, "buildingId"),
    name: text(name, "name"),
    representative_plan_id: text(representativePlanId, "representativePlanId"),
    alternative_plan_id: alternativePlanId ? text(alternativePlanId, "alternativePlanId") : null,
    baseline: "no_solar",
    conditions: {
      demand_source: "predicted",
      weather_preset: weatherPreset(preset, "weatherPreset"),
      electricity_price_krw_per_kwh: nonnegative(electricityPriceKrwPerKwh, "electricityPriceKrwPerKwh"),
      carbon_intensity_kg_co2e_per_kwh: nonnegative(carbonIntensityKgCo2ePerKwh, "carbonIntensityKgCo2ePerKwh"),
    },
  };
}

export function parseAnalysisScenario(value, expected = {}) {
  const input = record(value, "scenario");
  const conditions = record(input.conditions, "scenario.conditions");
  if (input.baseline !== "no_solar") fail("scenario.baseline", "no_solar required");
  if (conditions.demand_source !== "predicted") fail("scenario.conditions.demand_source", "predicted required");
  const representativePlanId = text(input.representative_plan_id, "scenario.representative_plan_id");
  const alternativePlanId = input.alternative_plan_id === null ? null : text(input.alternative_plan_id, "scenario.alternative_plan_id");
  if (alternativePlanId === representativePlanId) fail("scenario.alternative_plan_id", "must differ from representative plan");
  const scenario = {
    id: text(input.id, "scenario.id"),
    buildingId: text(input.building_id, "scenario.building_id"),
    name: text(input.name, "scenario.name"),
    representativePlanId,
    alternativePlanId,
    baseline: "no_solar",
    conditions: {
      demandSource: "predicted",
      weatherPreset: weatherPreset(conditions.weather_preset, "scenario.conditions.weather_preset"),
      electricityPriceKrwPerKwh: nonnegative(conditions.electricity_price_krw_per_kwh, "scenario.conditions.electricity_price_krw_per_kwh"),
      carbonIntensityKgCo2ePerKwh: nonnegative(conditions.carbon_intensity_kg_co2e_per_kwh, "scenario.conditions.carbon_intensity_kg_co2e_per_kwh"),
    },
    createdAt: text(input.created_at, "scenario.created_at"),
    updatedAt: text(input.updated_at, "scenario.updated_at"),
  };
  if (expected.buildingId !== undefined && scenario.buildingId !== expected.buildingId) fail("scenario.building_id", "must match the requested building");
  if (expected.scenarioId !== undefined && scenario.id !== expected.scenarioId) fail("scenario.id", "must match the requested scenario ID");
  return deepFreeze(scenario);
}

function parseDirectAnalysisRun(input, expected) {
  const { id, buildingId } = parseRunIdentity(input, expected);
  const installationPlanId = text(input.installation_plan_id, "run.installation_plan_id");
  const representative = parsePlan(input.installation_plan, "run.installation_plan");
  if (representative.id !== installationPlanId) fail("run.installation_plan", "must match installation_plan_id");
  if (representative.buildingId !== buildingId) fail("run.installation_plan", "must match building_id");

  const conditions = record(input.conditions, "run.conditions");
  const date = text(conditions.date, "run.conditions.date");
  const preset = weatherPreset(conditions.weather_preset, "run.conditions.weather_preset");
  if (conditions.timezone !== TIMEZONE) fail("run.conditions.timezone", `${TIMEZONE} required`);
  if (conditions.interval_minutes !== INTERVAL_MINUTES) fail("run.conditions.interval_minutes", `${INTERVAL_MINUTES} required`);
  if (conditions.generation_model !== GENERATION_MODEL) fail("run.conditions.generation_model", `${GENERATION_MODEL} required`);

  const result = record(input.result, "run.result");
  if (text(result.scenario_id, "run.result.scenario_id") !== installationPlanId) fail("run.result.scenario_id", "must match installation_plan_id");
  if (text(result.date, "run.result.date") !== date) fail("run.result.date", "must match run conditions");
  if (result.interval_minutes !== INTERVAL_MINUTES) fail("run.result.interval_minutes", `${INTERVAL_MINUTES} required`);
  if (result.demand_quality !== "predicted") fail("run.result.demand_quality", "predicted required");
  if (result.weather_source !== "scenario") fail("run.result.weather_source", "scenario required");
  const assumption = record(result.generation_assumption, "run.result.generation_assumption");
  if (assumption.model !== GENERATION_MODEL) fail("run.result.generation_assumption.model", `${GENERATION_MODEL} required`);

  const slots = Array.isArray(result.intervals) ? result.intervals : fail("run.result.intervals", "array required");
  if (slots.length !== 96) fail("run.result.intervals", "exactly 96 slots required");
  let previousTimestamp = "";
  const seen = new Set();
  const series = slots.map((candidate, index) => {
    const field = `run.result.intervals[${index}]`;
    const slot = record(candidate, field);
    const timestamp = text(slot.timestamp, `${field}.timestamp`);
    if (seen.has(timestamp)) fail(`${field}.timestamp`, "unique timestamp required");
    if (index > 0 && timestamp <= previousTimestamp) fail(`${field}.timestamp`, "ordered timestamp required");
    previousTimestamp = timestamp;
    seen.add(timestamp);
    const demandEnergyKwh = nonnegative(slot.predicted_demand_energy_kwh, `${field}.predicted_demand_energy_kwh`);
    const proposedGenerationEnergyKwh = nonnegative(slot.generation_energy_kwh, `${field}.generation_energy_kwh`);
    const directSolarUseEnergyKwh = nonnegative(slot.self_consumption_energy_kwh, `${field}.self_consumption_energy_kwh`);
    const gridImportEnergyKwh = nonnegative(slot.grid_draw_energy_kwh, `${field}.grid_draw_energy_kwh`);
    const surplusEnergyKwh = nonnegative(slot.surplus_energy_kwh, `${field}.surplus_energy_kwh`);
    if (!close(demandEnergyKwh, directSolarUseEnergyKwh + gridImportEnergyKwh)
        || !close(proposedGenerationEnergyKwh, directSolarUseEnergyKwh + surplusEnergyKwh)) fail(field, "energy conservation required");
    return {
      timestamp,
      demandEnergyKwh,
      irradianceWm2: nonnegative(slot.global_irradiance_w_m2, `${field}.global_irradiance_w_m2`),
      baselineGenerationEnergyKwh: 0,
      proposedGenerationEnergyKwh,
      alternativeGenerationEnergyKwh: null,
      gridImportEnergyKwh,
    };
  });

  const proposed = parseTotals(result.totals, "run.result.totals");
  const sum = (field) => series.reduce((total, slot) => total + slot[field], 0);
  if (!close(sum("demandEnergyKwh"), proposed.demandEnergyKwh)
      || !close(sum("proposedGenerationEnergyKwh"), proposed.generationEnergyKwh)
      || !close(sum("gridImportEnergyKwh"), proposed.gridImportEnergyKwh)) fail("run.result.intervals", "series totals must match reported totals");
  const baseline = {
    demandEnergyKwh: proposed.demandEnergyKwh,
    generationEnergyKwh: 0,
    gridImportEnergyKwh: proposed.demandEnergyKwh,
    directSolarUseEnergyKwh: 0,
    surplusEnergyKwh: 0,
  };
  const reportConditions = {
    demandSource: "predicted", weatherPreset: preset, timezone: TIMEZONE,
    intervalMinutes: INTERVAL_MINUTES, generationModel: GENERATION_MODEL,
    electricityPriceKrwPerKwh: conditions.electricity_price_krw_per_kwh === undefined
      ? 160 : nonnegative(conditions.electricity_price_krw_per_kwh, "run.conditions.electricity_price_krw_per_kwh"),
    carbonIntensityKgCo2ePerKwh: conditions.carbon_intensity_kg_co2e_per_kwh === undefined
      ? 0.45 : nonnegative(conditions.carbon_intensity_kg_co2e_per_kwh, "run.conditions.carbon_intensity_kg_co2e_per_kwh"),
  };
  return deepFreeze(assertRunContext({
    id,
    analysisScenarioId: null,
    buildingId,
    date,
    createdAt: text(input.created_at, "run.created_at"),
    conditions: reportConditions,
    plans: { representative, alternative: null },
    scenario: null,
    series,
    kpis: { baseline, proposed, alternative: null },
    deltas: analysisDeltas(baseline, proposed, null, reportConditions),
  }, expected));
}

/** Parse scenario comparison runs and compatibility direct runs into one immutable report shape. */
export function parseAnalysisRun(value, expected = {}) {
  const input = record(value, "run");
  const runType = text(input.run_type, "run.run_type");
  if (runType === "direct") return parseDirectAnalysisRun(input, expected);
  if (runType !== "scenario") fail("run.run_type", "direct or scenario required");
  const { id, buildingId } = parseRunIdentity(input, expected);
  const scenario = parseAnalysisScenario(input.scenario_snapshot);
  const scenarioId = text(input.analysis_scenario_id, "run.analysis_scenario_id");
  if (scenario.id !== scenarioId) fail("run.scenario_snapshot", "snapshot must match analysis_scenario_id");
  if (scenario.buildingId !== buildingId) fail("run.scenario_snapshot", "snapshot must match building_id");
  if (expected.scenarioId !== undefined && scenarioId !== expected.scenarioId) fail("run.analysis_scenario_id", "must match the requested scenario");

  const snapshots = record(input.plan_snapshots, "run.plan_snapshots");
  const representative = parsePlan(snapshots.representative, "run.plan_snapshots.representative");
  const alternative = snapshots.alternative === null ? null : parsePlan(snapshots.alternative, "run.plan_snapshots.alternative");
  if (representative.id !== scenario.representativePlanId || representative.buildingId !== buildingId) fail("run.plan_snapshots.representative", "must match scenario snapshot");
  if (scenario.alternativePlanId) {
    if (!alternative || alternative.id !== scenario.alternativePlanId || alternative.buildingId !== buildingId) fail("run.plan_snapshots.alternative", "must match scenario snapshot");
  } else if (alternative) fail("run.plan_snapshots.alternative", "must be null without an alternative");

  const slots = Array.isArray(input.intervals) ? input.intervals : fail("run.intervals", "array required");
  if (slots.length !== 96) fail("run.intervals", "exactly 96 slots required");
  const seen = new Set();
  let previousTimestamp = "";
  const series = slots.map((candidate, index) => {
    const slot = record(candidate, `run.intervals[${index}]`);
    const timestamp = text(slot.timestamp, `run.intervals[${index}].timestamp`);
    if (seen.has(timestamp)) fail(`run.intervals[${index}].timestamp`, "unique timestamp required");
    if (index > 0 && timestamp <= previousTimestamp) fail(`run.intervals[${index}].timestamp`, "ordered timestamp required");
    previousTimestamp = timestamp;
    seen.add(timestamp);
    const demandEnergyKwh = nonnegative(slot.predicted_demand_energy_kwh, `run.intervals[${index}].predicted_demand_energy_kwh`);
    const baselineGenerationEnergyKwh = nonnegative(slot.baseline_generation_energy_kwh, `run.intervals[${index}].baseline_generation_energy_kwh`);
    if (baselineGenerationEnergyKwh !== 0) fail(`run.intervals[${index}].baseline_generation_energy_kwh`, "zero required");
    const proposedGenerationEnergyKwh = nonnegative(slot.proposed_generation_energy_kwh, `run.intervals[${index}].proposed_generation_energy_kwh`);
    const alternativeGenerationEnergyKwh = slot.alternative_generation_energy_kwh === null ? null : nonnegative(slot.alternative_generation_energy_kwh, `run.intervals[${index}].alternative_generation_energy_kwh`);
    if (Boolean(alternative) !== (alternativeGenerationEnergyKwh !== null)) fail(`run.intervals[${index}].alternative_generation_energy_kwh`, "must match alternative snapshot");
    return {
      timestamp,
      demandEnergyKwh,
      irradianceWm2: nonnegative(slot.global_irradiance_w_m2, `run.intervals[${index}].global_irradiance_w_m2`),
      baselineGenerationEnergyKwh,
      proposedGenerationEnergyKwh,
      alternativeGenerationEnergyKwh,
      gridImportEnergyKwh: Math.max(demandEnergyKwh - proposedGenerationEnergyKwh, 0),
    };
  });

  const rawTotals = record(input.totals, "run.totals");
  const baseline = parseTotals(rawTotals.baseline, "run.totals.baseline");
  const proposed = parseTotals(rawTotals.proposed, "run.totals.proposed");
  const alternateTotals = rawTotals.alternative === null ? null : parseTotals(rawTotals.alternative, "run.totals.alternative");
  if (Boolean(alternative) !== Boolean(alternateTotals)) fail("run.totals.alternative", "must match alternative snapshot");
  const sum = (field) => series.reduce((total, slot) => total + slot[field], 0);
  if (!close(sum("demandEnergyKwh"), proposed.demandEnergyKwh)
      || !close(sum("proposedGenerationEnergyKwh"), proposed.generationEnergyKwh)
      || !close(sum("gridImportEnergyKwh"), proposed.gridImportEnergyKwh)) fail("run.intervals", "series totals must match reported totals");
  if (alternateTotals && !close(sum("alternativeGenerationEnergyKwh"), alternateTotals.generationEnergyKwh)) fail("run.intervals", "alternative series totals must match reported totals");
  if (!close(baseline.generationEnergyKwh, 0) || !close(baseline.gridImportEnergyKwh, baseline.demandEnergyKwh)) fail("run.totals.baseline", "no-solar baseline required");

  const reportConditions = { ...scenario.conditions, timezone: TIMEZONE, intervalMinutes: INTERVAL_MINUTES, generationModel: GENERATION_MODEL };
  const deltas = analysisDeltas(baseline, proposed, alternateTotals, reportConditions);
  return deepFreeze(assertRunContext({
    id,
    analysisScenarioId: scenarioId,
    buildingId,
    date: text(input.date, "run.date"),
    createdAt: text(input.created_at, "run.created_at"),
    conditions: reportConditions,
    plans: { representative, alternative },
    scenario,
    series,
    kpis: { baseline, proposed, alternative: alternateTotals },
    deltas,
  }, expected));
}

/** Analysis runs are already atomic comparison reports; retain this helper for consumers. */
export function buildAnalysisReport(run) {
  return record(run, "run");
}

export function buildAnalysisInsights(report) {
  record(report, "report");
  const insights = [];
  if (report.kpis.alternative) {
    const difference = report.deltas.alternativeGenerationDifferenceEnergyKwh;
    insights.push({ id: "plan-comparison", tone: difference >= 0 ? "positive" : "attention", message: difference >= 0
      ? `대표 계획은 대안보다 ${difference.toFixed(1)} kWh 더 발전합니다.`
      : `대안 계획은 대표 계획보다 ${Math.abs(difference).toFixed(1)} kWh 더 발전합니다.` });
  } else insights.push({ id: "plan-comparison", tone: "neutral", message: "대표 계획을 무태양광 기준선과 비교했습니다." });
  insights.push(report.deltas.selfSufficiencyRatio < 0.2
    ? { id: "self-sufficiency", tone: "attention", message: "대표 계획 자급률이 20% 미만입니다." }
    : { id: "self-sufficiency", tone: "positive", message: `대표 계획 자급률은 ${(report.deltas.selfSufficiencyRatio * 100).toFixed(1)}%입니다.` });
  insights.push({
    id: "cost-carbon", tone: "positive",
    message: `계통전력 절감량에 ${report.conditions.electricityPriceKrwPerKwh.toLocaleString("ko-KR")} KRW/kWh와 ${report.conditions.carbonIntensityKgCo2ePerKwh} kgCO2/kWh를 적용하면 비용 ${Math.round(report.deltas.costSavingsKrw).toLocaleString("ko-KR")}원, 탄소 ${report.deltas.carbonReductionKgCo2e.toFixed(1)} kgCO2를 줄입니다.`,
  });
  if (report.kpis.proposed.surplusEnergyKwh > 0) insights.push({ id: "surplus", tone: "neutral", message: `잉여 발전은 ${report.kpis.proposed.surplusEnergyKwh.toFixed(1)} kWh입니다.` });
  return deepFreeze(insights);
}
