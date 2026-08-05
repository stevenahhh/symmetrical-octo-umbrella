import assert from "node:assert/strict";
import test from "node:test";
import { createBuildingAnalysisClient } from "./analysisApi.mjs";
import { AnalysisContractError } from "./analysisContracts.mjs";
import { analysisRunFixture, analysisScenarioFixture, directAnalysisRunFixture } from "./analysisFixtures.test.mjs";

const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const input = { buildingId: "D4", name: "D4 comparison", representativePlanId: "plan-representative", alternativePlanId: "plan-alternative", weatherPreset: "clear" };

test("uses persisted analysis-scenario create, update, atomic run, and history routes", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/analysis-scenarios") && !options.method) return response([analysisScenarioFixture({ building_id: "D/4" })]);
    if (url.endsWith("/analysis-runs")) return response([analysisRunFixture({ building_id: "D/4" })]);
    if (url.includes("/runs")) return response(analysisRunFixture({ scenarioOverrides: { id: "scenario/id" } }), true, 201);
    if (url.includes("/analysis-runs/")) return response(analysisRunFixture({ id: "run/id" }));
    return response(analysisScenarioFixture(options.method === "PUT" ? { id: "scenario/id" } : {}), true, options.method === "POST" ? 201 : 200);
  };
  const client = createBuildingAnalysisClient("http://api.test", fetchImpl);
  await client.createScenario(input);
  await client.updateScenario("scenario/id", input);
  await client.listScenarios("D/4");
  await client.runScenario("scenario/id", "2026-05-18");
  await client.getRun("run/id");
  await client.listRuns("D/4");
  const body = {
    building_id: "D4", name: "D4 comparison", representative_plan_id: "plan-representative",
    alternative_plan_id: "plan-alternative", baseline: "no_solar", conditions: {
      demand_source: "predicted", weather_preset: "clear", electricity_price_krw_per_kwh: 160,
      carbon_intensity_kg_co2e_per_kwh: 0.45,
    },
  };
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method ?? "GET", options.body ? JSON.parse(options.body) : null]), [
    ["http://api.test/energy/analysis-scenarios", "POST", body],
    ["http://api.test/energy/analysis-scenarios/scenario%2Fid", "PUT", body],
    ["http://api.test/energy/buildings/D%2F4/analysis-scenarios", "GET", null],
    ["http://api.test/energy/analysis-scenarios/scenario%2Fid/runs", "POST", { date: "2026-05-18" }],
    ["http://api.test/energy/analysis-runs/run%2Fid", "GET", null],
    ["http://api.test/energy/buildings/D%2F4/analysis-runs", "GET", null],
  ]);
});

test("binds scenario list, create, and update responses to the requested identity", async () => {
  const wrongBuilding = createBuildingAnalysisClient("http://api.test", async () => response(analysisScenarioFixture({ building_id: "D5" })));
  await assert.rejects(
    () => wrongBuilding.createScenario(input),
    (error) => error instanceof AnalysisContractError && error.field === "scenario.building_id",
  );

  const wrongListBuilding = createBuildingAnalysisClient("http://api.test", async () => response([analysisScenarioFixture({ building_id: "D5" })]));
  await assert.rejects(
    () => wrongListBuilding.listScenarios("D4"),
    (error) => error instanceof AnalysisContractError && error.field === "scenario.building_id",
  );

  const wrongUpdateBuilding = createBuildingAnalysisClient("http://api.test", async () => response(analysisScenarioFixture({ building_id: "D5" })));
  await assert.rejects(
    () => wrongUpdateBuilding.updateScenario("analysis-scenario-D4", input),
    (error) => error instanceof AnalysisContractError && error.field === "scenario.building_id",
  );

  const wrongUpdateId = createBuildingAnalysisClient("http://api.test", async () => response(analysisScenarioFixture({ id: "scenario-other" })));
  await assert.rejects(
    () => wrongUpdateId.updateScenario("analysis-scenario-D4", input),
    (error) => error instanceof AnalysisContractError && error.field === "scenario.id",
  );
});

test("parses mixed scenario and legacy direct runs without rejecting building history", async () => {
  const scenarioRun = analysisRunFixture({ id: "scenario-run" });
  const directRun = directAnalysisRunFixture({ id: "direct-run" });
  const client = createBuildingAnalysisClient("http://api.test", async () => response([directRun, scenarioRun]));
  const history = await client.listRuns("D4");
  assert.deepEqual(history.map((run) => run.id), ["direct-run", "scenario-run"]);
  assert.equal(history[0].analysisScenarioId, null);
  assert.equal(history[1].analysisScenarioId, "analysis-scenario-D4");
});

test("binds analysis run responses to requested scenario, date, conditions, building, and run context where known", async () => {
  const wrongScenario = createBuildingAnalysisClient("http://api.test", async () => response(analysisRunFixture()));
  await assert.rejects(
    () => wrongScenario.runScenario("scenario-other", "2026-05-18"),
    (error) => error instanceof AnalysisContractError && error.field === "run.analysis_scenario_id",
  );

  const wrongDate = createBuildingAnalysisClient("http://api.test", async () => response(analysisRunFixture({ date: "2026-05-17" })));
  await assert.rejects(
    () => wrongDate.runScenario("analysis-scenario-D4", "2026-05-18"),
    (error) => error instanceof AnalysisContractError && error.field === "run.date",
  );

  const wrongConditions = createBuildingAnalysisClient("http://api.test", async () => response(analysisRunFixture({ scenarioOverrides: { conditions: {
    demand_source: "predicted", weather_preset: "overcast",
    electricity_price_krw_per_kwh: 160, carbon_intensity_kg_co2e_per_kwh: 0.45,
  } } })));
  await assert.rejects(
    () => wrongConditions.runScenario("analysis-scenario-D4", "2026-05-18", undefined, {
      demandSource: "predicted", weatherPreset: "clear",
      electricityPriceKrwPerKwh: 160, carbonIntensityKgCo2ePerKwh: 0.45,
    }),
    (error) => error instanceof AnalysisContractError && error.field === "run.conditions.weather_preset",
  );

  const wrongBuilding = createBuildingAnalysisClient("http://api.test", async () => response([analysisRunFixture()]));
  await assert.rejects(
    () => wrongBuilding.listRuns("D5"),
    (error) => error instanceof AnalysisContractError && error.field === "run.building_id",
  );

  const wrongRun = createBuildingAnalysisClient("http://api.test", async () => response(analysisRunFixture({ id: "run-other" })));
  await assert.rejects(
    () => wrongRun.getRun("run-requested"),
    (error) => error instanceof AnalysisContractError && error.field === "run.id",
  );

  const wrongDirectRun = createBuildingAnalysisClient("http://api.test", async () => response(directAnalysisRunFixture({ id: "run-other" })));
  await assert.rejects(
    () => wrongDirectRun.getRun("run-requested"),
    (error) => error instanceof AnalysisContractError && error.field === "run.id",
  );
});

test("surfaces structured Korean API failures", async () => {
  const client = createBuildingAnalysisClient("http://api.test", async () => response({ detail: { code: "bad_analysis", message_ko: "분석 조건 오류" } }, false, 422));
  await assert.rejects(() => client.getRun("bad"), (error) => error.code === "bad_analysis" && error.status === 422 && /분석 조건/.test(error.message));
});
