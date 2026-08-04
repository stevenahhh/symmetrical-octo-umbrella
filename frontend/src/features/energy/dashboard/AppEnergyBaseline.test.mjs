import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The dev branch keeps Legacy and VWorld entry points separate. Energy belongs to VWorld.
test("AppVWorld exposes an energy tab and a dedicated feature boundary", async () => {
  const source = await readFile(new URL("../../../AppVWorld.jsx", import.meta.url), "utf8");
  assert.match(source, /id: "energy", label: "에너지"/);
  assert.match(source, /<EnergyDashboard/);
  assert.doesNotMatch(source, /calculateMayPvOutput|fetch\([^\n]*\/energy|monthlyOutput|solarResult|roofRatio/);
});
