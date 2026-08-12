import React from "react";
import { Line } from "@react-three/drei";
import { routeEditorStore, useRouteEditorStore } from "../stores/routeEditorStore";
import { simulationToThree } from "../utils/coordinateTransform";

export function RouteDigitizerLayer({ coordinateConfig, resolveHeight }) {
  const state = useRouteEditorStore((value) => value);
  if (!state.enabled || state.points.length === 0) return null;
  const points = state.points.map((value) => {
    const point = simulationToThree(value, coordinateConfig);
    point.y = (resolveHeight?.(point) ?? point.y) + 0.45;
    return [point.x, point.y, point.z];
  });
  return (
    <group name="route-digitizer-draft">
      {points.length > 1 && <Line points={points} color="#facc15" lineWidth={4} />}
      {points.map((position, index) => (
        <mesh key={index} position={position} onPointerUp={(event) => { event.stopPropagation(); routeEditorStore.selectPoint(index); }}>
          <sphereGeometry args={[state.selectedPoint === index ? 1.05 : 0.7, 12, 12]} />
          <meshBasicMaterial color={state.selectedPoint === index ? "#ef4444" : "#facc15"} />
        </mesh>
      ))}
    </group>
  );
}
