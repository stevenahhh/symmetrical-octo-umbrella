import assert from "node:assert/strict";
import test from "node:test";
import { D4_ROOF_SCENARIO_FIXTURE } from "../domain/fixtures/d4RoofScenarioFixture.mjs";
import { loadEnergyEditorDocument, loadEnergyScenario, saveEnergyScenario, toScenarioPayload } from "./energyScenarioApi.mjs";

const apiScenario = {
  id: "D4-scenario-south-2x8", building_id: "D4", name: "D4 roof installation", weather_preset: "clear", created_at: "2026-01-01T00:00:00+09:00", updated_at: "2026-01-01T00:00:00+09:00", intervals: [],
  arrays: [{ id: "D4-array-south-2x8", scenario_id: "D4-scenario-south-2x8", roof_id: "D4-roof-west", roof_zone_id: "D4-roof-west-main", module_id: "module-default-441wp", origin_x_m: 10, origin_y_m: 10, rows: 2, columns: 8, azimuth_deg: 180, tilt_deg: 25, orientation: "portrait", module_width_m: 1.05, module_length_m: 2.1, module_efficiency_percent: 20, module_nominal_power_wp: 441, inter_panel_gap_m: 0.02 }],
};

test("save binds exact roof-local fields to PUT /energy and reload restores them", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => { requests.push({ url, options }); return { ok: true, status: 200, json: async () => apiScenario }; };
  const document = structuredClone(D4_ROOF_SCENARIO_FIXTURE);
  const payload = toScenarioPayload(document.scenarios[0].arrays, document.modules[0]);
  const saved = await saveEnergyScenario("http://api.test", apiScenario.id, payload, fetchImpl);
  const loaded = await loadEnergyScenario("http://api.test", apiScenario.id, fetchImpl);
  assert.equal(requests[0].url, `http://api.test/energy/scenarios/${apiScenario.id}`);
  assert.equal(requests[0].options.method, "PUT");
  const { scenario_id: _scenarioId, ...expectedInput } = apiScenario.arrays[0];
  assert.deepEqual(JSON.parse(requests[0].options.body).arrays[0], expectedInput);
  assert.equal(requests[1].options.method, undefined);
  assert.deepEqual(saved.arrays, document.scenarios[0].arrays);
  assert.deepEqual(loaded.arrays, document.scenarios[0].arrays);
});

test("load rejects scenario and building identities that differ from the requested resources", async () => {
  await assert.rejects(
    () => loadEnergyScenario("http://api.test", apiScenario.id, async () => ({
      ok: true, status: 200, json: async () => ({ ...apiScenario, id: "other-scenario" }),
    })),
    (error) => error.code === "INVALID_SCENARIO_CONTRACT",
  );
  await assert.rejects(
    () => loadEnergyScenario("http://api.test", apiScenario.id, async () => ({
      ok: true, status: 200, json: async () => ({ ...apiScenario, building_id: "D3" }),
    }), { buildingId: "D4" }),
    (error) => error.code === "INVALID_SCENARIO_CONTRACT",
  );

  const building = { id: "D3", roofs: [{ id: "roof", zones: [], obstacles: [] }] };
  for (const scenario of [
    { ...apiScenario, id: "other-scenario", building_id: "D3" },
    { ...apiScenario, id: "D3-scenario", building_id: "D4" },
  ]) {
    await assert.rejects(
      () => loadEnergyEditorDocument("http://api.test", "D3", "D3-scenario", async (url) => ({
        ok: true, status: 200, json: async () => url.includes("/buildings/") ? building : scenario,
      })),
      (error) => error.code === "INVALID_EDITOR_CONTRACT",
    );
  }
});

test("save encodes the requested scenario ID and rejects mismatched response identity", async () => {
  const scenarioId = "D4/scenario south?revision=2";
  const payload = toScenarioPayload(D4_ROOF_SCENARIO_FIXTURE.scenarios[0].arrays, D4_ROOF_SCENARIO_FIXTURE.modules[0]);
  const calls = [];
  const save = (responseScenario) => saveEnergyScenario("http://api.test", scenarioId, payload, async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => responseScenario };
  }, { buildingId: "D4" });

  await save({ ...apiScenario, id: scenarioId });
  assert.equal(calls[0], `http://api.test/energy/scenarios/${encodeURIComponent(scenarioId)}`);
  await assert.rejects(() => save({ ...apiScenario, id: "other-scenario" }), (error) => error.code === "INVALID_SCENARIO_CONTRACT");
  await assert.rejects(() => save({ ...apiScenario, id: scenarioId, building_id: "D3" }), (error) => error.code === "INVALID_SCENARIO_CONTRACT");
});

test("D3 editor geometry comes from the canonical seeded building payload instead of D4", async () => {
  const requests = [];
  const building = {
    id: "D3", roofs: [{ id: "D3-roof-main", zones: [{ id: "D3-roof-main-zone", polygon_meters: [
      { x_meters: 0, y_meters: 0 }, { x_meters: 30, y_meters: 0 },
      { x_meters: 30, y_meters: 46 }, { x_meters: 0, y_meters: 46 },
    ] }], obstacles: [] }],
  };
  const scenario = { ...apiScenario, id: "D3-scenario-campus-baseline", building_id: "D3", arrays: [{
    ...apiScenario.arrays[0], id: "D3-array-baseline", scenario_id: "D3-scenario-campus-baseline",
    roof_id: "D3-roof-main", roof_zone_id: "D3-roof-main-zone",
  }] };
  const fetchImpl = async (url) => {
    requests.push(url);
    return { ok: true, status: 200, json: async () => url.includes("/buildings/") ? building : scenario };
  };

  const document = await loadEnergyEditorDocument("http://api.test", "D3", scenario.id, fetchImpl);

  assert.deepEqual(requests, [
    "http://api.test/energy/buildings/D3",
    `http://api.test/energy/scenarios/${scenario.id}`,
  ]);
  assert.deepEqual(document.roofs[0].zones[0].polygonMeters, [
    { xMeters: 0, yMeters: 0 }, { xMeters: 30, yMeters: 0 },
    { xMeters: 30, yMeters: 46 }, { xMeters: 0, yMeters: 46 },
  ]);
  assert.notDeepEqual(document.roofs[0].zones[0].polygonMeters, D4_ROOF_SCENARIO_FIXTURE.roofs[0].zones[0].polygonMeters);
  assert.equal(document.scenarios[0].buildingId, "D3");
});

test("invalid layout is rejected before fetch and API failures stay typed", async () => {
  let writes = 0;
  await assert.rejects(() => saveEnergyScenario("http://api.test", apiScenario.id, { arrays: [], valid: false }, async () => { writes += 1; }), (error) => error.code === "INVALID_LAYOUT");
  assert.equal(writes, 0);
  await assert.rejects(() => loadEnergyScenario("http://api.test", apiScenario.id, async () => ({ ok: false, status: 503, json: async () => ({}) })), (error) => error.code === "ENERGY_API_ERROR" && error.status === 503);
});
