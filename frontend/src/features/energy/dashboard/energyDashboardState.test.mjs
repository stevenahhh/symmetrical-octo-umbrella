import assert from "node:assert/strict";
import test from "node:test";
import { energyDashboardReducer, initialEnergyDashboardState } from "./energyDashboardState.mjs";

test("request-ID reducer ignores stale success and error completions", () => {
  const first = energyDashboardReducer(initialEnergyDashboardState, { type: "load", requestId: 1 });
  const second = energyDashboardReducer(first, { type: "load", requestId: 2 });
  assert.equal(energyDashboardReducer(second, { type: "success", requestId: 1, data: { stale: true } }), second);
  assert.equal(energyDashboardReducer(second, { type: "error", requestId: 1, error: "stale" }), second);
  assert.equal(energyDashboardReducer(second, { type: "success", requestId: 2, data: { current: true } }).data.current, true);
});
