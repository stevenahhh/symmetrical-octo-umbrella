import assert from "node:assert/strict";
import test from "node:test";
import { createEnergyDashboardClient } from "./energyDashboardApi.mjs";

const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
test("client loads summaries before exact selected date/scenario resources", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([url, init.method ?? "GET", init.body]);
    if (url.endsWith("/energy/buildings/D4")) return response({ id: "D4" });
    if (url.endsWith("/energy/buildings/D4/scenarios")) return response([{ id: "s2" }]);
    if (url.includes("/demand?date=")) return response({ demand: true });
    if (url.endsWith("/energy/scenarios/s2")) return response({ scenario: true });
    if (url.endsWith("/energy/scenarios/s2/simulate")) return response({ simulation: true });
    throw new Error(url);
  };
  const result = await createEnergyDashboardClient("http://api", fetchImpl).load({ buildingId: "D4", date: "2026-05-18", scenarioId: "missing" });
  assert.equal(result.summaries[0].id, "s2");
  assert.deepEqual(calls.slice(2).map((item) => item[1]).sort(), ["GET", "GET", "POST"]);
  assert.ok(calls.some(([url]) => url.endsWith("/energy/buildings/D4/demand?date=2026-05-18")));
  assert.equal(JSON.parse(calls.find(([url]) => url.endsWith("/simulate"))[2]).date, "2026-05-18");
});
