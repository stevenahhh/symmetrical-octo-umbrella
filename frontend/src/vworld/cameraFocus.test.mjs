import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFocusAltitude,
  createBuildingCameraController,
  focusMapAt,
} from "./cameraFocus.mjs";

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

test("calculateFocusAltitude increases zoom when UI reduces the available map width", () => {
  assert.equal(
    calculateFocusAltitude({ viewportWidth: 1440, availableWidth: 1440 }),
    120,
  );
  assert.equal(
    calculateFocusAltitude({ viewportWidth: 1440, availableWidth: 960 }),
    180,
  );
});

test("building camera reframes on layout resize and user input pauses automatic orbit", () => {
  const movedTo = [];
  const listeners = new Map();
  let resizeCallback;
  let frameCallback;
  let now = 0;

  class CoordZ {
    constructor(longitude, latitude, altitude) {
      Object.assign(this, { longitude, latitude, altitude });
    }
  }
  class Direction {
    constructor(heading, pitch, roll) {
      Object.assign(this, { heading, pitch, roll });
    }
  }
  class CameraPosition {
    constructor(coordinate, direction) {
      Object.assign(this, { coordinate, direction });
    }
  }

  const viewport = {
    clientWidth: 1440,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const availableArea = { clientWidth: 960 };
  const controller = createBuildingCameraController({
    map: { lookat: { moveTo: (position) => movedTo.push(position) } },
    vw: { CoordZ, Direction, CameraPosition },
    viewport,
    availableArea,
    ResizeObserverClass: class ResizeObserver {
      constructor(callback) { resizeCallback = callback; }
      observe() {}
      disconnect() {}
    },
    requestFrame(callback) { frameCallback = callback; return 1; },
    cancelFrame() {},
    now: () => now,
  });

  controller.focus({ longitude: 127.4764043, latitude: 34.9700548 });
  assert.equal(movedTo.at(-1).coordinate.altitude, 180);

  availableArea.clientWidth = 1200;
  resizeCallback();
  assert.equal(movedTo.at(-1).coordinate.altitude, 144);
  assert.equal(movedTo.at(-1).direction.heading, 0);

  now = 1_000;
  frameCallback(1_000);
  const movesBeforeInput = movedTo.length;
  listeners.get("pointerdown")();
  now = 2_000;
  frameCallback?.(2_000);
  assert.equal(movedTo.length, movesBeforeInput);

  availableArea.clientWidth = 1000;
  resizeCallback();
  assert.ok(Math.abs(movedTo.at(-1).coordinate.altitude - 172.8) < 0.001);
  assert.equal(movedTo.at(-1).direction.heading, 0);

  controller.dispose();
  assert.equal(listeners.size, 0);
});
