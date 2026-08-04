import assert from "node:assert/strict";
import test from "node:test";
import { D4_BUILDING_DATA, D4_ROOMS } from "./d4Campus.mjs";
import { calculateBuildingDemand } from "./demand.mjs";
import { EnergyBalanceInputError, calculateEnergyBalance } from "./energyBalance.mjs";
import { calculateLayoutGeneration } from "./generation.mjs";

const demandProvenance = Object.freeze({ quality: "predicted", assumption: { type: "simulation-assumption", calibration: "not-engineering-calibrated" } });
const weatherProvenance = Object.freeze({ source: "scenario", weatherScenarioId: "weather-test", locationId: "scnu", timeZone: "Asia/Seoul", qualityText: "Scenario weather; not measured." });
const slotProvenance = Object.freeze({ source: "scenario", qualityText: "Scenario weather; not measured.", fieldSources: { global_irradiance_w_m2: "scenario_solar_model" } });
const rates = Object.freeze({ electricityPriceKrwPerKwh: 160, carbonIntensityKgCo2ePerKwh: 0.45 });

function timestamp(index, date = "2026-05-18") {
  const hour = String(Math.floor(index / 4)).padStart(2, "0");
  const minute = String((index % 4) * 15).padStart(2, "0");
  return `${date}T${hour}:${minute}:00+09:00`;
}

function input(demandValues, generationValues, options = {}) {
  const demandTimestamps = options.demandTimestamps ?? demandValues.map((_, index) => timestamp(index));
  const generationTimestamps = options.generationTimestamps ?? generationValues.map((_, index) => timestamp(index));
  return {
    demand: { intervalMinutes: 15, energyUnit: "kWh", ...demandProvenance,
      slots: demandValues.map((energyKwh, index) => ({ timestamp: demandTimestamps[index], energyKwh })) },
    generation: { intervalMinutes: 15, energyUnit: "kWh", provenance: weatherProvenance,
      slots: generationValues.map((energyKwh, index) => ({ timestamp: generationTimestamps[index], energyKwh, provenance: slotProvenance })) },
    rates,
  };
}

test("calculates equal, deficit, surplus, and explicit zero-denominator slots", () => {
  const result = calculateEnergyBalance(input([4, 5, 2, 0], [4, 2, 5, 0]));
  assert.equal(result.status, "complete");
  assert.deepEqual(result.slots.map((slot) => ({
    generation: slot.generationEnergyKwh, demand: slot.predictedDemandEnergyKwh,
    direct: slot.directSolarUseEnergyKwh, grid: slot.gridImportEnergyKwh,
    surplus: slot.surplusEnergyKwh, selfSufficiency: slot.selfSufficiencyRatio,
    solarUtilization: slot.solarUtilizationRatio,
  })), [
    { generation: 4, demand: 4, direct: 4, grid: 0, surplus: 0, selfSufficiency: 1, solarUtilization: 1 },
    { generation: 2, demand: 5, direct: 2, grid: 3, surplus: 0, selfSufficiency: 0.4, solarUtilization: 1 },
    { generation: 5, demand: 2, direct: 2, grid: 0, surplus: 3, selfSufficiency: 1, solarUtilization: 0.4 },
    { generation: 0, demand: 0, direct: 0, grid: 0, surplus: 0, selfSufficiency: 0, solarUtilization: 0 },
  ]);
  assert.equal(result.slots[1].savingsKrw, 320);
  assert.equal(result.slots[1].carbonAvoidedKgCo2e, 0.9);
});

test("preserves demand and weather provenance on every complete result and slot", () => {
  const result = calculateEnergyBalance(input([1], [2]));
  assert.deepEqual(result.demandProvenance, demandProvenance);
  assert.deepEqual(result.weatherProvenance, weatherProvenance);
  assert.deepEqual(result.slots[0].demandProvenance, demandProvenance);
  assert.deepEqual(result.slots[0].weatherProvenance, slotProvenance);
  assert.deepEqual(result.rates, rates);
});

