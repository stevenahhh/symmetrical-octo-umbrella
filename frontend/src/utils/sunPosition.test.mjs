import test from "node:test";
import assert from "node:assert/strict";
import {
  clampDateParts,
  createSimulationDate,
  getSunState,
  CAMPUS_LOCATION,
} from "./sunPosition.mjs";

test("clamps invalid date parts safely", () => {
  const result = clampDateParts({ month: 13, day: 50, hour: 30, minute: 88 });

  assert.deepEqual(result, { month: 12, day: 31, hour: 23, minute: 59 });
});

test("midday sun altitude is higher than morning altitude", () => {
  const morning = getSunState({
    date: createSimulationDate({ month: 5, day: 15, hour: 9, minute: 0 }, 2026),
    ...CAMPUS_LOCATION,
  });
  const midday = getSunState({
    date: createSimulationDate({ month: 5, day: 15, hour: 12, minute: 0 }, 2026),
    ...CAMPUS_LOCATION,
  });

  assert.ok(midday.altitude > morning.altitude);
});

test("night sun is not visible", () => {
  const night = getSunState({
    date: createSimulationDate({ month: 5, day: 15, hour: 1, minute: 0 }, 2026),
    ...CAMPUS_LOCATION,
  });

  assert.equal(night.visible, false);
});
