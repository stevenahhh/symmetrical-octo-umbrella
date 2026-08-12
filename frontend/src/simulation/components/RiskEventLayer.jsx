import React from "react";
import { useSimulationStore } from "../stores/simulationStore";
import { simulationToThree } from "../utils/coordinateTransform";

export function RiskEventLayer({ coordinateConfig, resolveHeight }) {
  const markers = useSimulationStore((state) => {
    const ids = new Set(state.riskEvents.slice(0, 10).flatMap((event) => event.object_ids || []));
    return Array.from(ids).map((id) => state.entities.get(id)).filter(Boolean);
  });
  return markers.map((entity) => {
    const position = simulationToThree(entity, coordinateConfig);
    const resolvedY = resolveHeight?.(position, entity);
    if (Number.isFinite(resolvedY)) position.y = resolvedY;
    return (
    <mesh key={`risk-${entity.id}`} position={[position.x, position.y + 2.8, position.z]}>
      <octahedronGeometry args={[0.38, 0]} />
      <meshBasicMaterial color={entity.risk_level === "danger" ? "#ef233c" : "#f59e0b"} />
    </mesh>
    );
  });
}
