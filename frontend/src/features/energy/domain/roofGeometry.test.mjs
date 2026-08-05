import assert from "node:assert/strict";
import test from "node:test";
import { GeometryInputError, pointInPolygon, projectArrayFootprint, segmentDistance, validateRoofArrays } from "./roofGeometry.mjs";
import { RECOMMENDATION_AZIMUTHS_DEG, RECOMMENDATION_TILTS_DEG, generateArrayCandidates, recommendRoofScenario } from "./roofRecommendation.mjs";
import { DEFAULT_LAYOUT_RULES, DEFAULT_PANEL_MODULE } from "./roofContracts.mjs";

const rectangle = (id, x1, y1, x2, y2) => ({ id, polygonMeters: [
  { xMeters: x1, yMeters: y1 }, { xMeters: x2, yMeters: y1 },
  { xMeters: x2, yMeters: y2 }, { xMeters: x1, yMeters: y2 },
] });
const zone = rectangle("zone-main", 0, 0, 12, 12);
const roof = { id: "roof-a", buildingId: "D4", zones: [zone], obstacles: [] };
const array = (overrides = {}) => ({ id: "array-a", scenarioId: "scenario-user", roofId: "roof-a", roofZoneId: zone.id,
  moduleId: DEFAULT_PANEL_MODULE.id, originMeters: { xMeters: 6, yMeters: 6 }, rows: 2, columns: 2,
  azimuthDeg: 180, tiltDeg: 0, orientation: "portrait", ...overrides });
const validate = (arrays, selectedRoof = roof) => validateRoofArrays({ roof: selectedRoof, arrays, modules: [DEFAULT_PANEL_MODULE], layoutRules: DEFAULT_LAYOUT_RULES });

test("baseline-characterizes projected portrait, landscape, tilt, and rotation footprints", () => {
  const span = (points, key) => Math.max(...points.map((p) => p[key])) - Math.min(...points.map((p) => p[key]));
  const portrait = projectArrayFootprint(array({ rows: 2, columns: 8 }), DEFAULT_PANEL_MODULE, DEFAULT_LAYOUT_RULES);
  assert.ok(Math.abs(span(portrait, "xMeters") - 8.54) < 1e-12);
  assert.ok(Math.abs(span(portrait, "yMeters") - 4.22) < 1e-12);
  const landscape = projectArrayFootprint(array({ rows: 2, columns: 8, orientation: "landscape" }), DEFAULT_PANEL_MODULE, DEFAULT_LAYOUT_RULES);
  assert.ok(Math.abs(span(landscape, "xMeters") - 16.94) < 1e-12);
  assert.ok(Math.abs(span(landscape, "yMeters") - 2.12) < 1e-12);
  const rotated = projectArrayFootprint(array({ rows: 1, columns: 1, azimuthDeg: 135, tiltDeg: 45 }), DEFAULT_PANEL_MODULE, DEFAULT_LAYOUT_RULES);
  assert.ok(Math.abs(span(rotated, "xMeters") - (1.05 + 2.1 * Math.cos(Math.PI / 4)) / Math.sqrt(2)) < 1e-12);
});

test("point containment includes exact edges and segment distance is geometric", () => {
  assert.equal(pointInPolygon({ xMeters: 0, yMeters: 4 }, zone.polygonMeters), true);
  assert.equal(pointInPolygon({ xMeters: 6, yMeters: 6 }, zone.polygonMeters), true);
  assert.equal(pointInPolygon({ xMeters: -Number.EPSILON, yMeters: 4 }, zone.polygonMeters), false);
  assert.equal(segmentDistance({ xMeters: 0, yMeters: 0 }, { xMeters: 2, yMeters: 0 }, { xMeters: 1, yMeters: 1 }, { xMeters: 1, yMeters: 3 }), 1);
});

test("rejects 0.49 m and accepts exact 0.50 m roof-edge margin", () => {
  const exact = array({ rows: 1, columns: 1, originMeters: { xMeters: 1.025, yMeters: 6 } });
  assert.deepEqual(validate([exact]), []);
  const violations = validate([array({ ...exact, originMeters: { xMeters: 1.015, yMeters: 6 } })]);
  assert.deepEqual(violations.map((item) => item.code), ["ROOF_EDGE_MARGIN"]);
  assert.equal(violations[0].arrayId, "array-a");
  assert.match(violations[0].messageKo, /옥상.*0\.50m/);
});

