import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { D4_BUILDING_DATA, D4_ROOMS } from "./d4Campus.mjs";
import { calculateBuildingDemand } from "./demand.mjs";
import { calculateEnergyBalance } from "./energyBalance.mjs";
import { calculateLayoutGeneration } from "./generation.mjs";

const DATE = "2026-05-18";
const QUALITY = "Fixed D4 clear-day scenario; not measured weather.";
const rates = { electricityPriceKrwPerKwh: 160, carbonIntensityKgCo2ePerKwh: 0.45 };

function weatherSeries() {
  return {
    status: "available", source: "scenario", scenario_id: "d4-task-10-clear", location_id: "scnu",
    timezone: "Asia/Seoul", quality_text: QUALITY, error_code: null,
    intervals: Array.from({ length: 96 }, (_, index) => {
      const hour = Math.floor(index / 4);
      const minute = (index % 4) * 15;
      const decimalHour = hour + minute / 60;
      const daylight = decimalHour > 6 && decimalHour < 18;
      const altitude = daylight ? 70 * Math.sin(Math.PI * (decimalHour - 6) / 12) : -10;
      return {
        timestamp: `${DATE}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
        ambient_temperature_c: 20, global_irradiance_w_m2: daylight ? 850 * Math.sin(altitude * Math.PI / 180) : 0,
        cloud_factor: 0, solar_altitude_deg: altitude, source: "scenario", quality_text: QUALITY,
        field_sources: { ambient_temperature_c: "scenario_preset", cloud_factor: "scenario_preset",
          global_irradiance_w_m2: "scenario_solar_model" },
      };
    }),
  };
}

const demandResult = calculateBuildingDemand({ ...D4_BUILDING_DATA, rooms: D4_ROOMS }, DATE);
const generationResult = calculateLayoutGeneration({
  scenario: { id: "d4-task-10-layout", arrays: [{ id: "south-2x8", rows: 2, columns: 8, azimuthDeg: 180, tiltDeg: 25 }] },
  weatherSeries: weatherSeries(),
});
const input = {
  demand: { intervalMinutes: demandResult.intervalMinutes, energyUnit: "kWh", quality: demandResult.quality,
    assumption: demandResult.assumption,
    slots: demandResult.slots.map((slot) => ({ timestamp: slot.intervalKey, energyKwh: slot.energyKwh })) },
  generation: { intervalMinutes: generationResult.intervalMinutes, energyUnit: generationResult.energyUnit,
    provenance: generationResult.provenance,
    slots: generationResult.slots.map((slot) => ({ timestamp: slot.timestamp, energyKwh: slot.energyKwh, provenance: slot.provenance })) },
  rates,
};
const result = calculateEnergyBalance(input);
assert.equal(result.status, "complete");
assert.equal(result.slots.length, 96);
assert.equal(result.demandProvenance.quality, "predicted");
assert.equal(result.weatherProvenance.source, "scenario");

let direct = 0;
let demand = 0;
let generation = 0;
for (let index = 0; index < 96; index += 1) {
  const demandEnergy = demandResult.slots[index].energyKwh;
  const generationEnergy = generationResult.slots[index].energyKwh;
  const directEnergy = Math.min(demandEnergy, generationEnergy);
  demand += demandEnergy;
  generation += generationEnergy;
  direct += directEnergy;
  assert.equal(result.slots[index].predictedDemandEnergyKwh, directEnergy + Math.max(demandEnergy - generationEnergy, 0));
  assert.equal(result.slots[index].generationEnergyKwh, directEnergy + Math.max(generationEnergy - demandEnergy, 0));
}
assert.equal(result.totals.predictedDemandEnergyKwh, demand);
assert.equal(result.totals.generationEnergyKwh, generation);
assert.equal(result.totals.directSolarUseEnergyKwh, direct);
assert.equal(result.totals.predictedDemandEnergyKwh,
  result.totals.directSolarUseEnergyKwh + result.totals.gridImportEnergyKwh);
assert.equal(result.totals.generationEnergyKwh,
  result.totals.directSolarUseEnergyKwh + result.totals.surplusEnergyKwh);
assert.equal(result.totals.selfSufficiencyRatio, direct / demand);
assert.equal(result.totals.solarUtilizationRatio, direct / generation);
assert.equal(result.daily[0].selfSufficiencyRatio, direct / demand);
assert.equal(result.monthly[0].solarUtilizationRatio, direct / generation);

const omitted = structuredClone(input);
omitted.demand.slots.splice(37, 1);
const incomplete = calculateEnergyBalance(omitted);
assert.equal(incomplete.status, "incomplete");
assert.equal(incomplete.code, "incomplete_energy_series");
assert.ok(incomplete.issues.some(({ code, canonicalTimestamp }) => code === "missing_demand_slot"
  && canonicalTimestamp === "2026-05-18T00:15:00.000Z"));
assert.equal("slots" in incomplete, false);

const digest = createHash("sha256").update(JSON.stringify(result)).digest("hex");
console.log(JSON.stringify({ status: "pass", driver: "fixed-96-slot-d4-energy-balance", slots: result.slots.length,
  demandEnergyKwh: demand, generationEnergyKwh: generation, directSolarUseEnergyKwh: direct,
  gridImportEnergyKwh: result.totals.gridImportEnergyKwh, surplusEnergyKwh: result.totals.surplusEnergyKwh,
  selfSufficiencyRatio: result.totals.selfSufficiencyRatio, solarUtilizationRatio: result.totals.solarUtilizationRatio,
  omittedDemandFailure: { code: incomplete.code, issues: incomplete.issues }, digest }));
