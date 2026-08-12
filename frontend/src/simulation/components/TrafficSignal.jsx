import React from "react";
import { simulationToThree } from "../utils/coordinateTransform";

export const TrafficSignal = React.memo(function TrafficSignal({ signal, coordinateConfig }) {
  const position = simulationToThree(signal, coordinateConfig);
  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.28, 1, 0.25]} />
        <meshStandardMaterial color="#252b2d" />
      </mesh>
      <mesh position={[0, 1.7, 0.14]}>
        <circleGeometry args={[0.09, 12]} />
        <meshBasicMaterial color={signal.state === "red" ? "#ef4444" : "#22c55e"} />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 1.3, 8]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
    </group>
  );
});
