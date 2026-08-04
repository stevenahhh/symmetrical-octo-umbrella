import assert from "node:assert/strict";
import test from "node:test";
import { parseCampusComparison, recommendationScenarioRequest } from "./campusComparison.mjs";

const response = {
  date: "2026-05-18", weather_preset: "clear",
  assumptions: { annualization_days: 365, weights: { annualized_yield: 0.3, roof_utilization: 0.2, self_sufficiency: 0.2, grid_reduction: 0.2, constraints: 0.1 }, demand_quality: "predicted", weather_source: "scenario" },
  rankings: [
    { scenario_id: "D4-s", building_id: "D4", building_name: "D4 / 공대 3호관", building_status: "simulated", status: "ranked", rank: 1, score: 0.71, total_generation_energy_kwh: 40, capacity_kwp: 7.056, exclusion_reason: null, component_scores: { annualized_yield: 0.8, roof_utilization: 0.3, self_sufficiency: 0.2, grid_reduction: 0.2, constraints: 1 }, metrics: { annualized_kwh_per_kwp: 2070, roof_utilization_ratio: 0.022, self_sufficiency_ratio: 0.04, grid_reduction_ratio: 0.04, constraint_violation_count: 0 } },
    { scenario_id: null, building_id: "C1", building_name: "도서관", building_status: "incomplete", status: "excluded", rank: null, score: null, total_generation_energy_kwh: null, capacity_kwp: null, exclusion_reason: "missing_roof_metadata", component_scores: null, metrics: null },
    { scenario_id: null, building_id: "D1", building_name: "창업보육센터", building_status: "no_scenario", status: "excluded", rank: null, score: null, total_generation_energy_kwh: null, capacity_kwp: null, exclusion_reason: "no_scenario", component_scores: null, metrics: null },
  ],
};

test("parses explainable rankings without converting exclusions to zero", () => {
  const result = parseCampusComparison(response);
  assert.equal(result.ranked[0].components.annualizedYield, 0.8);
  assert.deepEqual(result.statusByBuilding, { D4: "simulated", C1: "incomplete", D1: "no_scenario" });
  assert.equal(result.excluded[0].score, null);
  assert.match(result.excluded[0].reasonLabel, /옥상/);
  assert.equal(result.assumptions.demandQuality, "predicted");
});

test("recommendation request creates a new scenario and never reuses the saved id", () => {
  const request = recommendationScenarioRequest({ sourceScenarioId: "D4-s", date: "2026-05-18" });
  assert.deepEqual(request, { sourceScenarioId: "D4-s", date: "2026-05-18", openMode: "new-editable-copy" });
  assert.notEqual(request.openMode, "mutate-source");
});

test("rejects malformed or misleading ranking payloads", () => {
  assert.throws(() => parseCampusComparison({ ...response, rankings: [{ ...response.rankings[1], score: 0 }] }), /excluded score/i);
  assert.throws(() => parseCampusComparison({ ...response, weather_preset: "" }), /weather_preset/);
});
