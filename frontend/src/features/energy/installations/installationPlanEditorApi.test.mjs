import assert from "node:assert/strict";
import test from "node:test";
import { loadInstallationPlanEditorDocument, saveInstallationPlanEditor } from "./installationPlanEditorApi.mjs";

const plan = {
  id: "plan-1", buildingId: "D4", name: "대표안", createdAt: "2026-08-04T10:00:00+09:00", updatedAt: "2026-08-04T10:00:00+09:00",
  arrays: [{ id: "array-1", planId: "plan-1", roofId: "roof-1", roofZoneId: "zone-1", moduleId: "module-1", originMeters: { xMeters: 10, yMeters: 12 }, rows: 2, columns: 8, azimuthDeg: 180, tiltDeg: 25, orientation: "portrait", moduleWidthMeters: 1.05, moduleLengthMeters: 2.1, moduleEfficiencyPercent: 20, moduleNominalPowerWp: 441, interPanelGapMeters: 0.02 }],
};

test("installation plan editor adapter loads canonical roof geometry and maps the plan into editor state", async () => {
  const client = { get: async () => plan };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ id: "D4", roofs: [{ id: "roof-1", zones: [{ id: "zone-1", polygon_meters: [{ x_meters: 0, y_meters: 0 }, { x_meters: 20, y_meters: 0 }, { x_meters: 20, y_meters: 30 }, { x_meters: 0, y_meters: 30 }] }], obstacles: [] }] }) });
  const result = await loadInstallationPlanEditorDocument({ apiBase: "http://api.test", buildingId: "D4", installationPlanId: "plan-1", client, fetchImpl });
  assert.equal(result.plan.name, "대표안");
  assert.equal(result.document.coordinateSystem, "roof-local-meters");
  assert.equal(result.document.scenarios[0].id, "plan-1");
  assert.deepEqual(result.document.scenarios[0].arrays[0].originMeters, { xMeters: 10, yMeters: 12 });
  assert.equal(result.document.modules[0].id, "module-1");
});

test("installation plan editor save binds edited roof-local arrays to the explicit plan ID", async () => {
  const calls = [];
  const client = { update: async (...args) => { calls.push(args); return { ...plan, arrays: args[1].arrays.map((item) => ({ ...item, planId: "plan-1" })) }; } };
  const editorArrays = [{ id: "array-1", scenarioId: "plan-1", roofId: "roof-1", roofZoneId: "zone-1", moduleId: "module-1", originMeters: { xMeters: 14, yMeters: 16 }, rows: 2, columns: 6, azimuthDeg: 180, tiltDeg: 25, orientation: "portrait" }];
  const saved = await saveInstallationPlanEditor({ client, installationPlanId: "plan-1", buildingId: "D4", name: "대표안", arrays: editorArrays, modules: [{ id: "module-1", widthMeters: 1.05, lengthMeters: 2.1, efficiencyPercent: 20, nominalPowerWp: 441 }], interPanelGapMeters: 0.02 });
  assert.equal(calls[0][0], "plan-1");
  assert.deepEqual(calls[0][1].arrays[0].originMeters, { xMeters: 14, yMeters: 16 });
  assert.equal(saved.id, "plan-1");
  assert.equal(saved.arrays[0].scenarioId, "plan-1");
});
