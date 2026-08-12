import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPUS_GLTF_OVERLAY_CONFIG,
  createCampusGltfOverlay,
  removeCampusGltfOverlay,
} from "./campusGltfOverlay.mjs";

function fakeCesium() {
  class Matrix4 {
    static fromRotationTranslation(value) { return { rotation: value }; }
    static fromTranslation(value) { return { translation: value }; }
    static fromScale(value) { return { scale: value }; }
    static multiply(left, right) { return { left, right }; }
  }
  return {
    Cartographic: { fromDegrees: (longitude, latitude) => ({ longitude, latitude }) },
    Cartesian3: class Cartesian3 {
      constructor(x, y, z) { Object.assign(this, { x, y, z }); }
      static fromDegrees(longitude, latitude, height) { return { longitude, latitude, height }; }
    },
    Math: { toRadians: (degrees) => degrees * Math.PI / 180 },
    Matrix3: { fromRotationZ: (radians) => ({ radians }) },
    Matrix4,
    Model: { fromGltfAsync: async (options) => ({ options }) },
    ShadowMode: { DISABLED: "disabled" },
    Transforms: { eastNorthUpToFixedFrame: (origin) => ({ origin }) },
  };
}

test("anchors the campus GLB to D4 and registers it as a Cesium primitive", async () => {
  const added = [];
  const staleModel = { id: "SCNU_D4_GLTF_OVERLAY" };
  const primitives = [staleModel];
  const viewer = {
    scene: {
      globe: { getHeight: () => 31.5 },
      primitives: {
        get length() { return primitives.length; },
        get: (index) => primitives[index],
        add: (model) => { added.push(model); primitives.push(model); return model; },
        remove: (model) => {
          const index = primitives.indexOf(model);
          if (index >= 0) primitives.splice(index, 1);
          return index >= 0;
        },
      },
    },
  };
  const model = await createCampusGltfOverlay({ _wsViewer: viewer }, fakeCesium());
  assert.equal(model.options.url, "/campus-buildings.glb");
  assert.equal(model.options.modelMatrix.left.left.left.origin.longitude, CAMPUS_GLTF_OVERLAY_CONFIG.anchor.longitude);
  assert.equal(model.options.modelMatrix.left.left.left.origin.height, 32);
  assert.deepEqual(
    { ...model.options.modelMatrix.left.right.scale },
    { x: 1, y: 1, z: 1 },
  );
  assert.deepEqual(
    { ...model.options.modelMatrix.right.translation },
    {
      x: -46.51332723884707,
      y: -266.5741379078058,
      z: -36.85701517946295,
    },
  );
  assert.equal(primitives.includes(staleModel), false);
  assert.equal(model.id, "SCNU_D4_GLTF_OVERLAY");
  assert.equal(added[0], model);
  assert.equal(removeCampusGltfOverlay({ _wsViewer: viewer }, model), true);
});
