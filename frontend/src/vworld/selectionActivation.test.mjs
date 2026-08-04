import assert from "node:assert/strict";
import test from "node:test";
import { D4_COORDINATE_MARKER } from "./d4CoordinateMarker.mjs";
import {
  activateCoordinateMarkerSelection,
  activateNativeModelSelection,
} from "./selectionActivation.mjs";

test("defines D4 as the verified non-native coordinate marker", () => {
  assert.deepEqual(D4_COORDINATE_MARKER, {
    elementId: "BLD_D4",
    displayName: "공과대학 3호관",
    latitude: 34.9700548,
    longitude: 127.4764043,
    source: "coordinate-marker",
  });
  assert.equal("MODEL_NAME" in D4_COORDINATE_MARKER, false);
});

test("activates a resolved native model as a dashboard selection", () => {
  const selections = [];

  const selection = activateNativeModelSelection("SC090179", (nextSelection) => {
    selections.push(nextSelection);
  });

  assert.deepEqual(selection, {
    elementId: "BLD_D3",
    buildingId: "D3",
    displayName: "공과대학 2호관",
  });
  assert.deepEqual(selections, [selection]);
});

test("does not activate an unmapped native model", () => {
  const selections = [];

  const selection = activateNativeModelSelection("SC999999", (nextSelection) => {
    selections.push(nextSelection);
  });

  assert.equal(selection, null);
  assert.deepEqual(selections, []);
});

test("activates D4 through the same dashboard selection shape", () => {
  const selections = [];

  const selection = activateCoordinateMarkerSelection(
    D4_COORDINATE_MARKER,
    (nextSelection) => {
      selections.push(nextSelection);
    },
  );

  assert.deepEqual(selection, {
    elementId: "BLD_D4",
    buildingId: "D4",
    displayName: "공과대학 3호관",
  });
  assert.deepEqual(selections, [selection]);
});
