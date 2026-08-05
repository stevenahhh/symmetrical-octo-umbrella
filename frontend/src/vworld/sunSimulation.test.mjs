import assert from "node:assert/strict";
import test from "node:test";

test("applies the selected simulation date to VWorld lighting and shadows", async () => {
  const initialWindow = globalThis.window;
  const selectedDate = new Date(2026, 4, 15, 14, 30);
  const julianDate = Object.freeze({ dayNumber: 2_460_000 });
  let renderRequests = 0;
  class SunLight {
    constructor(options) {
      this.intensity = options.intensity;
    }
  }

  globalThis.window = {
    Cesium: {
      JulianDate: {
        fromDate(date) {
          assert.equal(date, selectedDate);
          return julianDate;
        },
      },
      ShadowMode: { ENABLED: "enabled" },
      SunLight,
    },
    ws3d: {
      viewer: {
        clock: { currentTime: null, shouldAnimate: true },
        scene: {
          globe: {
            dynamicAtmosphereLighting: false,
            dynamicAtmosphereLightingFromSun: false,
            enableLighting: false,
            shadows: "receive-only",
          },
          highDynamicRange: false,
          light: null,
          shadowMap: { darkness: 0.3, enabled: false, softShadows: false },
          sun: { glowFactor: 1, show: false },
          sunBloom: false,
          requestRender() {
            renderRequests += 1;
          },
        },
        shadows: false,
      },
    },
  };

  try {
    const { applyVWorldSunSimulation } = await import("./sunSimulation.mjs");

    assert.equal(applyVWorldSunSimulation(selectedDate), true);
    assert.equal(globalThis.window.ws3d.viewer.clock.currentTime, julianDate);
    assert.equal(globalThis.window.ws3d.viewer.clock.shouldAnimate, false);
    assert.equal(globalThis.window.ws3d.viewer.scene.globe.enableLighting, true);
    assert.equal(globalThis.window.ws3d.viewer.scene.globe.dynamicAtmosphereLighting, true);
    assert.equal(globalThis.window.ws3d.viewer.scene.globe.dynamicAtmosphereLightingFromSun, true);
    assert.equal(globalThis.window.ws3d.viewer.scene.globe.shadows, "enabled");
    assert.equal(globalThis.window.ws3d.viewer.scene.light.intensity, 2.2);
    assert.equal(globalThis.window.ws3d.viewer.scene.shadowMap.enabled, true);
    assert.equal(globalThis.window.ws3d.viewer.scene.shadowMap.softShadows, true);
    assert.equal(globalThis.window.ws3d.viewer.scene.shadowMap.darkness, 0.4);
    assert.equal(globalThis.window.ws3d.viewer.scene.sun.show, true);
    assert.equal(globalThis.window.ws3d.viewer.scene.sun.glowFactor, 2);
    assert.equal(globalThis.window.ws3d.viewer.scene.sunBloom, true);
    assert.equal(globalThis.window.ws3d.viewer.scene.highDynamicRange, true);
    assert.equal(globalThis.window.ws3d.viewer.shadows, true);
    assert.equal(renderRequests, 1);
  } finally {
    if (initialWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = initialWindow;
    }
  }
});
