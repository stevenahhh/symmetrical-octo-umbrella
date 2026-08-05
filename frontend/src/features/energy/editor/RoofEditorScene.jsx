import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";
import { projectArrayFootprint } from "../domain/roofGeometry.mjs";

const localPoint = (point, center) => [point.xMeters - center.x, point.yMeters - center.y];

function roofCenter(roof) {
  const points = roof.zones.flatMap((zone) => zone.polygonMeters);
  return {
    x: (Math.min(...points.map((point) => point.xMeters)) + Math.max(...points.map((point) => point.xMeters))) / 2,
    y: (Math.min(...points.map((point) => point.yMeters)) + Math.max(...points.map((point) => point.yMeters))) / 2,
  };
}

function shapeFor(points, center) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    const [x, y] = localPoint(point, center);
    if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function FlatPolygon({ points, center, color, opacity = 1, y = 0 }) {
  const shape = useMemo(() => shapeFor(points, center), [points, center]);
  return <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <shapeGeometry args={[shape]} />
    <meshStandardMaterial color={color} opacity={opacity} transparent={opacity < 1} side={THREE.DoubleSide} />
  </mesh>;
}

function ArrayPlate({ array, module, rules, center, selected, invalid, onSelect, onDragStart }) {
  const footprint = useMemo(() => projectArrayFootprint(array, module, rules), [array, module, rules]);
  return <group>
    <group onPointerDown={(event) => { event.stopPropagation(); onSelect(array.id); onDragStart(array.id); }}>
      <FlatPolygon points={footprint} center={center} color={invalid ? "#ef4444" : selected ? "#f59e0b" : "#2563eb"} y={0.12} />
    </group>
    {selected && footprint.map((point, index) => {
      const [x, z] = localPoint(point, center);
      return <mesh key={index} position={[x, 0.2, -z]}><sphereGeometry args={[0.22, 12, 12]} /><meshStandardMaterial color={invalid ? "#fecaca" : "#fde68a"} /></mesh>;
    })}
  </group>;
}

function RoofPlane({ state, center, onSelect, onMove }) {
  const [draggingId, setDraggingId] = useState(null);
  const invalidIds = new Set(state.violations.map((item) => item.arrayId));
  const move = (event) => {
    if (!draggingId) return;
    event.stopPropagation();
    onMove({ xMeters: Number((event.point.x + center.x).toFixed(2)), yMeters: Number((-event.point.z + center.y).toFixed(2)) });
  };
  return <>
    <ambientLight intensity={1.4} />
    <directionalLight castShadow intensity={2.2} position={[18, 30, 15]} />
    <gridHelper args={[56, 56, "#475569", "#1e293b"]} position={[0, -0.08, 0]} />
    {state.roof.zones.map((zone) => <FlatPolygon key={zone.id} points={zone.polygonMeters} center={center} color="#1e3a4d" y={0} />)}
    {state.roof.obstacles.map((obstacle) => <FlatPolygon key={obstacle.id} points={obstacle.polygonMeters} center={center} color="#64748b" y={0.08} />)}
    {state.previewArrays.map((array) => <ArrayPlate key={array.id} array={array} module={state.modules.find((item) => item.id === array.moduleId)} rules={state.layoutRules} center={center} selected={array.id === state.selectedArrayId} invalid={invalidIds.has(array.id)} onSelect={onSelect} onDragStart={setDraggingId} />)}
    <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerMove={move} onPointerUp={() => setDraggingId(null)} onPointerLeave={() => setDraggingId(null)}>
      <planeGeometry args={[80, 80]} /><meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
    <OrbitControls makeDefault enabled={!draggingId} enableDamping minDistance={20} maxDistance={95} maxPolarAngle={Math.PI / 2.35} />
  </>;
}

export function RoofEditorScene({ state, onSelect, onMove }) {
  const center = useMemo(() => roofCenter(state.roof), [state.roof]);
  return <Canvas camera={{ position: [27, 45, 38], fov: 42 }} shadows aria-label={`${state.roof.buildingId} 옥상 배열 배치 캔버스`}>
    <color attach="background" args={["#07101b"]} />
    <fog attach="fog" args={["#07101b", 55, 105]} />
    <RoofPlane state={state} center={center} onSelect={onSelect} onMove={onMove} />
  </Canvas>;
}
