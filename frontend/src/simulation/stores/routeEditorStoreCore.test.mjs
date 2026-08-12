import assert from "node:assert/strict";
import test from "node:test";
import { createRouteEditorStore } from "./routeEditorStoreCore.mjs";

test("digitized sidewalk exports as a non-authoritative GLB draft", () => {
  const store = createRouteEditorStore();
  store.setEnabled(true);
  store.create();
  store.addPoint({ x: 1, y: 0, z: 2 });
  store.addPoint({ x: 3, y: 0, z: 4 });
  store.finish();
  const feature = store.toFeature();
  assert.equal(feature.properties.kind, "sidewalk");
  assert.deepEqual(feature.properties.allowed_types, ["person"]);
  assert.equal(feature.properties.derived, false);
  assert.equal(feature.properties.authoritative, false);
  assert.equal(feature.geometry.type, "LineString");
});

test("crosswalk polygon closes its ring", () => {
  const store = createRouteEditorStore();
  store.setMetadata({ kind: "crosswalk", geometryMode: "polygon" });
  store.create();
  for (const point of [[0, 0], [3, 0], [3, 2]]) store.addPoint({ x: point[0], y: 0, z: point[1] });
  store.finish();
  const feature = store.toFeature();
  assert.equal(feature.geometry.type, "Polygon");
  assert.deepEqual(feature.geometry.coordinates[0][0], feature.geometry.coordinates[0].at(-1));
});
