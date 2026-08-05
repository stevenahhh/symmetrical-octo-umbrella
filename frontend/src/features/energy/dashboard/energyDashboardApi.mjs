import { calculateEnergyBalance } from "../domain/energyBalance.mjs";
import { calculateBuildingDemand } from "../domain/demand.mjs";
import { D4_BUILDING_DATA, D4_ROOMS } from "../domain/d4Campus.mjs";

export const DASHBOARD_RATES = Object.freeze({ electricityPriceKrwPerKwh: 160, carbonIntensityKgCo2ePerKwh: 0.45 });

export class EnergyDashboardContractError extends TypeError {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.name = "EnergyDashboardContractError";
    this.code = "invalid_energy_dashboard_payload";
    this.field = field;
  }
}
const fail = (field, message) => { throw new EnergyDashboardContractError(field, message); };
const object = (value, field) => value && typeof value === "object" && !Array.isArray(value) ? value : fail(field, "object required");
const array = (value, field) => Array.isArray(value) ? value : fail(field, "array required");
const finite = (value, field) => typeof value === "number" && Number.isFinite(value) ? value : fail(field, "finite number required");
const text = (value, field) => typeof value === "string" && value.length ? value : fail(field, "text required");

function assertSlots(demand, simulation) {
  const demandSlots = array(demand.intervals, "demand.intervals");
  const simulationSlots = array(simulation.intervals, "simulation.intervals");
  if (demandSlots.length !== 96 || simulationSlots.length !== 96) fail("intervals", "exactly 96 aligned slots required");
  const seen = new Set();
  return simulationSlots.map((slot, index) => {
    object(slot, `simulation.intervals[${index}]`);
    const timestamp = text(slot.timestamp, `simulation.intervals[${index}].timestamp`);
    if (timestamp !== demandSlots[index]?.timestamp || seen.has(timestamp)) fail(`simulation.intervals[${index}].timestamp`, "ordered unique timestamp must align with demand");
    seen.add(timestamp);
    return {
      timestamp,
      predictedDemandEnergyKwh: finite(slot.predicted_demand_energy_kwh, `simulation.intervals[${index}].predicted_demand_energy_kwh`),
      generationEnergyKwh: finite(slot.generation_energy_kwh, `simulation.intervals[${index}].generation_energy_kwh`),
      irradianceWm2: finite(slot.global_irradiance_w_m2, `simulation.intervals[${index}].global_irradiance_w_m2`),
    };
  });
}

function roomTypeBreakdown(date, expectedTotal) {
  const building = calculateBuildingDemand({ ...D4_BUILDING_DATA, rooms: D4_ROOMS }, date);
  if (Math.abs(building.totalEnergyKwh - expectedTotal) > 1e-6) fail("demand.total_energy_kwh", "does not match the shared D4 demand model");
  const labels = { classroom: "강의실", computer_lab: "컴퓨터실", lab: "실험·프로젝트실", faculty: "교수·조교실", server: "서버실" };
  const grouped = new Map();
  for (const room of building.rooms) {
    const type = D4_ROOMS.find((candidate) => candidate.id === room.roomId).specialType;
    grouped.set(type, (grouped.get(type) ?? 0) + room.totalEnergyKwh);
  }
  return [...grouped].map(([type, energyKwh]) => ({ type, label: labels[type], energyKwh }));
}

