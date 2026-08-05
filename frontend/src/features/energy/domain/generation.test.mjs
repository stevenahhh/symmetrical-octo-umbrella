import assert from "node:assert/strict";
import test from "node:test";
import { calculateMayPvOutput } from "../../../utils/pvMath.mjs";
import {
  GenerationInputError,
  calculateLayoutGeneration,
} from "./generation.mjs";

const closeTo = (actual, expected, tolerance = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function panelArray(overrides = {}) {
  return {
    id: "array-1",
    rows: 1,
    columns: 1,
    azimuthDeg: 180,
    tiltDeg: 0,
    ...overrides,
  };
}

function weatherSlot(timestamp, overrides = {}) {
  return {
    timestamp,
    ambient_temperature_c: -10,
    global_irradiance_w_m2: 1000,
    cloud_factor: 0.25,
    solar_altitude_deg: 90,
    source: "scenario",
    quality_text: "Deterministic test scenario; not observed weather.",
    field_sources: {
      ambient_temperature_c: "scenario_preset",
      cloud_factor: "scenario_preset",
      global_irradiance_w_m2: "scenario_solar_model",
    },
    ...overrides,
  };
}

function weatherSeries(intervals, overrides = {}) {
  return {
    status: "available",
    source: "scenario",
    scenario_id: "weather-clear-test",
    location_id: "scnu",
    timezone: "Asia/Seoul",
    quality_text: "Deterministic test scenario; not observed weather.",
    intervals,
    error_code: null,
    ...overrides,
  };
}

function generate({ arrays = [panelArray()], slots, ...options } = {}) {
  return calculateLayoutGeneration({
    scenario: { id: "layout-test", arrays },
    weatherSeries: weatherSeries(slots ?? [weatherSlot("2026-05-15T12:00:00+09:00")]),
    ...options,
  });
}

test("retains the old May output as a compatibility baseline", () => {
  const baseline = calculateMayPvOutput({
    roofArea: 2.205,
    roofRatio: 100,
    moduleEfficiency: 20,
    systemLoss: 0,
  });

  closeTo(baseline.nominalPowerKw, 0.441);
  closeTo(baseline.monthlyOutput, 75.67119, 1e-10);
});

test("applies interval irradiance, temperature, and default 10% system loss exactly once", () => {
  const result = generate();
  const array = result.arrays[0];
  const slot = array.slots[0];

  assert.equal(array.moduleCount, 1);
  assert.equal(array.capacityKwp, 0.441);
  closeTo(slot.poaIrradianceKwhM2, 0.25);
  closeTo(slot.cellTemperatureC, 21.25);
  assert.deepEqual(slot.factorBreakdown, {
    incidenceFactor: 1,
    temperatureFactor: 1,
    systemLossFactor: 0.9,
    shadingFactor: 1,
  });
  closeTo(slot.energyKwh, 0.099225);

  const noLoss = generate({ systemLossFraction: 0 });
  closeTo(result.totalEnergyKwh / noLoss.totalEnergyKwh, 0.9);
});

test("returns zero at night, for zero irradiance, and for 100% shade", () => {
  const slots = [
    weatherSlot("2026-05-15T00:00:00+09:00", { solar_altitude_deg: -20 }),
    weatherSlot("2026-05-15T00:15:00+09:00", { global_irradiance_w_m2: 0 }),
  ];
  const unshaded = generate({ slots });
  const fullyShaded = generate({
    shadingFactorsByArrayId: { "array-1": 0 },
  });

  assert.deepEqual(unshaded.arrays[0].slots.map(({ energyKwh }) => energyKwh), [0, 0]);
  assert.equal(fullyShaded.totalEnergyKwh, 0);
  assert.equal(fullyShaded.arrays[0].slots[0].factorBreakdown.shadingFactor, 0);
});

test("scales generation proportionally with module count", () => {
  const oneModule = generate();
  const sixteenModules = generate({ arrays: [panelArray({ rows: 2, columns: 8 })] });

  assert.equal(sixteenModules.arrays[0].moduleCount, 16);
  assert.equal(sixteenModules.arrays[0].capacityKwp, 7.056);
  closeTo(sixteenModules.totalEnergyKwh, oneModule.totalEnergyKwh * 16);
});

test("reduces output for off-axis, overheated, and shaded arrays", () => {
  const mildMorning = weatherSlot("2026-05-15T09:00:00+09:00", {
    ambient_temperature_c: 10,
    global_irradiance_w_m2: 800,
    solar_altitude_deg: 30,
  });
  const aligned = generate({ arrays: [panelArray({ azimuthDeg: 90, tiltDeg: 45 })], slots: [mildMorning] });
  const offAxis = generate({ arrays: [panelArray({ azimuthDeg: 270, tiltDeg: 45 })], slots: [mildMorning] });
  const overheated = generate({
    arrays: [panelArray({ azimuthDeg: 90, tiltDeg: 45 })],
    slots: [weatherSlot("2026-05-15T09:00:00+09:00", {
      ambient_temperature_c: 55,
      global_irradiance_w_m2: 800,
      solar_altitude_deg: 30,
    })],
  });
  const shaded = generate({
    arrays: [panelArray({ azimuthDeg: 90, tiltDeg: 45 })],
    slots: [mildMorning],
    shadingFactorsByArrayId: { "array-1": 0.4 },
  });

  assert.ok(offAxis.totalEnergyKwh < aligned.totalEnergyKwh);
  assert.ok(overheated.totalEnergyKwh < aligned.totalEnergyKwh);
  assert.ok(shaded.totalEnergyKwh < aligned.totalEnergyKwh);
  closeTo(shaded.totalEnergyKwh / aligned.totalEnergyKwh, 0.4);
});

test("scenario totals equal array sums and never contain NaN or negative energy", () => {
  const result = generate({
    arrays: [panelArray({ id: "east", azimuthDeg: 90 }), panelArray({ id: "west", rows: 2, azimuthDeg: 270 })],
    slots: [
      weatherSlot("2026-05-15T09:00:00+09:00", { solar_altitude_deg: 35 }),
      weatherSlot("2026-05-15T09:15:00+09:00", { solar_altitude_deg: 38 }),
    ],
  });

  assert.equal(result.totalEnergyKwh, result.arrays.reduce((sum, array) => sum + array.totalEnergyKwh, 0));
  result.slots.forEach((slot, index) => {
    assert.equal(slot.energyKwh, result.arrays.reduce((sum, array) => sum + array.slots[index].energyKwh, 0));
  });
  const energies = [result.totalEnergyKwh, ...result.slots.map(({ energyKwh }) => energyKwh), ...result.arrays.flatMap((array) => array.slots.map(({ energyKwh }) => energyKwh))];
  assert.ok(energies.every((value) => Number.isFinite(value) && value >= 0));
});

test("rejects negative irradiance and malformed units or interval order with typed errors", () => {
  const negative = weatherSeries([weatherSlot("2026-05-15T12:00:00+09:00", { global_irradiance_w_m2: -1 })]);
  assert.throws(
    () => calculateLayoutGeneration({ scenario: { id: "layout-test", arrays: [panelArray()] }, weatherSeries: negative }),
    (error) => error instanceof GenerationInputError
      && error.code === "negative_irradiance"
      && error.field === "weatherSeries.intervals[0].global_irradiance_w_m2",
  );
  assert.throws(
    () => calculateLayoutGeneration({ scenario: { id: "layout-test", arrays: [panelArray()] }, weatherSeries: weatherSeries([weatherSlot("2026-05-15T12:00:00+09:00")]), systemLoss: 10 }),
    (error) => error instanceof GenerationInputError && error.code === "unknown_field",
  );
  assert.throws(
    () => generate({ slots: [weatherSlot("2026-05-15T12:15:00+09:00"), weatherSlot("2026-05-15T12:00:00+09:00")] }),
    (error) => error instanceof GenerationInputError && error.code === "invalid_interval_spacing",
  );
});

test("rejects impossible timestamp components before Date.parse can normalize them", () => {
  const invalidTimestamps = [
    "2026-02-30T12:00:00+09:00",
    "2025-02-29T12:00:00+09:00",
    "1900-02-29T12:00:00+09:00",
    "2026-00-15T12:00:00+09:00",
    "2026-13-01T12:00:00+09:00",
    "2026-01-00T12:00:00+09:00",
    "2026-04-31T12:00:00+09:00",
    "2026-01-01T24:00:00+09:00",
    "2026-01-01T12:60:00+09:00",
    "2026-01-01T12:00:60+09:00",
    "2026-01-01T12:00:00+24:00",
    "2026-01-01T12:00:00+09:60",
  ];

  for (const timestamp of invalidTimestamps) {
    assert.throws(
      () => generate({ slots: [weatherSlot(timestamp)] }),
      (error) => error instanceof GenerationInputError
        && error.code === "iso_timestamp"
        && error.field === "weatherSeries.intervals[0].timestamp",
      timestamp,
    );
  }
  assert.equal(generate({ slots: [weatherSlot("2024-02-29T23:45:00+09:00")] }).slots.length, 1);
  assert.equal(generate({ slots: [weatherSlot("2000-02-29T00:00:00Z")] }).slots.length, 1);
});

test("preserves exact ordered timestamps and weather provenance without mutating inputs", () => {
  const slots = [
    weatherSlot("2026-05-15T12:00:00+09:00", { source: "estimated", quality_text: "Estimated solar input; not measured." }),
    weatherSlot("2026-05-15T12:15:00+09:00", { source: "estimated", quality_text: "Estimated solar input; not measured." }),
  ];
  const weather = weatherSeries(slots, { source: "estimated", scenario_id: null, quality_text: "Estimated solar input; not measured." });
  const input = { scenario: { id: "layout-test", arrays: [panelArray()] }, weatherSeries: weather };
  const snapshot = structuredClone(input);
  const result = calculateLayoutGeneration(input);

  assert.deepEqual(result.slots.map(({ timestamp }) => timestamp), slots.map(({ timestamp }) => timestamp));
  assert.deepEqual(result.provenance, {
    source: "estimated",
    weatherScenarioId: null,
    locationId: "scnu",
    timeZone: "Asia/Seoul",
    qualityText: "Estimated solar input; not measured.",
  });
  assert.deepEqual(result.slots[0].provenance, {
    source: "estimated",
    qualityText: "Estimated solar input; not measured.",
    fieldSources: slots[0].field_sources,
  });
  assert.deepEqual(input, snapshot);
});
