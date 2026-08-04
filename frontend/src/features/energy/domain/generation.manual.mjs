import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { D4_ROOF_SCENARIO_FIXTURE } from "./fixtures/d4RoofScenarioFixture.mjs";
import {
  GenerationInputError,
  calculateLayoutGeneration,
} from "./generation.mjs";
import { parseRoofLayoutDocument } from "./roofContracts.mjs";

const DATE = "2026-05-15";
const QUALITY = "Reproducible clear-sky simulation assumption; not observed weather.";

function buildClearWeather() {
  const intervals = Array.from({ length: 96 }, (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    const decimalHour = hour + minute / 60;
    const daylight = decimalHour > 6 && decimalHour < 18;
    const altitudeDeg = daylight
      ? 70 * Math.sin(Math.PI * (decimalHour - 6) / 12)
      : -10;
    const irradianceWm2 = daylight ? 1000 * Math.sin(altitudeDeg * Math.PI / 180) : 0;
    return {
      timestamp: `${DATE}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
      ambient_temperature_c: 18 + (daylight ? 8 * Math.sin(Math.PI * (decimalHour - 6) / 12) : 0),
      global_irradiance_w_m2: irradianceWm2,
      cloud_factor: 0.9952,
      solar_altitude_deg: altitudeDeg,
      source: "scenario",
      quality_text: QUALITY,
      field_sources: {
        ambient_temperature_c: "scenario_preset",
        cloud_factor: "scenario_preset",
        global_irradiance_w_m2: "scenario_solar_model",
      },
    };
  });
  return {
    status: "available",
    source: "scenario",
    scenario_id: `scnu-clear-${DATE}`,
    location_id: "scnu",
    timezone: "Asia/Seoul",
    quality_text: QUALITY,
    intervals,
    error_code: null,
  };
}

const document = parseRoofLayoutDocument(structuredClone(D4_ROOF_SCENARIO_FIXTURE));
const scenario = document.scenarios[0];
const weatherSeries = buildClearWeather();
const result = calculateLayoutGeneration({ scenario, weatherSeries });
const expectedTimestamps = weatherSeries.intervals.map(({ timestamp }) => timestamp);

assert.equal(result.arrays.length, 1);
assert.equal(result.arrays[0].moduleCount, 16);
assert.equal(result.arrays[0].capacityKwp, 7.056);
assert.equal(result.slots.length, 96);
assert.deepEqual(result.slots.map(({ timestamp }) => timestamp), expectedTimestamps);
assert.equal(result.provenance.source, "scenario");
assert.ok(result.totalEnergyKwh > 0);
assert.ok(result.slots.every(({ energyKwh }) => Number.isFinite(energyKwh) && energyKwh >= 0));

const fullyShaded = calculateLayoutGeneration({
  scenario,
  weatherSeries,
  shadingFactorsByArrayId: { [scenario.arrays[0].id]: 0 },
});
assert.equal(fullyShaded.totalEnergyKwh, 0);
assert.ok(fullyShaded.arrays[0].slots.every(({ factorBreakdown }) => factorBreakdown.shadingFactor === 0));

const malformedWeather = structuredClone(weatherSeries);
malformedWeather.intervals[48].global_irradiance_w_m2 = -1;
let negativeIrradianceError;
assert.throws(
  () => calculateLayoutGeneration({ scenario, weatherSeries: malformedWeather }),
  (error) => {
    assert.equal(error instanceof GenerationInputError, true);
    assert.equal(error.code, "negative_irradiance");
    negativeIrradianceError = { name: error.name, code: error.code, field: error.field };
    return true;
  },
);

const peak = result.slots.reduce((current, slot) => (
  slot.energyKwh > current.energyKwh ? slot : current
));
const resultDigest = createHash("sha256").update(JSON.stringify(result)).digest("hex");
console.log(JSON.stringify({
  status: "pass",
  driver: "fresh-esm-clear-day-2x8-south-facing",
  scenarioId: result.scenarioId,
  moduleCount: result.arrays[0].moduleCount,
  capacityKwp: result.arrays[0].capacityKwp,
  slots: result.slots.length,
  firstTimestamp: result.slots[0].timestamp,
  lastTimestamp: result.slots.at(-1).timestamp,
  totalEnergyKwh: result.totalEnergyKwh,
  peak: { timestamp: peak.timestamp, energyKwh: peak.energyKwh },
  defaultSystemLossFactor: result.arrays[0].slots[0].factorBreakdown.systemLossFactor,
  fullShadeEnergyKwh: fullyShaded.totalEnergyKwh,
  negativeIrradianceError,
  resultDigest,
}));