export function parseEnergyDashboardPayload(value) {
  const payload = object(value, "payload");
  const building = object(payload.building, "building");
  const scenario = object(payload.scenario, "scenario");
  const demand = object(payload.demand, "demand");
  const simulation = object(payload.simulation, "simulation");
  if (building.id !== scenario.building_id || building.id !== demand.building_id) fail("building.id", "building references must match");
  if (scenario.id !== simulation.scenario_id) fail("simulation.scenario_id", "must match scenario.id");
  if (demand.quality !== "predicted" || simulation.demand_quality !== "predicted") fail("demand.quality", "predicted provenance required");
  if (simulation.weather_source !== "scenario") fail("simulation.weather_source", "scenario provenance required");
  if (demand.interval_minutes !== 15 || simulation.interval_minutes !== 15) fail("interval_minutes", "15 required");
  if (String(demand.date) !== String(simulation.date)) fail("date", "demand and simulation dates must match");
  const slots = assertSlots(demand, simulation);
  const totals = object(simulation.totals, "simulation.totals");
  const expectedDemand = finite(totals.demand_energy_kwh, "simulation.totals.demand_energy_kwh");
  const expectedGeneration = finite(totals.generation_energy_kwh, "simulation.totals.generation_energy_kwh");
  for (const key of ["self_consumption_energy_kwh", "grid_draw_energy_kwh", "surplus_energy_kwh"]) finite(totals[key], `simulation.totals.${key}`);
  const assumption = object(demand.assumption, "demand.assumption");
  const generationAssumption = object(simulation.generation_assumption, "simulation.generation_assumption");
  const balance = calculateEnergyBalance({
    demand: { intervalMinutes: 15, energyUnit: "kWh", quality: "predicted", assumption, slots: slots.map((item) => ({ timestamp: item.timestamp, energyKwh: item.predictedDemandEnergyKwh })) },
    generation: { intervalMinutes: 15, energyUnit: "kWh", provenance: { source: "scenario", label: "시나리오/추정" }, slots: slots.map((item) => ({ timestamp: item.timestamp, energyKwh: item.generationEnergyKwh, provenance: { source: "scenario", label: "시나리오/추정" } })) },
    rates: DASHBOARD_RATES,
  });
  if (balance.status !== "complete") fail("intervals", "complete energy balance required");
  if (Math.abs(balance.totals.predictedDemandEnergyKwh - expectedDemand) > 1e-6 || Math.abs(balance.totals.generationEnergyKwh - expectedGeneration) > 1e-6) fail("simulation.totals", "totals do not match intervals");
  const systemLossFraction = finite(generationAssumption.system_loss_fraction, "generation_assumption.system_loss_fraction");
  return {
    building: { id: text(building.id, "building.id"), displayName: text(building.display_name, "building.display_name"), timezone: text(building.timezone, "building.timezone"), roomCount: finite(building.room_count, "building.room_count"), roofZoneCount: finite(building.roof_zone_count, "building.roof_zone_count") },
    scenario: { id: text(scenario.id, "scenario.id"), name: text(scenario.name, "scenario.name"), weatherPreset: text(scenario.weather_preset, "scenario.weather_preset"), arrayCount: array(scenario.arrays, "scenario.arrays").length },
    scenarios: Array.isArray(payload.summaries) ? payload.summaries.map((item, index) => {
      if (item.building_id !== building.id) fail(`summaries[${index}].building_id`, "must match building.id");
      return { id: text(item.id, `summaries[${index}].id`), label: text(item.name, `summaries[${index}].name`) };
    }) : [{ id: scenario.id, label: scenario.name }],
    date: String(simulation.date), units: { energy: "kWh", power: "kW", irradiance: "W/m²" },
    provenance: { demandLabel: "가상 예측", irradianceLabel: "시나리오/추정", demandQuality: "predicted", weatherSource: "scenario", calibration: generationAssumption.calibration, model: generationAssumption.model },
    chart: slots, balance, kpis: { predictedDemandEnergyKwh: balance.totals.predictedDemandEnergyKwh, generationEnergyKwh: balance.totals.generationEnergyKwh, directSolarUseEnergyKwh: balance.totals.directSolarUseEnergyKwh, gridImportEnergyKwh: balance.totals.gridImportEnergyKwh, surplusEnergyKwh: balance.totals.surplusEnergyKwh, selfSufficiencyRatio: balance.totals.selfSufficiencyRatio, solarUtilizationRatio: balance.totals.solarUtilizationRatio, savingsKrw: balance.totals.savingsKrw, carbonAvoidedKgCo2e: balance.totals.carbonAvoidedKgCo2e },
    losses: { systemLossFraction, unreportedLossEnergyKwh: null },
    roomTypes: building.id === "D4" ? roomTypeBreakdown(String(demand.date), expectedDemand) : [], rates: DASHBOARD_RATES,
  };
}

async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.detail?.message_ko ?? body?.detail?.message_en ?? `에너지 API 요청 실패 (HTTP ${response.status})`;
    const error = new Error(message); error.status = response.status; throw error;
  }
  return body;
}

export function createEnergyDashboardClient(apiBase = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000", fetchImpl = fetch) {
  const get = (path, signal) => fetchImpl(`${apiBase}${path}`, { headers: { Accept: "application/json" }, signal }).then(json);
  return { async load({ buildingId, date, scenarioId, signal }) {
    const [building, summaries] = await Promise.all([get(`/energy/buildings/${encodeURIComponent(buildingId)}`, signal), get(`/energy/buildings/${encodeURIComponent(buildingId)}/scenarios`, signal)]);
    if (building?.id !== buildingId) fail("building.id", "must match requested building ID");
    if (!Array.isArray(summaries)) fail("summaries", "array required");
    if (summaries.some((item) => item?.building_id !== buildingId)) fail("summaries.building_id", "must match requested building ID");
    if (!summaries.length) return null;
    const selectedId = summaries.some((item) => item.id === scenarioId) ? scenarioId : summaries[0].id;
    const [demand, scenario, simulation] = await Promise.all([
      get(`/energy/buildings/${encodeURIComponent(buildingId)}/demand?date=${encodeURIComponent(date)}`, signal),
      get(`/energy/scenarios/${encodeURIComponent(selectedId)}`, signal),
      fetchImpl(`${apiBase}/energy/scenarios/${encodeURIComponent(selectedId)}/simulate`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ date }), signal }).then(json),
    ]);
    if (scenario?.id !== selectedId) fail("scenario.id", "must match selected scenario ID");
    if (scenario?.building_id !== buildingId || demand?.building_id !== buildingId) fail("building.id", "response resources must match requested building ID");
    if (simulation?.scenario_id !== selectedId) fail("simulation.scenario_id", "must match selected scenario ID");
    if (String(demand?.date) !== String(date)) fail("demand.date", "must match requested date");
    if (String(simulation?.date) !== String(date)) fail("simulation.date", "must match requested date");
    return { building, summaries, scenario, demand, simulation };
  } };
}
