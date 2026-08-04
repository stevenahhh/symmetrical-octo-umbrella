import assert from "node:assert/strict";
import test from "node:test";
import { D4_ROOF_SCENARIO_FIXTURE } from "../domain/fixtures/d4RoofScenarioFixture.mjs";
import { addArray, createRoofEditorState, deleteSelectedArray, moveSelectedArray, summarizeLayout, undoLatestEdit, updateSelectedArray } from "./roofEditorState.mjs";

const fixture = () => structuredClone(D4_ROOF_SCENARIO_FIXTURE);

test("add, select, rotate, tilt, resize, orient, drag, delete, and one-step undo", () => {
  let state = createRoofEditorState(fixture());
  const original = structuredClone(state.committedArrays);
  state = addArray(state);
  assert.equal(state.committedArrays.length, 2);
  assert.equal(state.selectedArrayId, "D4-array-2");
  state = updateSelectedArray(state, { azimuthDeg: 180, tiltDeg: 25, rows: 3, columns: 6, orientation: "landscape" });
  assert.deepEqual(Object.fromEntries(["azimuthDeg", "tiltDeg", "rows", "columns", "orientation"].map((key) => [key, state.committedArrays[1][key]])), { azimuthDeg: 180, tiltDeg: 25, rows: 3, columns: 6, orientation: "landscape" });
  state = moveSelectedArray(state, { xMeters: 21, yMeters: 12 });
  assert.deepEqual(state.committedArrays[1].originMeters, { xMeters: 21, yMeters: 12 });
  state = deleteSelectedArray(state);
  assert.equal(state.committedArrays.length, 1);
  state = undoLatestEdit(state);
  assert.equal(state.committedArrays.length, 2);
  assert.deepEqual(createRoofEditorState(fixture()).committedArrays, original);
});

test("invalid previews are Korean, red-state eligible, and never committed", () => {
  const state = createRoofEditorState(fixture());
  const before = structuredClone(state.committedArrays);
  const invalid = moveSelectedArray(state, { xMeters: 0.1, yMeters: 22 });
  assert.deepEqual(invalid.committedArrays, before);
  assert.notDeepEqual(invalid.previewArrays, before);
  assert.equal(invalid.canSave, false);
  assert.equal(invalid.violations[0].code, "ROOF_EDGE_MARGIN");
  assert.match(invalid.violations[0].messageKo, /옥상/);
});

test("new array IDs remain unique after deleting a non-final array", () => {
  let state = addArray(createRoofEditorState(fixture()));
  state = deleteSelectedArray({ ...state, selectedArrayId: "D4-array-south-2x8" });
  state = addArray(state);
  assert.deepEqual(state.committedArrays.map((item) => item.id), ["D4-array-2", "D4-array-3"]);
});

test("new array IDs use the edited building prefix", () => {
  const document = fixture();
  document.roofs[0].buildingId = "D3";
  document.scenarios[0].id = "D3-scenario-campus-baseline";
  document.scenarios[0].arrays[0].id = "D3-array-baseline";
  document.scenarios[0].arrays[0].scenarioId = document.scenarios[0].id;
  assert.equal(addArray(createRoofEditorState(document)).selectedArrayId, "D3-array-2");
});

test("summary reports module count, panel area, and capacity", () => {
  assert.deepEqual(summarizeLayout(createRoofEditorState(fixture())), { arrayCount: 1, moduleCount: 16, areaSquareMeters: 35.28, capacityKwp: 7.056 });
});

test("malformed document fails explicitly instead of creating stale state", () => {
  assert.throws(() => createRoofEditorState({ scenarios: [] }), /옥상 편집기 데이터/);
});
