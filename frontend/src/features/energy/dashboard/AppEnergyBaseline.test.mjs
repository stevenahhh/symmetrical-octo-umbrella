import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Characterization written before replacement: preserves the visible entry point while
// intentionally allowing the May-only formulas to move out of App.jsx.
test("App exposes an energy tab and a dedicated feature boundary", async () => {
  const source = await readFile(new URL("../../../App.jsx", import.meta.url), "utf8");
  assert.match(source, /id: "energy", label: "에너지"/);
  assert.match(source, /<EnergyDashboard/);
  assert.doesNotMatch(source, /calculateMayPvOutput|fetch\([^\n]*\/energy|monthlyOutput|solarResult|roofRatio/);
});