test("returns typed incomplete-series results for missing, duplicate canonical, or shifted timestamps", () => {
  const cases = [
    [input([], []), "empty_energy_series"],
    [input([1], [1, 2]), "missing_demand_slot"],
    [input([1, 2], [1]), "missing_generation_slot"],
    [input([1, 2], [1, 2], { demandTimestamps: ["2026-05-18T00:00+09:00", "2026-05-17T15:00:00Z"] }), "duplicate_demand_instant"],
    [input([1, 2], [1, 2], { generationTimestamps: [timestamp(0), timestamp(0)] }), "duplicate_generation_instant"],
    [input([1], [1], { demandTimestamps: [timestamp(0)], generationTimestamps: [timestamp(1)] }), "missing_generation_slot"],
  ];
  for (const [value, code] of cases) {
    const result = calculateEnergyBalance(value);
    assert.equal(result.status, "incomplete");
    assert.equal(result.code, "incomplete_energy_series");
    assert.ok(result.issues.some((issue) => issue.code === code));
    assert.deepEqual(result.demandProvenance, demandProvenance);
    assert.deepEqual(result.weatherProvenance, weatherProvenance);
    assert.equal("slots" in result, false);
  }
});

test("aligns real task-2 and task-7 timestamp spellings by canonical instant", () => {
  const task2 = calculateBuildingDemand({ ...D4_BUILDING_DATA, rooms: D4_ROOMS }, "2026-05-18");
  const generation = calculateLayoutGeneration({
    scenario: { id: "integration", arrays: [{ id: "one", rows: 1, columns: 1, azimuthDeg: 180, tiltDeg: 0 }] },
    weatherSeries: { status: "available", source: "scenario", scenario_id: "weather-integration", location_id: "scnu",
      timezone: "Asia/Seoul", quality_text: "Scenario weather; not measured.", intervals: [{
        timestamp: "2026-05-18T00:00:00+09:00", ambient_temperature_c: 20, global_irradiance_w_m2: 0,
        cloud_factor: 0, solar_altitude_deg: -10, source: "scenario", quality_text: "Scenario weather; not measured.",
        field_sources: { global_irradiance_w_m2: "scenario_solar_model" },
      }] },
  });
  const value = input([task2.slots[0].energyKwh], [generation.slots[0].energyKwh], {
    demandTimestamps: [task2.slots[0].intervalKey], generationTimestamps: [generation.slots[0].timestamp],
  });
  value.generation.provenance = generation.provenance;
  value.generation.slots[0].provenance = generation.slots[0].provenance;
  const result = calculateEnergyBalance(value);
  assert.equal(result.status, "complete");
  assert.equal(result.slots[0].demandTimestamp, "2026-05-18T00:00+09:00");
  assert.equal(result.slots[0].generationTimestamp, "2026-05-18T00:00:00+09:00");
  assert.equal(result.slots[0].timestamp, "2026-05-17T15:00:00.000Z");
});

test("aligns equivalent offsets across a local-date boundary without changing daily provenance", () => {
  const result = calculateEnergyBalance(input([2], [1], {
    demandTimestamps: ["2026-05-18T00:00+09:00"], generationTimestamps: ["2026-05-17T15:00:00Z"],
  }));
  assert.equal(result.status, "complete");
  assert.equal(result.slots[0].timestamp, "2026-05-17T15:00:00.000Z");
  assert.equal(result.daily[0].period, "2026-05-18");
});

test("uses summed energies for weighted daily and monthly ratios", () => {
  const timestamps = [timestamp(0, "2026-05-31"), timestamp(1, "2026-05-31"), timestamp(0, "2026-06-01")];
  const result = calculateEnergyBalance(input([1, 9, 10], [1, 0, 5], { demandTimestamps: timestamps, generationTimestamps: timestamps }));
  assert.equal(result.daily[0].selfSufficiencyRatio, 0.1);
  assert.equal(result.daily[0].solarUtilizationRatio, 1);
  assert.equal(result.monthly[0].selfSufficiencyRatio, 0.1);
  assert.equal(result.monthly[1].selfSufficiencyRatio, 0.5);
  assert.equal(result.totals.selfSufficiencyRatio, 6 / 20);
  assert.notEqual(result.totals.selfSufficiencyRatio, (1 + 0 + 0.5) / 3);
});

