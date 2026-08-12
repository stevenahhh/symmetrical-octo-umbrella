import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { simulationHeadingToThree, simulationToThree } from "../utils/coordinateTransform";
import { PedestrianEntity } from "./PedestrianEntity";
import { ScooterEntity } from "./ScooterEntity";
import { VehicleEntity } from "./VehicleEntity";

function dampAngle(current, target, factor) {
  let difference = (target - current + Math.PI) % (Math.PI * 2) - Math.PI;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return current + difference * factor;
}

export const TrafficEntity = React.memo(function TrafficEntity({ entity, coordinateConfig, renderEntity, resolveHeight, selected, onSelect }) {
  const group = useRef();
  const initial = useMemo(() => {
    const position = simulationToThree(entity, coordinateConfig);
    const resolvedY = resolveHeight?.(position, entity);
    if (Number.isFinite(resolvedY)) position.y = resolvedY;
    return position;
  }, [entity.id, coordinateConfig, resolveHeight]);
  const currentPosition = useRef(new THREE.Vector3(initial.x, initial.y, initial.z));

  useFrame((_, delta) => {
    if (!group.current) return;
    const safeDelta = Math.min(delta, 0.1);
    const smoothing = 1 - Math.exp(-10 * safeDelta);
    const target = simulationToThree(entity, coordinateConfig);
    const resolvedY = resolveHeight?.(target, entity);
    if (Number.isFinite(resolvedY)) target.y = resolvedY;
    if (![target.x, target.y, target.z].every(Number.isFinite)) return;
    currentPosition.current.lerp(new THREE.Vector3(target.x, target.y, target.z), smoothing);
    group.current.position.copy(currentPosition.current);
    const targetHeading = simulationHeadingToThree(entity.heading, coordinateConfig);
    group.current.rotation.y = dampAngle(group.current.rotation.y, targetHeading, smoothing);
  });

  return (
    <group
      ref={group}
      position={[initial.x, initial.y, initial.z]}
      onClick={(event) => { event.stopPropagation(); onSelect?.(entity.id); }}
      onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = "default"; }}
      userData={{ simulationAgentId: entity.id }}
    >
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[2.1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>
      {renderEntity ? renderEntity(entity) : (
        <>
          {entity.type === "car" && <VehicleEntity riskLevel={entity.risk_level} emergency={String(entity.state).toLowerCase() === "emergency"} />}
          {entity.type === "person" && <PedestrianEntity speed={entity.speed} riskLevel={entity.risk_level} />}
          {entity.type === "scooter" && <ScooterEntity riskLevel={entity.risk_level} state={entity.state} />}
        </>
      )}
      {entity.risk_level !== "normal" && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.1, 1.35, 24]} />
          <meshBasicMaterial
            color={entity.risk_level === "danger" ? "#ef233c" : entity.risk_level === "warning" ? "#f59e0b" : "#eab308"}
            transparent
            opacity={0.75}
            depthWrite={false}
          />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.45, 1.62, 32]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
});
