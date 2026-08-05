import assert from "node:assert/strict";
import test from "node:test";
import { analysisReducer, createAnalysisState, createDraft } from "./analysisState.mjs";
import { parseAnalysisRun } from "./analysisContracts.mjs";
import { analysisRunFixture } from "./analysisFixtures.test.mjs";

const plans = [{ id: "alt", name: "Alternative" }, { id: "rep", name: "Representative", isRepresentative: true }];

test("defaults to the marked representative plan, an alternate, and no-solar baseline", () => {
  const draft = createDraft({ buildingId: "D4", plans, date: "2026-05-18" });
  assert.equal(draft.representativePlanId, "rep");
  assert.equal(draft.alternativePlanId, "alt");
  assert.equal(draft.baseline, "no_solar");
  assert.deepEqual(draft.conditions, {
    weatherPreset: "clear",
    electricityPriceKrwPerKwh: 160,
    carbonIntensityKgCo2ePerKwh: 0.45,
  });
});

test("selects the newest persisted run after reload regardless of backend order", () => {
  let state = createAnalysisState({ buildingId: "D4", plans, representativePlanId: "rep", date: "2026-05-18" });
  state = analysisReducer(state, { type: "context", requestId: 2, buildingId: "D4", plans, representativePlanId: "rep" });
  const older = parseAnalysisRun(analysisRunFixture({ id: "older", created_at: "2026-05-17T09:01:00+09:00" }));
  const newestA = parseAnalysisRun(analysisRunFixture({ id: "newest-a", created_at: "2026-05-19T09:01:00+09:00" }));
  const newestZ = parseAnalysisRun(analysisRunFixture({ id: "newest-z", created_at: "2026-05-19T09:01:00+09:00" }));
  const middle = parseAnalysisRun(analysisRunFixture({ id: "middle", created_at: "2026-05-18T09:01:00+09:00" }));
  state = analysisReducer(state, { type: "loaded", requestId: 2, scenarios: [], runs: [older, newestA, middle, newestZ] });
  assert.equal(state.report.id, "newest-z");
  assert.deepEqual(state.runs.map((run) => run.id), ["newest-z", "newest-a", "middle", "older"]);
});

test("reloads persisted history, keeps snapshots visible when edited, and ignores stale completions", () => {
  let state = createAnalysisState({ buildingId: "D4", plans, representativePlanId: "rep", date: "2026-05-18" });
  state = analysisReducer(state, { type: "context", requestId: 2, buildingId: "D4", plans, representativePlanId: "rep" });
  assert.equal(analysisReducer(state, { type: "failure", requestId: 1, error: "stale" }), state);
  const report = parseAnalysisRun(analysisRunFixture());
  state = analysisReducer(state, { type: "loaded", requestId: 2, scenarios: [], runs: [report] });
  assert.equal(state.report.id, report.id);
  assert.equal(state.scenarioId, null);
  state = analysisReducer(state, { type: "draft", field: "date", value: "2026-05-19" });
  assert.equal(state.report.id, report.id);
  assert.equal(state.dirty, true);
});