test("rejects 0.99 m and accepts exact 1.00 m obstacle clearance with IDs", () => {
  const obstacle = { ...rectangle("vent-1", 4, 4, 5, 5), roofZoneId: zone.id };
  const obstacleRoof = { ...roof, obstacles: [obstacle] };
  const exact = array({ rows: 1, columns: 1, originMeters: { xMeters: 6.525, yMeters: 4.5 } });
  assert.deepEqual(validate([exact], obstacleRoof), []);
  const violations = validate([array({ ...exact, originMeters: { xMeters: 6.515, yMeters: 4.5 } })], obstacleRoof);
  assert.equal(violations[0].code, "OBSTACLE_CLEARANCE");
  assert.equal(violations[0].obstacleId, "vent-1");
  assert.match(violations[0].messageKo, /장애물.*1\.00m/);
});

test("detects rotated array overlap and exact contact", () => {
  const rotated = validate([array({ azimuthDeg: 135 }), array({ id: "array-b", originMeters: { xMeters: 6.2, yMeters: 6.2 }, azimuthDeg: 225 })]);
  assert.deepEqual(rotated.filter((v) => v.code === "ARRAY_OVERLAP").map((v) => [v.arrayId, v.otherArrayId]), [["array-a", "array-b"]]);
  const touching = array({ id: "array-b", rows: 1, columns: 1, originMeters: { xMeters: 7.05, yMeters: 6 } });
  assert.equal(validate([array({ rows: 1, columns: 1 }), touching]).some((v) => v.code === "ARRAY_OVERLAP"), true);
});

test("returns roof-edge and obstacle codes together", () => {
  const obstacle = { ...rectangle("edge-unit", 0, 5, 1, 7), roofZoneId: zone.id };
  const violations = validate([array({ rows: 1, columns: 1, originMeters: { xMeters: 0.4, yMeters: 6 } })], { ...roof, obstacles: [obstacle] });
  assert.deepEqual(violations.map((v) => v.code), ["ROOF_EDGE_MARGIN", "OBSTACLE_CLEARANCE"]);
  assert.equal(violations[1].obstacleId, "edge-unit");
});

test("malformed input raises a typed failure", () => {
  assert.throws(() => projectArrayFootprint(array({ originMeters: { xMeters: NaN, yMeters: 1 } }), DEFAULT_PANEL_MODULE, DEFAULT_LAYOUT_RULES),
    (error) => error instanceof GeometryInputError && error.code === "MALFORMED_GEOMETRY_INPUT");
});

test("candidate search axes and ordering are deterministic", () => {
  assert.deepEqual(RECOMMENDATION_AZIMUTHS_DEG, [90, 135, 180, 225, 270]);
  assert.deepEqual(RECOMMENDATION_TILTS_DEG, [0, 15, 25, 35, 45]);
  const options = { scenarioId: "suggested", roof, zone, module: DEFAULT_PANEL_MODULE, layoutRules: DEFAULT_LAYOUT_RULES, gridStepMeters: 20, maxRows: 1, maxColumns: 1 };
  const run = () => [...generateArrayCandidates(options)].map((c) => [c.azimuthDeg, c.tiltDeg, c.orientation]);
  assert.deepEqual(run(), run());
  assert.equal(run().length, 50);
  assert.deepEqual(run().slice(0, 3), [[90, 0, "portrait"], [90, 0, "landscape"], [90, 15, "portrait"]]);
});

test("recommendation is separate, deterministic, and does not mutate user input", () => {
  const scenario = { id: "scenario-user", buildingId: "D4", arrays: [array()] };
  const before = JSON.stringify(scenario);
  const input = { scenario, roof, zone, module: DEFAULT_PANEL_MODULE, layoutRules: DEFAULT_LAYOUT_RULES,
    suggestedScenarioId: "scenario-suggested", gridStepMeters: 1, maxRows: 2, maxColumns: 3 };
  const result = recommendRoofScenario(input);
  assert.equal(JSON.stringify(scenario), before);
  assert.equal(result.id, "scenario-suggested");
  assert.notEqual(result, scenario);
  assert.equal(result.arrays[0].scenarioId, result.id);
  assert.deepEqual(recommendRoofScenario(input), result);
});
