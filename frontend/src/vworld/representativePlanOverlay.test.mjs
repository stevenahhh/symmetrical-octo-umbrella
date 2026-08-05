import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPUS_REPRESENTATIVE_BUILDING_IDS,
  loadRepresentativePlanOverlays,
  toRoofLocalOverlay,
} from "./representativePlanOverlay.mjs";

const plan = {
  id: "plan-1", buildingId: "D4", name: "대표안", createdAt: "2026-08-04T10:00:00+09:00", updatedAt: "2026-08-04T10:00:00+09:00",
  arrays: [{ id: "array-1", planId: "plan-1", roofId: "roof-1", roofZoneId: "zone-1", moduleId: "module-1", originMeters: { xMeters: 10, yMeters: 12 }, rows: 2, columns: 8, azimuthDeg: 180, tiltDeg: 25, orientation: "portrait", moduleWidthMeters: 1.05, moduleLengthMeters: 2.1, moduleEfficiencyPercent: 20, moduleNominalPowerWp: 441, interPanelGapMeters: 0.02 }],
};

test("overlay adapter emits projected representative footprints in roof-local meters without world coordinates", () => {
  const overlay = toRoofLocalOverlay(plan);
  assert.equal(overlay.coordinateSystem, "roof-local-meters");
  assert.equal(overlay.installationPlanId, "plan-1");
  assert.equal(overlay.name, "대표안");
  assert.equal(overlay.installedCapacityKwp, 7.056);
  assert.equal(overlay.arrays[0].footprintMeters.length, 4);
  assert.equal(overlay.arrays[0].footprintMeters.every((point) => Number.isFinite(point.xMeters) && Number.isFinite(point.yMeters)), true);
  assert.equal("longitude" in overlay.arrays[0].footprintMeters[0], false);
  assert.equal("latitude" in overlay.arrays[0].footprintMeters[0], false);
});

test("overlay adapter totals installed capacity from each array's module count and nominal power", () => {
  const overlay = toRoofLocalOverlay({
    ...plan,
    arrays: [
      plan.arrays[0],
      { ...plan.arrays[0], id: "array-2", rows: 3, columns: 4, moduleNominalPowerWp: 500 },
    ],
  });
  assert.equal(overlay.installedCapacityKwp, 13.056);
});

test("loader requests every supported campus building and returns non-D4 representatives as roof-local status data", async () => {
  const requested = [];
  const client = {
    getRepresentative: async (buildingId) => {
      requested.push(buildingId);
      return buildingId === "D3" ? { buildingId, installationPlanId: "plan-d3" } : null;
    },
    get: async (id) => ({ ...plan, id, buildingId: "D3" }),
  };
  const overlays = await loadRepresentativePlanOverlays({
    buildingIds: CAMPUS_REPRESENTATIVE_BUILDING_IDS,
    client,
  });
  assert.deepEqual(requested.sort(), [...CAMPUS_REPRESENTATIVE_BUILDING_IDS].sort());
  assert.deepEqual(overlays.map((item) => item.buildingId), ["D3"]);
  assert.equal(overlays[0].installationPlanId, "plan-d3");
  assert.equal(overlays[0].hasVerifiedWorldGeometry, false);
});