test("maintains exact per-slot conservation and deterministic timestamp order", () => {
  const value = input([4, 2, 3], [3, 1, 5], {
    demandTimestamps: [timestamp(2), timestamp(0), timestamp(1)],
    generationTimestamps: [timestamp(1), timestamp(2), timestamp(0)],
  });
  const result = calculateEnergyBalance(value);
  assert.deepEqual(result.slots.map(({ demandTimestamp: value }) => value), [timestamp(0), timestamp(1), timestamp(2)]);
  for (const slot of result.slots) {
    assert.equal(slot.predictedDemandEnergyKwh, slot.directSolarUseEnergyKwh + slot.gridImportEnergyKwh);
    assert.equal(slot.generationEnergyKwh, slot.directSolarUseEnergyKwh + slot.surplusEnergyKwh);
  }
  assert.equal(result.totals.predictedDemandEnergyKwh, result.totals.directSolarUseEnergyKwh + result.totals.gridImportEnergyKwh);
  assert.equal(result.totals.generationEnergyKwh, result.totals.directSolarUseEnergyKwh + result.totals.surplusEnergyKwh);
});

test("rejects nonfinite, negative, malformed, non-15-minute, and wrong-unit input", () => {
  const cases = [
    [() => { const value = input([1], [1]); value.demand.slots[0].energyKwh = NaN; return value; }, "finite_number"],
    [() => input([-1], [1]), "nonnegative_energy"],
    [() => { const value = input([1], [1]); value.generation.slots[0].timestamp = "bad"; return value; }, "iso_timestamp"],
    [() => { const value = input([1], [1]); value.generation.slots[0].timestamp = "2026-02-30T00:00:00+09:00"; return value; }, "iso_timestamp"],
    [() => { const value = input([1], [1]); value.generation.slots[0].timestamp = "2026-05-18T00:01:00+09:00"; return value; }, "timestamp_interval"],
    [() => { const value = input([1], [1]); value.demand.intervalMinutes = 30; return value; }, "interval_minutes"],
    [() => { const value = input([1], [1]); value.generation.energyUnit = "kW"; return value; }, "energy_unit"],
    [() => { const value = input([1], [1]); value.rates = { ...rates, electricityPriceKrwPerKwh: Infinity }; return value; }, "finite_number"],
  ];
  for (const [build, code] of cases) {
    assert.throws(() => calculateEnergyBalance(build()), (error) => error instanceof EnergyBalanceInputError && error.code === code);
  }
});

test("rejects overflow in aggregate energies and per-slot or aggregate monetary/carbon products", () => {
  const maximum = Number.MAX_VALUE;
  const cases = [
    input([maximum, maximum], [0, 0]),
    { ...input([2], [2]), rates: { ...rates, electricityPriceKrwPerKwh: maximum } },
    { ...input([2], [2]), rates: { ...rates, carbonIntensityKgCo2ePerKwh: maximum } },
    { ...input([maximum / 2, maximum / 2], [maximum / 2, maximum / 2]),
      rates: { electricityPriceKrwPerKwh: 1.5, carbonIntensityKgCo2ePerKwh: 1.5 } },
  ];
  for (const value of cases) {
    assert.throws(() => calculateEnergyBalance(value), (error) => error instanceof EnergyBalanceInputError
      && error.code === "numeric_overflow" && error.field.length > 0);
  }
});

test("complete results contain no non-finite numeric values", () => {
  const result = calculateEnergyBalance(input([4, 5, 0], [2, 7, 0]));
  const numbers = [];
  const collect = (value) => {
    if (typeof value === "number") numbers.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(result);
  assert.ok(numbers.length > 0);
  assert.ok(numbers.every(Number.isFinite));
  assert.doesNotMatch(JSON.stringify(result), /null/);
});

test("does not mutate inputs or retain stale state between calls", () => {
  const value = input([1, 2], [2, 1]);
  const snapshot = structuredClone(value);
  const first = calculateEnergyBalance(value);
  const second = calculateEnergyBalance(value);
  assert.deepEqual(value, snapshot);
  assert.deepEqual(first, second);
  first.slots[0].weatherProvenance.fieldSources.global_irradiance_w_m2 = "changed";
  assert.deepEqual(value, snapshot);
  assert.notDeepEqual(first, second);
});
