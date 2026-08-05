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

test("clamps percentage inputs to the 0-100 range", () => {
  const maximum = calculateMayPvOutput({
    roofArea: 100,
    roofRatio: 150,
    moduleEfficiency: 150,
    systemLoss: -20,
  });
  const minimum = calculateMayPvOutput({
    roofArea: 100,
    roofRatio: -10,
    moduleEfficiency: -10,
    systemLoss: 150,
  });

  assert.equal(maximum.moduleArea, 100);
  assert.equal(maximum.nominalPowerKw, 100);
  assert.equal(maximum.monthlyOutput, 17_159);
  assert.deepEqual(minimum, {
    moduleArea: 0,
    nominalPowerKw: 0,
    monthlyOutput: 0,
  });
});

test("uses safe defaults for non-finite numeric inputs", () => {
  const result = calculateMayPvOutput({
    roofArea: 100,
    roofRatio: Number.NaN,
    moduleEfficiency: Number.NaN,
    systemLoss: Number.NaN,
    maySpecificYield: Number.NaN,
  });
  const invalidArea = calculateMayPvOutput({ roofArea: Number.NaN });

  assert.deepEqual(result, {
    moduleArea: 20,
    nominalPowerKw: 4,
    monthlyOutput: 617.724,
  });
  assert.deepEqual(invalidArea, {
    moduleArea: 0,
    nominalPowerKw: 0,
    monthlyOutput: 0,
  });
});
