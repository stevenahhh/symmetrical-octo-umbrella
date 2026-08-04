export function applyVWorldSunSimulation(date) {
  const browserWindow = globalThis.window;
  const viewer = browserWindow?.ws3d?.viewer;
  const Cesium = browserWindow?.Cesium;
  const JulianDate = Cesium?.JulianDate;

  if (
    !(date instanceof Date) ||
    Number.isNaN(date.getTime()) ||
    !viewer?.clock ||
    !viewer.scene?.globe ||
    !viewer.scene.shadowMap ||
    !viewer.scene.sun ||
    typeof viewer.scene.requestRender !== "function" ||
    typeof JulianDate?.fromDate !== "function"
  ) {
    return false;
  }

  viewer.clock.currentTime = JulianDate.fromDate(date);
  viewer.clock.shouldAnimate = false;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.dynamicAtmosphereLighting = true;
  viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
  if (Cesium?.ShadowMode?.ENABLED !== undefined) {
    viewer.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
  }
  if (typeof Cesium?.SunLight === "function") {
    viewer.scene.light = new Cesium.SunLight({ intensity: 2.2 });
  }
  if ("highDynamicRange" in viewer.scene) {
    viewer.scene.highDynamicRange = true;
  }
  viewer.scene.shadowMap.enabled = true;
  viewer.scene.shadowMap.softShadows = true;
  viewer.scene.shadowMap.darkness = 0.4;
  viewer.scene.sun.show = true;
  viewer.scene.sun.glowFactor = 2;
  viewer.scene.sunBloom = true;
  viewer.shadows = true;
  viewer.scene.requestRender();

  return true;
}
