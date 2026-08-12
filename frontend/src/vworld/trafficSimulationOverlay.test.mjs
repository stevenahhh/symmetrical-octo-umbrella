import assert from "node:assert/strict";
import test from "node:test";
import { simulationPointToVWorld, trafficModelUri } from "./trafficSimulationOverlay.mjs";

test("maps the backup simulation origin into the aligned D4 VWorld footprint", () => {
  const point = simulationPointToVWorld({ x: 0, z: 0 });
  assert.equal(point.longitude, 127.4764043);
  assert.equal(point.latitude, 34.9700548);
});

test("preserves metric movement around the shared GLB/VWorld alignment", () => {
  const origin = simulationPointToVWorld({ x: 0, z: 0 });
  const moved = simulationPointToVWorld({ x: 10, z: 0 });
  assert.ok(moved.longitude > origin.longitude);
  assert.equal(moved.latitude, origin.latitude);
});

test("switches the car model when proximity risk changes", () => {
  assert.equal(trafficModelUri({ type: "car", risk_level: "normal" }), "/traffic/car.glb");
  assert.equal(trafficModelUri({ type: "car", risk_level: "danger" }), "/traffic/car-danger.glb");
  assert.equal(trafficModelUri({ type: "person", risk_level: "danger" }), "/traffic/person.glb");
});
