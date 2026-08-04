import assert from "node:assert/strict";
import test from "node:test";
import { calculateMayPvOutput } from "../../../utils/pvMath.mjs";
import { calculateLayoutGeneration } from "./generation.mjs";

const QUALITY = "Legacy May matching resource fixture; scenario, not observed.";

function weatherSlot(timestamp, daylight, irradiance) {
  return {
    timestamp,
    ambient_temperature_c: 0,
    global_irradiance_w_m2: daylight ? irradiance : 0,
    cloud_factor: 1,
    solar_altitude_deg: daylight ? 90 : -10,
    source: "scenario",
    quality_text: QUALITY,
    field_sources: {
      ambient_temperature_c: "scenario_preset",
      cloud_factor: "scenario_preset",
      global_irradiance_w_m2: "scenario_solar_model",
    },
  };
}

test("matches the retained May benchmark within a documented 0.1% calibration tolerance", () => {
  const daylightSlotCount = 31 * 48;
  const matchingIrradiance = 171.59 * 1000 / (daylightSlotCount * 0.25);
  const intervals = [];
  for (let day = 1; day <= 31; day += 1) {
    for (let index = 0; index < 96; index += 1) {
      const hour = Math.floor(index / 4);
      const minute = (index % 4) * 15;
      const timestamp = `2026-05-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
      intervals.push(weatherSlot(timestamp, hour >= 6 && hour < 18, matchingIrradiance));
    }
  }
  const intervalResult = calculateLayoutGeneration({
    scenario: {
      id: "may-matching-layout",
      arrays: [{ id: "array-1", rows: 1, columns: 1, azimuthDeg: 180, tiltDeg: 0 }],
    },
    weatherSeries: {
      status: "available",
      source: "scenario",
      scenario_id: "legacy-may-matching-resource",
      location_id: "scnu",
      timezone: "Asia/Seoul",
      quality_text: QUALITY,
      intervals,
      error_code: null,
    },
    systemLossFraction: 0,
  });
  const legacyResult = calculateMayPvOutput({
    roofArea: 2.205,
    roofRatio: 100,
    moduleEfficiency: 20,
    systemLoss: 0,
  });
  const relativeError = Math.abs(intervalResult.totalEnergyKwh - legacyResult.monthlyOutput)
    / legacyResult.monthlyOutput;

  assert.ok(relativeError <= 0.001, `relative error ${relativeError} exceeded 0.1%`);
  assert.notEqual(intervalResult.totalEnergyKwh, legacyResult.monthlyOutput * 171.59);
});
