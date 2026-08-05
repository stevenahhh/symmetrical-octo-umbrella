import assert from "node:assert/strict";
import test from "node:test";
import { parseEnergyDashboardPayload } from "./energyDashboardApi.mjs";

function slot(index, overrides = {}) {
  const hour = String(Math.floor(index / 4)).padStart(2, "0");
  const minute = String((index % 4) * 15).padStart(2, "0");
  return {
    timestamp: `2026-05-18T${hour}:${minute}:00+09:00`,
    predicted_demand_energy_kwh: 921.7 / 96,
    generation_energy_kwh: index >= 28 && index < 72 ? 1 : 0,
    global_irradiance_w_m2: index >= 28 && index < 72 ? 650 : 0,
    self_consumption_energy_kwh: index >= 28 && index < 72 ? 1 : 0,
    grid_draw_energy_kwh: 921.7 / 96 - (index >= 28 && index < 72 ? 1 : 0),
    surplus_energy_kwh: 0,
    ...overrides,
  };
}

export function dashboardPayload(overrides = {}) {
  const intervals = Array.from({ length: 96 }, (_, index) => slot(index));
  return {
    building: { id: "D4", display_name: "D4 / 공대 3호관", timezone: "Asia/Seoul", demand_quality: "predicted", room_count: 69, roof_zone_count: 1 },
    scenario: { id: "D4-scenario-south-2x8", building_id: "D4", name: "D4 south 2x8 fixture", weather_preset: "clear", arrays: [{ id: "array-1", rows: 2, columns: 8, module_nominal_power_wp: 441 }] },
    demand: { building_id: "D4", date: "2026-05-18", interval_minutes: 15, timezone: "Asia/Seoul", quality: "predicted", assumption: { type: "simulation-assumption", quality: "predicted", calibration: "not-engineering-calibrated" }, intervals: intervals.map((item) => ({ timestamp: item.timestamp, predicted_demand_energy_kwh: item.predicted_demand_energy_kwh, predicted_demand_kw: (921.7 / 96) * 4, power_unit: "kW", energy_unit: "kWh", quality: "predicted" })), total_energy_kwh: 921.7 },
    simulation: { scenario_id: "D4-scenario-south-2x8", date: "2026-05-18", interval_minutes: 15, demand_quality: "predicted", weather_source: "scenario", generation_assumption: { type: "simulation-assumption", calibration: "not-engineering-calibrated", model: "deterministic-python-v1", system_loss_fraction: 0.1 }, intervals, arrays: [{ array_id: "array-1", module_count: 16, capacity_kwp: 7.056, intervals: [], total_generation_energy_kwh: 44 }], totals: { demand_energy_kwh: 921.7, generation_energy_kwh: 44, self_consumption_energy_kwh: 44, grid_draw_energy_kwh: 877.7, surplus_energy_kwh: 0 } },
    ...overrides,
  };
}

test("parses exact units and persistent synthetic provenance without inventing fields", () => {
  const parsed = parseEnergyDashboardPayload(dashboardPayload());
  assert.equal(parsed.chart.length, 96);
  assert.deepEqual(parsed.units, { energy: "kWh", power: "kW", irradiance: "W/m²" });
  assert.equal(parsed.provenance.demandLabel, "가상 예측");
  assert.equal(parsed.provenance.irradianceLabel, "시나리오/추정");
  assert.equal(parsed.kpis.surplusEnergyKwh, 0);
  assert.equal(parsed.losses.systemLossFraction, 0.1);
  assert.equal(parsed.losses.unreportedLossEnergyKwh, null);
});

test("parses seeded D3 without fabricating the D4 room breakdown", () => {
  const value = dashboardPayload();
  const total = 24;
  value.building = { ...value.building, id: "D3", display_name: "D3 / 공대 2호관", room_count: 1 };
  value.scenario = { ...value.scenario, id: "D3-scenario-campus-baseline", building_id: "D3", name: "D3 campus baseline" };
  value.demand = { ...value.demand, building_id: "D3", total_energy_kwh: total,
    intervals: value.demand.intervals.map((item) => ({ ...item, predicted_demand_kw: 1, predicted_demand_energy_kwh: 0.25 })) };
  value.simulation = { ...value.simulation, scenario_id: value.scenario.id,
    intervals: value.simulation.intervals.map((item) => ({ ...item, predicted_demand_energy_kwh: 0.25 })),
    totals: { ...value.simulation.totals, demand_energy_kwh: total } };

  const parsed = parseEnergyDashboardPayload(value);
  assert.equal(parsed.building.displayName, "D3 / 공대 2호관");
  assert.equal(parsed.provenance.demandLabel, "가상 예측");
  assert.equal(parsed.kpis.predictedDemandEnergyKwh, total);
  assert.deepEqual(parsed.roomTypes, []);
});

test("rejects mismatched building and simulation scenario identities", () => {
  for (const mutate of [
    (value) => { value.scenario.building_id = "D3"; },
    (value) => { value.demand.building_id = "D3"; },
    (value) => { value.simulation.scenario_id = "other-scenario"; },
  ]) {
    const value = dashboardPayload();
    mutate(value);
    assert.throws(
      () => parseEnergyDashboardPayload(value),
      (error) => error.code === "invalid_energy_dashboard_payload",
    );
  }
});

test("rejects malformed and misaligned payloads instead of fabricating zeros", () => {
  const malformed = dashboardPayload();
  malformed.simulation.intervals[4].timestamp = malformed.simulation.intervals[3].timestamp;
  assert.throws(() => parseEnergyDashboardPayload(malformed), (error) => error.code === "invalid_energy_dashboard_payload" && /timestamp/.test(error.field));
  const missing = dashboardPayload();
  missing.simulation.totals.generation_energy_kwh = undefined;
  assert.throws(() => parseEnergyDashboardPayload(missing), (error) => error.code === "invalid_energy_dashboard_payload");
  const nonfinite = dashboardPayload();
  nonfinite.simulation.intervals[2].generation_energy_kwh = Number.NaN;
  assert.throws(() => parseEnergyDashboardPayload(nonfinite), (error) => error.code === "invalid_energy_dashboard_payload");
});
