import { useCallback, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { TrafficSimulationLayer } from "./components/TrafficSimulationLayer";
import { NetworkDebugLayer } from "./components/NetworkDebugLayer";
import { RouteDigitizerLayer } from "./components/RouteDigitizerLayer";
import { useRouteEditorStore } from "./stores/routeEditorStore";

// routes.geojson uses local east/north meters relative to the configured D4
// coordinate. The GLB was exported with this uniform scale and CityModel
// recenters its selectable-building anchors around the origin.
export const CAMPUS_TRAFFIC_COORDINATE_CONFIG = Object.freeze({
  origin: { x: -214.35, y: 24, z: -93.251 },
  scale: 0.6242171526,
  rotation_degrees: 0,
  invert_z: true,
});

const DOWN = new THREE.Vector3(0, -1, 0);

export function CampusTrafficSimulation() {
  const { scene } = useGLTF("/uni.glb");
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const cache = useRef(new Map());
  const editorEnabled = useRouteEditorStore((state) => state.enabled);
  const showNetwork = useRouteEditorStore((state) => state.showNetwork);

  const resolveHeight = useCallback((position) => {
    const terrain = scene.getObjectByName("Topography");
    if (!terrain) return CAMPUS_TRAFFIC_COORDINATE_CONFIG.origin.y;

    const key = `${Math.round(position.x * 2)}:${Math.round(position.z * 2)}`;
    const cached = cache.current.get(key);
    if (cached !== undefined) return cached;

    scene.updateWorldMatrix(true, true);
    raycaster.set(new THREE.Vector3(position.x, 160, position.z), DOWN);
    raycaster.far = 240;
    const hit = raycaster.intersectObject(terrain, true)[0];
    const height = hit ? hit.point.y + 0.12 : CAMPUS_TRAFFIC_COORDINATE_CONFIG.origin.y;
    if (cache.current.size > 5000) cache.current.clear();
    cache.current.set(key, height);
    return height;
  }, [raycaster, scene]);

  return <>
    <TrafficSimulationLayer
      coordinateConfig={CAMPUS_TRAFFIC_COORDINATE_CONFIG}
      resolveHeight={resolveHeight}
      showTrafficLights={false}
      showRiskEvents
    />
    <NetworkDebugLayer coordinateConfig={CAMPUS_TRAFFIC_COORDINATE_CONFIG} resolveHeight={resolveHeight} enabled={editorEnabled && showNetwork} />
    <RouteDigitizerLayer coordinateConfig={CAMPUS_TRAFFIC_COORDINATE_CONFIG} resolveHeight={resolveHeight} />
  </>;
}
