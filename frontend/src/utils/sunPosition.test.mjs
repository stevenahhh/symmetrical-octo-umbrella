import test from "node:test";
import assert from "node:assert/strict";
import {
  clampDateParts,
  createSimulationDate,
  getSunState,
  getSunVector,
  CAMPUS_LOCATION,
  SIMULATION_TIME_ZONE,
} from "./sunPosition.mjs";

test("clamps invalid date parts safely", () => {
  const result = clampDateParts({ month: 13, day: 50, hour: 30, minute: 88 });

  assert.deepEqual(result, { month: 12, day: 31, hour: 23, minute: 59 });
});

test("clamps leap days using the selected simulation year", () => {
  const leapYear = clampDateParts(
    { month: 2, day: 29, hour: 12, minute: 0 },
    2024,
  );
  const commonYear = clampDateParts(
    { month: 2, day: 29, hour: 12, minute: 0 },
    2025,
  );

  assert.equal(leapYear.day, 29);
  assert.equal(commonYear.day, 28);
});

test("replaces non-finite date parts with deterministic minima", () => {
  const result = clampDateParts({
    month: Number.NaN,
    day: Number.NaN,
    hour: Number.NaN,
    minute: Number.NaN,
  }, 2026);

  assert.deepEqual(result, { month: 1, day: 1, hour: 0, minute: 0 });
});

test("creates simulation dates as Asia/Seoul wall-clock time", () => {
  const midnight = createSimulationDate(
    { month: 5, day: 15, hour: 0, minute: 0 },
    2026,
  );

  assert.equal(SIMULATION_TIME_ZONE, "Asia/Seoul");
  assert.equal(midnight.toISOString(), "2026-05-14T15:00:00.000Z");
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

test("keeps the VWorld sun-vector axis convention", () => {
  const distance = 10;
  const southHorizon = getSunVector({ altitude: 0, azimuth: 0, distance });
  const westHorizon = getSunVector({ altitude: 0, azimuth: Math.PI / 2, distance });
  const zenith = getSunVector({ altitude: Math.PI / 2, azimuth: 0, distance });

  assert.deepEqual(southHorizon, [0, 0, 10]);
  assert.ok(Math.abs(westHorizon[0] - 10) < 1e-12);
  assert.ok(Math.abs(westHorizon[1]) < 1e-12);
  assert.ok(Math.abs(westHorizon[2]) < 1e-12);
  assert.ok(Math.abs(zenith[0]) < 1e-12);
  assert.ok(Math.abs(zenith[1] - 10) < 1e-12);
  assert.ok(Math.abs(zenith[2]) < 1e-12);
});
