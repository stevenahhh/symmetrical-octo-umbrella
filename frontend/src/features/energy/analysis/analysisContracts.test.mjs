import assert from "node:assert/strict";
import test from "node:test";
import { analysisScenarioInput, buildAnalysisInsights, buildAnalysisReport, parseAnalysisRun, parseAnalysisScenario } from "./analysisContracts.mjs";
import { analysisRunFixture, analysisScenarioFixture, directAnalysisRunFixture } from "./analysisFixtures.test.mjs";

test("builds and parses the persisted analysis definition contract", () => {
  assert.deepEqual(analysisScenarioInput({ buildingId: "D4", name: "comparison", representativePlanId: "rep", alternativePlanId: "alt", weatherPreset: "clear", electricityPriceKrwPerKwh: 275, carbonIntensityKgCo2ePerKwh: 0.61 }), {
    building_id: "D4", name: "comparison", representative_plan_id: "rep", alternative_plan_id: "alt", baseline: "no_solar",
    conditions: { demand_source: "predicted", weather_preset: "clear", electricity_price_krw_per_kwh: 275, carbon_intensity_kg_co2e_per_kwh: 0.61 },
  });
  assert.equal(parseAnalysisScenario(analysisScenarioFixture()).representativePlanId, "plan-representative");
  assert.throws(() => analysisScenarioInput({ buildingId: "D4", name: "x", representativePlanId: "rep", weatherPreset: "storm" }), /weatherPreset/);
});

test("parses one immutable comparison with 96 aligned generation and grid-draw slots", () => {
  const report = parseAnalysisRun(analysisRunFixture());
  assert.equal(report.series.length, 96);
  assert.equal(report.plans.alternative.id, "plan-alternative");
  assert.equal(report.series[30].gridImportEnergyKwh, report.series[30].demandEnergyKwh - report.series[30].proposedGenerationEnergyKwh);
  assert.equal(report.series.reduce((sum, slot) => sum + slot.gridImportEnergyKwh, 0), report.kpis.proposed.gridImportEnergyKwh);
  assert.ok(Object.isFrozen(report));
  assert.equal(buildAnalysisReport(report), report);
  assert.match(buildAnalysisInsights(report)[0].message, /대표 계획은 대안보다/);
});

test("uses snapshot cost assumptions for savings and carbon KPIs and insights", () => {
  const report = parseAnalysisRun(analysisRunFixture({ scenarioOverrides: { conditions: {
    demand_source: "predicted", weather_preset: "clear",
    electricity_price_krw_per_kwh: 275,
    carbon_intensity_kg_co2e_per_kwh: 0.61,
  } } }));
  const reduced = report.deltas.gridImportReductionEnergyKwh;
  assert.equal(report.deltas.costSavingsKrw, reduced * 275);
  assert.equal(report.deltas.carbonReductionKgCo2e, reduced * 0.61);
  const messages = buildAnalysisInsights(report).map((item) => item.message).join(" ");
  assert.match(messages, /275/);
  assert.match(messages, /0\.61/);
});

test("uses the backend run_type discriminator for both history shapes", () => {
  const unknown = directAnalysisRunFixture(); unknown.run_type = "legacy";
  assert.throws(
    () => parseAnalysisRun(unknown),
    (error) => error.field === "run.run_type",
  );
  const mislabeled = directAnalysisRunFixture(); mislabeled.run_type = "scenario";
  assert.throws(
    () => parseAnalysisRun(mislabeled),
    (error) => error.field === "scenario",
  );
});

test("normalizes a legacy direct run into the common immutable report shape", () => {
  const report = parseAnalysisRun(directAnalysisRunFixture());
  assert.equal(report.analysisScenarioId, null);
  assert.equal(report.scenario, null);
  assert.equal(report.plans.representative.id, "plan-representative");
  assert.equal(report.plans.alternative, null);
  assert.equal(report.series.length, 96);
  assert.deepEqual(report.kpis.proposed, parseAnalysisRun(analysisRunFixture({ withAlternative: false })).kpis.proposed);
  assert.equal(report.kpis.baseline.gridImportEnergyKwh, report.kpis.baseline.demandEnergyKwh);
});

test("rejects scenarios and runs outside explicitly supplied request context", () => {
  assert.throws(
    () => parseAnalysisScenario(analysisScenarioFixture(), { buildingId: "D5" }),
    (error) => error.field === "scenario.building_id",
  );
  assert.throws(
    () => parseAnalysisScenario(analysisScenarioFixture(), { scenarioId: "scenario-other" }),
    (error) => error.field === "scenario.id",
  );
  assert.throws(
    () => parseAnalysisRun(analysisRunFixture(), { scenarioId: "scenario-other" }),
    (error) => error.field === "run.analysis_scenario_id",
  );
  assert.throws(
    () => parseAnalysisRun(analysisRunFixture(), { date: "2026-05-17" }),
    (error) => error.field === "run.date",
  );
  assert.throws(
    () => parseAnalysisRun(analysisRunFixture(), { conditions: { weatherPreset: "overcast" } }),
    (error) => error.field === "run.conditions.weather_preset",
  );
  assert.throws(
    () => parseAnalysisRun(analysisRunFixture(), { buildingId: "D5" }),
    (error) => error.field === "run.building_id",
  );
  assert.throws(
    () => parseAnalysisRun(analysisRunFixture(), { runId: "run-other" }),
    (error) => error.field === "run.id",
  );
  assert.throws(
    () => parseAnalysisRun(directAnalysisRunFixture(), { buildingId: "D5" }),
    (error) => error.field === "run.building_id",
  );
  assert.throws(
    () => parseAnalysisRun(directAnalysisRunFixture({ id: "direct-run" }), { runId: "run-other" }),
    (error) => error.field === "run.id",
  );
});

test("rejects malformed snapshots, totals, and interval series", () => {
  const short = analysisRunFixture(); short.intervals.pop();
  assert.throws(() => parseAnalysisRun(short), /96/);
  const inconsistent = analysisRunFixture(); inconsistent.intervals[0].proposed_generation_energy_kwh = 9;
  assert.throws(() => parseAnalysisRun(inconsistent), /series totals/);
  const wrongScenario = analysisRunFixture(); wrongScenario.analysis_scenario_id = "other";
  assert.throws(() => parseAnalysisRun(wrongScenario), /scenario_snapshot/);
  const unordered = analysisRunFixture(); [unordered.intervals[0], unordered.intervals[1]] = [unordered.intervals[1], unordered.intervals[0]];
  assert.throws(() => parseAnalysisRun(unordered), /ordered/);
});

test("uses immutable plan and scenario snapshots when live definitions are absent", () => {
  const report = parseAnalysisRun(analysisRunFixture());
  assert.equal(report.scenario.name, "D4 comparison");
  assert.equal(report.plans.representative.name, "Representative south roof");
  assert.equal(report.analysisScenarioId, "analysis-scenario-D4");
});
