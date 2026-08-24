import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { projectArrayFootprint } from "../domain/roofGeometry.mjs";
import { D4_BUILDING_FOOTPRINT, D4_ROOF_EQUIPMENT } from "../domain/fixtures/d4RoofScenarioFixture.mjs";

const localPoint = (point, center) => [point.xMeters - center.x, point.yMeters - center.y];
const zoneSurfaceHeight = (zoneId) => zoneId === "D4-roof-north-bottom-cement" ? 0.9 : 0.36;
const arraySurfaceHeight = (zoneId) => zoneId === "D4-roof-north-bottom-cement" ? 1.02 : 0.48;

// 옥상 아래 실제 건물 매스를 보여주기 위한 층수/높이. representativePlanVWorld.mjs의
// D4_WEST_ROOF.distanceFromTerrain(20.4m, 실험동 5개 층 기준)과 동일한 실측값을 사용해
// 브이월드 오버레이와 이 편집기 화면의 건물 높이가 어긋나지 않도록 맞춘다.
const BUILDING_PROFILE_BY_ROOF_ID = {
  "D4-roof-west": { heightMeters: 20.4, floors: 5 },
};
const DEFAULT_BUILDING_PROFILE = { heightMeters: 16.4, floors: 4 };

function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const scale = size.width < 900 ? 1.18 : 1;
    camera.position.set(34 * scale, 102 * scale, 94 * scale);
    camera.near = 2;
    camera.far = 350;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.height, size.width]);
  return null;
}

