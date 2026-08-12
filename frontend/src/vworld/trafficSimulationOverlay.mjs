const D4_VWORLD_ANCHOR = Object.freeze({
  longitude: 127.4764043,
  latitude: 34.9700548,
});

const EARTH_RADIUS_METERS = 6_378_137;

export function simulationPointToVWorld(position) {
  const latitudeRadians = D4_VWORLD_ANCHOR.latitude * Math.PI / 180;
  return {
    longitude: D4_VWORLD_ANCHOR.longitude
      + (Number(position.x) / (EARTH_RADIUS_METERS * Math.cos(latitudeRadians))) * 180 / Math.PI,
    latitude: D4_VWORLD_ANCHOR.latitude
      + (Number(position.z) / EARTH_RADIUS_METERS) * 180 / Math.PI,
  };
}

export function trafficModelUri(entity) {
  const variant = entity.type === "car" && ["caution", "warning", "danger"].includes(entity.risk_level)
    ? `-${entity.risk_level}`
    : "";
  return `/traffic/${entity.type}${variant}.glb`;
}

function entityModel(entity) {
  return {
    uri: trafficModelUri(entity),
    scale: 1,
    minimumPixelSize: 0,
    maximumScale: 1,
    runAnimations: false,
    shadows: 1,
  };
}

function terrainHeight(viewer, Cesium, longitude, latitude) {
  const cartographic = Cesium.Cartographic.fromDegrees(longitude, latitude);
  const height = viewer.scene?.globe?.getHeight?.(cartographic);
  return Number.isFinite(height) ? height : 40;
}

export function createVWorldTrafficSimulation({
  map,
  Cesium = globalThis.window?.Cesium,
  websocketUrl = import.meta.env.VITE_SIMULATION_WS_URL || "ws://127.0.0.1:8002/ws/simulation",
}) {
  const viewer = map?._wsViewer;
  if (!viewer || !Cesium || typeof WebSocket === "undefined") return null;

  const objectIds = new Set();
  let disposed = false;
  let reconnectTimer = null;
  let socket = null;

  const clear = () => {
    for (const id of objectIds) viewer.entities.removeById(id);
    objectIds.clear();
  };

  const applyEntities = (entities) => {
    const nextIds = new Set();
    for (const entity of entities) {
      if (!entity?.id || !["car", "person", "scooter"].includes(entity.type)) continue;
      const point = simulationPointToVWorld(entity);
      const ground = terrainHeight(viewer, Cesium, point.longitude, point.latitude);
      const heading = Cesium.Math.toRadians(Number(entity.heading || 0) + 90);
      const id = `SCNU_SIM_${entity.id}`;
      const position = Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, ground + 0.08);
      const values = {
        position,
        orientation: Cesium.Transforms.headingPitchRollQuaternion(
          position,
          new Cesium.HeadingPitchRoll(heading, 0, 0),
        ),
        model: entityModel(entity),
      };
      const existing = viewer.entities.getById(id);
      if (existing) Object.assign(existing, values);
      else viewer.entities.add({ id, ...values });
      objectIds.add(id);
      nextIds.add(id);
    }
    for (const id of objectIds) {
      if (!nextIds.has(id)) {
        viewer.entities.removeById(id);
        objectIds.delete(id);
      }
    }
  };

  const connect = () => {
    if (disposed) return;
    socket = new WebSocket(websocketUrl);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "simulation_update" && Array.isArray(payload.entities)) {
          applyEntities(payload.entities);
        }
      } catch {
        // Ignore malformed simulation frames and keep the last valid positions.
      }
    };
    socket.onclose = () => {
      if (!disposed) reconnectTimer = setTimeout(connect, 1500);
    };
  };

  connect();
  return {
    clear,
    dispose() {
      disposed = true;
      clearTimeout(reconnectTimer);
      socket?.close();
      clear();
    },
  };
}
