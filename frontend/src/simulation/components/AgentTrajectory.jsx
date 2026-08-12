import React, { useMemo } from "react";
import { Line } from "@react-three/drei";
import { simulationToThree } from "../utils/coordinateTransform";

export function AgentTrajectory({ details, coordinateConfig, resolveHeight }) {
  const points = useMemo(() => (details?.trajectory || []).map((sample) => {
    const [x, z] = Array.isArray(sample) ? sample : [sample.x, sample.z];
    const point = simulationToThree({ x, y: 0, z }, coordinateConfig);
    const height = resolveHeight?.(point, details);
    return [point.x, Number.isFinite(height) ? height + 0.18 : point.y + 0.18, point.z];
  }), [details, coordinateConfig, resolveHeight]);

  if (points.length < 2) return null;
  return <Line points={points} color="#06b6d4" lineWidth={2} transparent opacity={0.9} depthWrite={false} />;
}