function buildWallsGeometry(points, center, heightMeters) {
  const positions = [];
  for (let index = 0; index < points.length; index += 1) {
    const p1 = points[index];
    const p2 = points[(index + 1) % points.length];
    const [x1, y1] = localPoint(p1, center);
    const [x2, y2] = localPoint(p2, center);
    const top1 = [x1, 0, -y1];
    const top2 = [x2, 0, -y2];
    const bottom2 = [x2, -heightMeters, -y2];
    const bottom1 = [x1, -heightMeters, -y1];
    positions.push(...top1, ...top2, ...bottom2, ...top1, ...bottom2, ...bottom1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildFloorLinesGeometry(points, center, heightMeters, floors) {
  const positions = [];
  for (let floor = 1; floor < floors; floor += 1) {
    const y = -(heightMeters * floor) / floors;
    for (let index = 0; index < points.length; index += 1) {
      const p1 = points[index];
      const p2 = points[(index + 1) % points.length];
      const [x1, y1] = localPoint(p1, center);
      const [x2, y2] = localPoint(p2, center);
      positions.push(x1, y, -y1, x2, y, -y2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function BuildingMass({ zones, center, profile, footprint = null, showGround = true }) {
  const massZones = footprint ? [{ id: "building-footprint", polygonMeters: footprint }] : zones;
  const wallsByZone = useMemo(
    () => massZones.map((zone) => buildWallsGeometry(zone.polygonMeters, center, profile.heightMeters)),
    [massZones, center, profile.heightMeters],
  );
  const floorLinesByZone = useMemo(
    () => massZones.map((zone) => buildFloorLinesGeometry(zone.polygonMeters, center, profile.heightMeters, profile.floors)),
    [massZones, center, profile.heightMeters, profile.floors],
  );
  return <group>
    {wallsByZone.map((geometry, index) => <mesh key={massZones[index].id} geometry={geometry}>
      <meshStandardMaterial color="#415675" roughness={0.72} side={THREE.DoubleSide} />
    </mesh>)}
    {floorLinesByZone.map((geometry, index) => <lineSegments key={massZones[index].id} geometry={geometry}>
      <lineBasicMaterial color="#4b6182" transparent opacity={0.7} />
    </lineSegments>)}
    {showGround && massZones.map((zone) => <FlatPolygon key={`${zone.id}-ground`} points={zone.polygonMeters} center={center} color="#0b1220" y={-profile.heightMeters - 0.02} />)}
  </group>;
}

function roofCenter(roof) {
  const points = roof.id === "D4-roof-west"
    ? D4_BUILDING_FOOTPRINT
    : roof.zones.flatMap((zone) => zone.polygonMeters);
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
  return <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <shapeGeometry args={[shape]} />
    <meshStandardMaterial color={color} opacity={opacity} transparent={opacity < 1} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} side={THREE.DoubleSide} />
  </mesh>;
}

function ArrayPlate({ array, module, rules, center, selected, invalid, onSelect, onDragStart }) {
  const footprint = useMemo(() => projectArrayFootprint(array, module, rules), [array, module, rules]);
  const surfaceHeight = arraySurfaceHeight(array.roofZoneId);
  return <group>
    <group onPointerDown={(event) => { event.stopPropagation(); onSelect(array.id); onDragStart(array.id); }}>
      <FlatPolygon points={footprint} center={center} color={invalid ? "#ef4444" : selected ? "#f59e0b" : "#2563eb"} y={surfaceHeight} />
    </group>
    {selected && footprint.map((point, index) => {
      const [x, z] = localPoint(point, center);
      return <mesh key={index} position={[x, surfaceHeight + 0.1, -z]}><sphereGeometry args={[0.22, 12, 12]} /><meshStandardMaterial color={invalid ? "#fecaca" : "#fde68a"} /></mesh>;
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
    <ResponsiveCamera />
    <ambientLight intensity={2.7} />
    <hemisphereLight args={["#e0f2fe", "#1e293b", 2.2]} />
    <directionalLight intensity={2.8} position={[24, 42, 28]} />
    <gridHelper args={[110, 110, "#475569", "#1e293b"]} position={[0, -0.08, 0]} />
    <BuildingMass zones={state.roof.zones} center={center} footprint={state.roof.id === "D4-roof-west" ? D4_BUILDING_FOOTPRINT : null} profile={BUILDING_PROFILE_BY_ROOF_ID[state.roof.id] ?? DEFAULT_BUILDING_PROFILE} />
    {state.roof.id === "D4-roof-west" && <FlatPolygon points={D4_BUILDING_FOOTPRINT} center={center} color="#526277" y={-0.02} />}
    {state.roof.id === "D4-roof-west" && D4_ROOF_EQUIPMENT.map((equipment) => <group key={equipment.id}>
      <FlatPolygon points={equipment.polygonMeters} center={center} color={equipment.color ?? "#94a3b8"} y={equipment.heightMeters} />
      <BuildingMass zones={[{ id: equipment.id, polygonMeters: equipment.polygonMeters }]} center={center} profile={{ heightMeters: -equipment.heightMeters, floors: 1 }} showGround={false} />
    </group>)}
    {state.roof.zones.map((zone) => <FlatPolygon key={zone.id} points={zone.polygonMeters} center={center} color="#ef4444" opacity={0.88} y={zoneSurfaceHeight(zone.id)} />)}
    {state.roof.obstacles.map((obstacle) => <FlatPolygon key={obstacle.id} points={obstacle.polygonMeters} center={center} color="#94a3b8" y={0.4} />)}
    {state.previewArrays.map((array) => <ArrayPlate key={array.id} array={array} module={state.modules.find((item) => item.id === array.moduleId)} rules={state.layoutRules} center={center} selected={array.id === state.selectedArrayId} invalid={invalidIds.has(array.id)} onSelect={onSelect} onDragStart={setDraggingId} />)}
    <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerMove={move} onPointerUp={() => setDraggingId(null)} onPointerLeave={() => setDraggingId(null)}>
      <planeGeometry args={[130, 130]} /><meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
    <OrbitControls makeDefault enabled={!draggingId} enableDamping minDistance={35} maxDistance={220} maxPolarAngle={Math.PI / 2.2} />
  </>;
}

export function RoofEditorScene({ state, onSelect, onMove }) {
  const center = useMemo(() => roofCenter(state.roof), [state.roof]);
  return <Canvas camera={{ position: [42, 82, 78], fov: 38, near: 2, far: 350 }} gl={{ toneMappingExposure: 1.12, antialias: true, alpha: true }} aria-label={`${state.roof.buildingId} 옥상 배열 배치 캔버스`}>
    <RoofPlane state={state} center={center} onSelect={onSelect} onMove={onMove} />
  </Canvas>;
}
