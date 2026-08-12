export const CAMPUS_GLTF_OVERLAY_CONFIG = Object.freeze({
  url: "/campus-buildings.glb",
  d4SceneNodeIndex: 250,
  anchor: Object.freeze({ longitude: 127.4764043, latitude: 34.9700548 }),
  // uni.glb's transformed BLD_D4 center/base in local east/north/up metres.
  d4LocalAnchorMeters: Object.freeze({
    east: 46.51332723884707,
    north: 266.5741379078058,
    up: 36.85701517946295,
  }),
  headingDegrees: -14.5,
  fallbackGroundHeightMeters: 40,
  terrainOffsetMeters: 0.5,
  modelScale: Object.freeze({ east: 1, north: 1, up: 1 }),
});

function getViewer(map) {
  return map?._wsViewer ?? null;
}

function terrainHeight(viewer, Cesium, longitude, latitude) {
  const cartographic = Cesium.Cartographic.fromDegrees(longitude, latitude);
  const sampledHeight = viewer.scene?.globe?.getHeight?.(cartographic);
  return Number.isFinite(sampledHeight)
    ? sampledHeight
    : CAMPUS_GLTF_OVERLAY_CONFIG.fallbackGroundHeightMeters;
}

export function createCampusModelMatrix(viewer, Cesium, config = CAMPUS_GLTF_OVERLAY_CONFIG) {
  const groundHeight = terrainHeight(
    viewer,
    Cesium,
    config.anchor.longitude,
    config.anchor.latitude,
  );
  const origin = Cesium.Cartesian3.fromDegrees(
    config.anchor.longitude,
    config.anchor.latitude,
    groundHeight + config.terrainOffsetMeters,
  );
  const eastNorthUp = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const heading = Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(config.headingDegrees)),
  );
  const scale = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(
    config.modelScale.east,
    config.modelScale.north,
    config.modelScale.up,
  ));
  const offset = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(
    -config.d4LocalAnchorMeters.east,
    -config.d4LocalAnchorMeters.north,
    -config.d4LocalAnchorMeters.up,
  ));
  const orientedScale = Cesium.Matrix4.multiply(
    Cesium.Matrix4.multiply(eastNorthUp, heading, new Cesium.Matrix4()),
    scale,
    new Cesium.Matrix4(),
  );
  return Cesium.Matrix4.multiply(
    orientedScale,
    offset,
    new Cesium.Matrix4(),
  );
}

export async function createCampusGltfOverlay(map, Cesium = globalThis.window?.Cesium) {
  const viewer = getViewer(map);
  const fromGltf = Cesium?.Model?.fromGltfAsync ?? Cesium?.Model?.fromGltf;
  if (!viewer || !fromGltf) return null;

  for (let index = viewer.scene.primitives.length - 1; index >= 0; index -= 1) {
    const primitive = viewer.scene.primitives.get(index);
    if (primitive?.id === "SCNU_D4_GLTF_OVERLAY") {
      viewer.scene.primitives.remove(primitive);
    }
  }

  const model = await fromGltf.call(Cesium.Model, {
    url: CAMPUS_GLTF_OVERLAY_CONFIG.url,
    modelMatrix: createCampusModelMatrix(viewer, Cesium),
    allowPicking: true,
    minimumPixelSize: 0,
    shadows: Cesium.ShadowMode?.DISABLED,
  });
  model.id = "SCNU_D4_GLTF_OVERLAY";
  viewer.scene.primitives.add(model);
  return model;
}

export function removeCampusGltfOverlay(map, model) {
  const viewer = getViewer(map);
  if (!viewer || !model) return false;
  return viewer.scene.primitives.remove(model);
}
