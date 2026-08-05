import assert from "node:assert/strict";
import test from "node:test";
import { D4_BUILDING_DATA } from "../../../utils/d4BuildingData.mjs";
import { D4_VWORLD_VOLUMES } from "../../../vworld/d4VWorldModel.mjs";
import {
  ContractParseError,
  DEFAULT_PANEL_MODULE,
  ROOF_LAYOUT_SCHEMA,
  parseRoofLayoutDocument,
  summarizePanelArray,
} from "./roofContracts.mjs";
import {
  D4_ROOF_SCENARIO_FIXTURE,
  D4_ROOF_SOURCE_BASELINE,
} from "./fixtures/d4RoofScenarioFixture.mjs";

const clone = (value) => structuredClone(value);

function expectFieldError(payload, field, code) {
  assert.throws(
    () => parseRoofLayoutDocument(payload),
    (error) => {
      assert.equal(error instanceof ContractParseError, true);
      assert.equal(error.name, "ContractParseError");
      assert.equal(error.errors.some((item) => item.field === field && item.code === code), true);
      return true;
    },
  );
}

test("baseline-characterizes current D4 roof source dimensions without using them as layout coordinates", () => {
  const wing = D4_BUILDING_DATA.wings[0];
  const vworldWing = D4_VWORLD_VOLUMES.find((volume) => volume.id === "SCNU_D4_WEST_5");
  const longitudes = vworldWing.footprint.map((point) => point.longitude);
  const latitudes = vworldWing.footprint.map((point) => point.latitude);

  assert.equal(wing.width, D4_ROOF_SOURCE_BASELINE.sectionWingWidthSceneUnits);
  assert.equal(wing.depth, D4_ROOF_SOURCE_BASELINE.sectionWingDepthSceneUnits);
  assert.ok(Math.abs(Math.max(...longitudes) - Math.min(...longitudes) - D4_ROOF_SOURCE_BASELINE.vworldWingLongitudeSpanDegrees) < 1e-12);
  assert.ok(Math.abs(Math.max(...latitudes) - Math.min(...latitudes) - D4_ROOF_SOURCE_BASELINE.vworldWingLatitudeSpanDegrees) < 1e-12);
  assert.equal(D4_ROOF_SCENARIO_FIXTURE.coordinateSystem, "roof-local-meters");
});

test("round-trips the D4 roof/scenario fixture and derives 16 modules at 7.056 kWp", () => {
  const parsed = parseRoofLayoutDocument(JSON.parse(JSON.stringify(D4_ROOF_SCENARIO_FIXTURE)));
  assert.deepEqual(parsed, D4_ROOF_SCENARIO_FIXTURE);
  assert.deepEqual(summarizePanelArray(parsed.scenarios[0].arrays[0], parsed.modules), {
    moduleCount: 16,
    capacityKwp: 7.056,
  });
});

test("publishes exact module and clearance defaults with explicit units", () => {
  assert.deepEqual(DEFAULT_PANEL_MODULE, {
    id: "module-default-441wp",
    widthMeters: 1.05,
    lengthMeters: 2.1,
    efficiencyPercent: 20,
    nominalPowerWp: 441,
  });
  assert.match(ROOF_LAYOUT_SCHEMA.coordinateSystem.description, /meters/i);
  assert.match(ROOF_LAYOUT_SCHEMA.panelArray.originMeters, /meters/i);
  assert.match(ROOF_LAYOUT_SCHEMA.panelArray.azimuthDeg, /degrees/i);
});

test("rejects non-finite roof and array coordinates with explicit field errors", () => {
  const roofPayload = clone(D4_ROOF_SCENARIO_FIXTURE);
  roofPayload.roofs[0].zones[0].polygonMeters[1].xMeters = Infinity;
  expectFieldError(roofPayload, "roofs[0].zones[0].polygonMeters[1].xMeters", "finite_number");

  const arrayPayload = clone(D4_ROOF_SCENARIO_FIXTURE);
  arrayPayload.scenarios[0].arrays[0].originMeters.xMeters = Number.NaN;
  expectFieldError(arrayPayload, "scenarios[0].arrays[0].originMeters.xMeters", "finite_number");
});

test("rejects rows and columns below one and angles outside their closed ranges", () => {
  for (const [field, value, code] of [
    ["rows", 0, "positive_integer"],
    ["columns", 0, "positive_integer"],
    ["azimuthDeg", 360, "range"],
    ["tiltDeg", 46, "range"],
  ]) {
    const payload = clone(D4_ROOF_SCENARIO_FIXTURE);
    payload.scenarios[0].arrays[0][field] = value;
    expectFieldError(payload, `scenarios[0].arrays[0].${field}`, code);
  }
});

test("rejects unknown roof IDs, zone IDs, and module IDs", () => {
  for (const [field, value] of [
    ["roofId", "missing-roof"],
    ["roofZoneId", "missing-zone"],
    ["moduleId", "missing-module"],
  ]) {
    const payload = clone(D4_ROOF_SCENARIO_FIXTURE);
    payload.scenarios[0].arrays[0][field] = value;
    expectFieldError(payload, `scenarios[0].arrays[0].${field}`, "unknown_reference");
  }
});

test("rejects array/scenario and module nominal-power mismatches", () => {
  const scenarioPayload = clone(D4_ROOF_SCENARIO_FIXTURE);
  scenarioPayload.scenarios[0].arrays[0].scenarioId = "another-scenario";
  expectFieldError(scenarioPayload, "scenarios[0].arrays[0].scenarioId", "reference_mismatch");

  const modulePayload = clone(D4_ROOF_SCENARIO_FIXTURE);
  modulePayload.modules[0].nominalPowerWp = 440;
  expectFieldError(modulePayload, "modules[0].nominalPowerWp", "derived_value_mismatch");
});

test("rejects screen and geographic coordinates instead of storing them as layout geometry", () => {
  const payload = clone(D4_ROOF_SCENARIO_FIXTURE);
  payload.scenarios[0].arrays[0].originPixels = { x: 10, y: 20 };
  expectFieldError(payload, "scenarios[0].arrays[0].originPixels", "unknown_field");
});
