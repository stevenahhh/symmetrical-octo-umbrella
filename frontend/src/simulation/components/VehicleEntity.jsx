import React from "react";

export const VehicleEntity = React.memo(function VehicleEntity({ riskLevel = "normal", emergency = false }) {
  const color = emergency ? "#2563eb" : riskLevel === "danger" ? "#dc2626" : riskLevel === "warning" ? "#f59e0b" : "#25636b";
  return (
    <group>
      <mesh castShadow position={[0, 0.48, 0]}>
        <boxGeometry args={[1.35, 0.75, 2.6]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh castShadow position={[0, 0.95, -0.15]}>
        <boxGeometry args={[1.12, 0.45, 1.2]} />
        <meshStandardMaterial color={emergency ? "#dbeafe" : "#d7e4e5"} roughness={0.35} />
      </mesh>
      {[[-0.72, 0.25, -0.75], [0.72, 0.25, -0.75], [-0.72, 0.25, 0.78], [0.72, 0.25, 0.78]].map((position, index) => (
        <mesh key={index} position={position} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 0.16, 12]} />
          <meshStandardMaterial color="#172029" />
        </mesh>
      ))}
      {emergency && (
        <mesh position={[0, 1.22, 0]}>
          <boxGeometry args={[0.65, 0.12, 0.18]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
      )}
    </group>
  );
});
