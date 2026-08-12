const DEFAULT_FOCUS_ALTITUDE = 120;
const USER_INPUT_EVENTS = ["pointerdown", "wheel", "touchstart", "keydown"];

export function calculateFocusAltitude({
  viewportWidth,
  availableWidth,
  baseAltitude = DEFAULT_FOCUS_ALTITUDE,
}) {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(availableWidth) ||
    viewportWidth <= 0 ||
    availableWidth <= 0
  ) {
    return baseAltitude;
  }
  return baseAltitude * (viewportWidth / availableWidth);
}

export function focusMapAt(
  map,
  vw,
  { longitude, latitude, altitude = 200, heading = 0 },
) {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(altitude) ||
    !Number.isFinite(heading) ||
    typeof map?.lookat?.moveTo !== "function"
  ) {
    return false;
  }

  map.lookat.moveTo(
    new vw.CameraPosition(
      new vw.CoordZ(longitude, latitude, altitude),
      new vw.Direction(heading, -60, 0),
    ),
  );
  return true;
}

export function createBuildingCameraController({
  map,
  vw,
  viewport,
  availableArea,
  ResizeObserverClass = globalThis.ResizeObserver,
  requestFrame = globalThis.requestAnimationFrame,
  cancelFrame = globalThis.cancelAnimationFrame,
  now = () => globalThis.performance.now(),
}) {
  let target = null;
  let frameId = null;
  let orbitStartedAt = 0;
  let isAutomatic = false;

  const getAltitude = () =>
    calculateFocusAltitude({
      viewportWidth: viewport?.clientWidth,
      availableWidth: availableArea?.clientWidth,
    });

  const move = (heading = 0) => {
    if (!target) return false;
    return focusMapAt(map, vw, {
      ...target,
      altitude: getAltitude(),
      heading,
    });
  };

  const orbit = (timestamp) => {
    if (!isAutomatic || !target) return;
    const elapsedSeconds = Math.max(0, timestamp - orbitStartedAt) / 1000;
    move((elapsedSeconds * 4) % 360);
    frameId = requestFrame(orbit);
  };

  const cancelAutomaticMotion = () => {
    isAutomatic = false;
    if (frameId !== null) {
      cancelFrame(frameId);
      frameId = null;
    }
  };

  const resizeObserver = new ResizeObserverClass(() => {
    move();
  });
  resizeObserver.observe(availableArea);

  for (const eventName of USER_INPUT_EVENTS) {
    viewport.addEventListener(eventName, cancelAutomaticMotion, {
      passive: true,
      capture: true,
    });
  }

  return {
    focus(nextTarget) {
      cancelAutomaticMotion();
      target = nextTarget;
      isAutomatic = true;
      move();
      orbitStartedAt = now();
      frameId = requestFrame(orbit);
    },
    dispose() {
      cancelAutomaticMotion();
      resizeObserver.disconnect();
      for (const eventName of USER_INPUT_EVENTS) {
        viewport.removeEventListener(eventName, cancelAutomaticMotion, {
          capture: true,
        });
      }
    },
  };
}
