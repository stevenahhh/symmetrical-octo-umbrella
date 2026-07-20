import assert from "node:assert/strict";
import test from "node:test";
import {
  D4_COORDINATE_HIT_TOLERANCE_DEGREES,
  isCoordinateMarkerHit,
} from "./coordinateMarkerHit.mjs";
import { D4_COORDINATE_MARKER } from "./d4CoordinateMarker.mjs";

test("matches D4 when a map click lands within the coordinate tolerance", () => {
  assert.equal(
    isCoordinateMarkerHit(
      {
        longitudeDD:
          D4_COORDINATE_MARKER.longitude +
          D4_COORDINATE_HIT_TOLERANCE_DEGREES / 2,
        latitudeDD: D4_COORDINATE_MARKER.latitude,
      },
      D4_COORDINATE_MARKER,
    ),
    true,
  );
});

test("does not match D4 when a map click lands outside the coordinate tolerance", () => {
  assert.equal(
    isCoordinateMarkerHit(
      {
        longitudeDD:
          D4_COORDINATE_MARKER.longitude +
          D4_COORDINATE_HIT_TOLERANCE_DEGREES * 1.01,
        latitudeDD: D4_COORDINATE_MARKER.latitude,
      },
      D4_COORDINATE_MARKER,
    ),
    false,
  );
});

test("does not match D4 without VWorld cartographic coordinates", () => {
  assert.equal(isCoordinateMarkerHit(null, D4_COORDINATE_MARKER), false);
  assert.equal(
    isCoordinateMarkerHit(
      { longitudeDD: D4_COORDINATE_MARKER.longitude },
      D4_COORDINATE_MARKER,
    ),
    false,
  );
});
