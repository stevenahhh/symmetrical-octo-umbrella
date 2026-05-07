import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMayPvOutput,
  DEFAULT_MAY_SPECIFIC_YIELD,
} from "./pvMath.mjs";

test("calculates May PV output with default roof ratio and loss", () => {
  const result = calculateMayPvOutput({ roofArea: 100, moduleEfficiency: 20 });

  assert.equal(result.moduleArea, 20);
  assert.equal(result.nominalPowerKw, 4);
  assert.ok(Math.abs(result.monthlyOutput - 617.724) < 0.001);
});

test("matches the 171.59 kWh benchmark for 1 kWp before extra loss", () => {
  const result = calculateMayPvOutput({
    roofArea: 25,
    roofRatio: 20,
    moduleEfficiency: 20,
    systemLoss: 0,
    maySpecificYield: DEFAULT_MAY_SPECIFIC_YIELD,
  });

  assert.equal(result.nominalPowerKw, 1);
  assert.ok(Math.abs(result.monthlyOutput - 171.59) < 0.001);
});
