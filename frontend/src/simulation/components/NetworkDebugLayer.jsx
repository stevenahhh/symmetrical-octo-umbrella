import React, { useEffect, useMemo, useState } from "react";
import { Line } from "@react-three/drei";
import { SIMULATION_API_URL } from "../utils/apiConfig";
import { simulationToThree } from "../utils/coordinateTransform";

const STYLE = {
  vehicle_lane: ["#2563eb", false], allowed_road: ["#2563eb", false], vehicle_gate: ["#2563eb", false], parking_connection: ["#2563eb", false],
  sidewalk: ["#16a34a", true], shared_path: ["#9333ea", false], pedestrian_gate: ["#16a34a", true], parking_walk: ["#16a34a", true], building_entrance: ["#22c55e", true],
  scooter_lane: ["#f97316", false], bike_lane: ["#f97316", false], scooter_parking_connection: ["#f97316", false],
  crosswalk: ["#ffffff", false],
};

function positionsFor(feature, config, resolveHeight) {
  const coordinates = feature.geometry?.type === "Polygon" ? feature.geometry.coordinates?.[0] : feature.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return coordinates.map(([x, z]) => {
    const point = simulationToThree({ x, y: 0, z }, config);
    point.y = (resolveHeight?.(point) ?? point.y) + 0.25;
    return [point.x, point.y, point.z];
  });
}

export function NetworkDebugLayer({ coordinateConfig, resolveHeight, enabled }) {
  const [network, setNetwork] = useState(null);
  const [validation, setValidation] = useState(null);
  useEffect(() => {
    if (!enabled || network) return;
    Promise.all([
      fetch(`${SIMULATION_API_URL}/api/simulation/network`).then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))),
      fetch(`${SIMULATION_API_URL}/api/simulation/network/quality`).then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))),
    ]).then(([nextNetwork, nextValidation]) => { setNetwork(nextNetwork); setValidation(nextValidation); }).catch(() => {});
  }, [enabled, network]);
  const invalidNodes = useMemo(() => new Set([
    ...(validation?.errors || []), ...(validation?.warnings || []),
  ].flatMap((item) => item.node_id ? [item.node_id] : item.code === "DISCONNECTED_EDGE" ? [item.from, item.to] : [])), [validation]);
  if (!enabled || !network) return null;
  const nodes = new Map(network.features.filter((feature) => feature.properties?.feature_type === "node").map((feature) => [feature.properties.id, feature]));
  return (
    <group name="transport-network-debug">
      {network.features.filter((feature) => feature.properties?.feature_type === "edge").map((feature) => {
        const [color, dashed] = STYLE[feature.properties.kind] || ["#64748b", true];
        const points = positionsFor(feature, coordinateConfig, resolveHeight);
        return points.length > 1 ? <Line key={feature.properties.id} points={points} color={color} lineWidth={dashed ? 1.5 : 2} dashed={dashed} dashSize={1.5} gapSize={1} transparent opacity={feature.properties.derived ? 0.42 : 0.95} /> : null;
      })}
      {[...invalidNodes].map((nodeId) => {
        const feature = nodes.get(nodeId);
        if (!feature) return null;
        const [x, z] = feature.geometry.coordinates;
        const point = simulationToThree({ x, y: 0, z }, coordinateConfig);
        point.y = (resolveHeight?.(point) ?? point.y) + 0.5;
        return <mesh key={nodeId} position={[point.x, point.y, point.z]}><sphereGeometry args={[0.75, 10, 10]} /><meshBasicMaterial color="#ef4444" /></mesh>;
      })}
    </group>
  );
}
