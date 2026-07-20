import assert from "node:assert/strict";
import test from "node:test";
import { focusMapAt } from "./cameraFocus.mjs";

test("focusMapAt moves VWorld exactly once with documented camera arguments", () => {
  const movedTo = [];

  class CoordZ {
    constructor(longitude, latitude, altitude) {
      this.longitude = longitude;
      this.latitude = latitude;
      this.altitude = altitude;
    }
  }

  class Direction {
    constructor(heading, pitch, roll) {
      this.heading = heading;
      this.pitch = pitch;
      this.roll = roll;
    }
  }

  class CameraPosition {
    constructor(coordinate, direction) {
      this.coordinate = coordinate;
      this.direction = direction;
    }
  }

  const vw = { CameraPosition, CoordZ, Direction };
  const map = {
    lookat: {
      moveTo(cameraPosition) {
        movedTo.push(cameraPosition);
      },
    },
  };

  const focused = focusMapAt(map, vw, {
    longitude: 127.4764043,
    latitude: 34.9700548,
  });

  assert.equal(focused, true);
  assert.equal(movedTo.length, 1);
  assert.ok(movedTo[0] instanceof CameraPosition);
  assert.ok(movedTo[0].coordinate instanceof CoordZ);
  assert.deepEqual(
    [
      movedTo[0].coordinate.longitude,
      movedTo[0].coordinate.latitude,
      movedTo[0].coordinate.altitude,
    ],
    [127.4764043, 34.9700548, 200],
  );
  assert.ok(movedTo[0].direction instanceof Direction);
  assert.deepEqual(
    [
      movedTo[0].direction.heading,
      movedTo[0].direction.pitch,
      movedTo[0].direction.roll,
    ],
    [0, -60, 0],
  );
});

test("focusMapAt leaves VWorld unchanged for invalid coordinates", () => {
  const movedTo = [];
  const map = {
    lookat: {
      moveTo(cameraPosition) {
        movedTo.push(cameraPosition);
      },
    },
  };

  assert.equal(
    focusMapAt(map, {}, { longitude: Number.NaN, latitude: 34.9700548 }),
    false,
  );
  assert.equal(
    focusMapAt(map, {}, { longitude: 127.4764043, latitude: Infinity }),
    false,
  );
  assert.deepEqual(movedTo, []);
});

test("focusMapAt leaves VWorld unchanged without a lookat moveTo API", () => {
  const directMoveToCalls = [];
  const map = {
    moveTo(cameraPosition) {
      directMoveToCalls.push(cameraPosition);
    },
  };

  assert.equal(
    focusMapAt(map, {}, { longitude: 127.4764043, latitude: 34.9700548 }),
    false,
  );
  assert.deepEqual(directMoveToCalls, []);
});
