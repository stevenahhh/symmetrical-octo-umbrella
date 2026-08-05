import assert from "node:assert/strict";
import test from "node:test";
import { createEnergyDashboardClient } from "./energyDashboardApi.mjs";

const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
test("client loads summaries before exact selected date/scenario resources", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([url, init.method ?? "GET", init.body]);
    if (url.endsWith("/energy/buildings/D4")) return response({ id: "D4" });
    if (url.endsWith("/energy/buildings/D4/scenarios")) return response([{ id: "s2", building_id: "D4" }]);
    if (url.includes("/demand?date=")) return response({ building_id: "D4", date: "2026-05-18" });
    if (url.endsWith("/energy/scenarios/s2")) return response({ id: "s2", building_id: "D4" });
    if (url.endsWith("/energy/scenarios/s2/simulate")) return response({ scenario_id: "s2", date: "2026-05-18" });
    throw new Error(url);
  };
  const result = await createEnergyDashboardClient("http://api", fetchImpl).load({ buildingId: "D4", date: "2026-05-18", scenarioId: "missing" });
  assert.equal(result.summaries[0].id, "s2");
  assert.deepEqual(calls.slice(2).map((item) => item[1]).sort(), ["GET", "GET", "POST"]);
  assert.ok(calls.some(([url]) => url.endsWith("/energy/buildings/D4/demand?date=2026-05-18")));
  assert.equal(JSON.parse(calls.find(([url]) => url.endsWith("/simulate"))[2]).date, "2026-05-18");
});

test("client rejects response identities that do not match the selected scenario and building", async () => {
  const valid = {
    building: { id: "D4" },
    summaries: [{ id: "s2", building_id: "D4" }],
    demand: { building_id: "D4", date: "2026-05-18" },
    scenario: { id: "s2", building_id: "D4" },
    simulation: { scenario_id: "s2", date: "2026-05-18" },
  };
  const mismatches = [
    ["building", { id: "D3" }],
    ["summaries", [{ id: "s2", building_id: "D3" }]],
    ["demand", { building_id: "D3" }],
    ["scenario", { id: "other", building_id: "D4" }],
    ["scenario", { id: "s2", building_id: "D3" }],
    ["simulation", { scenario_id: "other", date: "2026-05-18" }],
  ];

  for (const [key, replacement] of mismatches) {
    const values = { ...valid, [key]: replacement };
    const fetchImpl = async (url) => {
      if (url.endsWith("/energy/buildings/D4")) return response(values.building);
      if (url.endsWith("/energy/buildings/D4/scenarios")) return response(values.summaries);
      if (url.includes("/demand?date=")) return response(values.demand);
      if (url.endsWith("/energy/scenarios/s2")) return response(values.scenario);
      if (url.endsWith("/energy/scenarios/s2/simulate")) return response(values.simulation);
      throw new Error(url);
    };
    await assert.rejects(
      () => createEnergyDashboardClient("http://api", fetchImpl).load({ buildingId: "D4", date: "2026-05-18", scenarioId: "s2" }),
      (error) => error.code === "invalid_energy_dashboard_payload",
    );
  }
});

test("client rejects demand and simulation dates outside the requested date", async () => {
  for (const staleResource of ["demand", "simulation"]) {
    const values = {
      demand: { building_id: "D4", date: "2026-05-18" },
      simulation: { scenario_id: "s2", date: "2026-05-18" },
    };
    values[staleResource] = { ...values[staleResource], date: "2026-05-17" };
    const fetchImpl = async (url) => {
      if (url.endsWith("/energy/buildings/D4")) return response({ id: "D4" });
      if (url.endsWith("/energy/buildings/D4/scenarios")) return response([{ id: "s2", building_id: "D4" }]);
      if (url.includes("/demand?date=")) return response(values.demand);
      if (url.endsWith("/energy/scenarios/s2")) return response({ id: "s2", building_id: "D4" });
      if (url.endsWith("/energy/scenarios/s2/simulate")) return response(values.simulation);
      throw new Error(url);
    };
    await assert.rejects(
      () => createEnergyDashboardClient("http://api", fetchImpl).load({ buildingId: "D4", date: "2026-05-18", scenarioId: "s2" }),
      (error) => error.code === "invalid_energy_dashboard_payload" && error.field === `${staleResource}.date`,
    );
  }
});
