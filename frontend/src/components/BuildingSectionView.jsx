import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

const ACTIVE_ROOM_COLOR = "#3b82f6";
const IDLE_ROOM_COLOR = "#94a3b8";

function getFloorY(floor) {
  return (floor - 1) * 1.25;
}

export function BuildingSectionView({
  building,
  rooms,
  roomUsageById,
  selectedRoomId,
  onSelectRoom,
}) {
  const { camera } = useThree();
  const floors = useMemo(
    () => [...building.floors].sort((a, b) => a.floor - b.floor),
    [building.floors],
  );
  const roomsByFloor = useMemo(() => {
    const roomMap = new Map();
    for (const room of rooms) {
      const floorRooms = roomMap.get(room.floor) ?? [];
      floorRooms.push(room);
      roomMap.set(room.floor, floorRooms);
    }
    return roomMap;
  }, [rooms]);

  useEffect(() => {
    camera.position.set(8.4, 7.4, 8.8);
    camera.lookAt(new THREE.Vector3(0, 2.8, 0));
    camera.updateProjectionMatrix();
  }, [camera]);

  return (
    <group position={[0, -2.6, 0]} rotation={[0, -0.72, 0]}>
      <Html position={[-5.6, 6.6, -2.6]} transform distanceFactor={14}>
        <div className="w-[280px] rounded-lg border border-white/20 bg-black/55 px-4 py-3 text-white shadow-xl backdrop-blur-md">
          <div className="text-[12px] font-[800] uppercase tracking-[0.08em] text-white/65">
            D4 BUILDING SECTION
          </div>
          <div className="mt-1 text-lg font-[900]">{building.displayName}</div>
          <div className="mt-1 text-[12px] font-[600] leading-5 text-white/70">
            왼쪽 동 5층, 오른쪽 동 6층과 3·5층 연결 다리를 반영했습니다.
          </div>
          <div className="mt-3 flex items-center gap-3 text-[11px] font-[800] text-white/75">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#3b82f6]" />사용 중
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#94a3b8]" />미사용
            </span>
          </div>
        </div>
      </Html>

      {floors.map((floor) => {
        const floorRooms = roomsByFloor.get(floor.floor) ?? [];
        const hasBridge = building.bridges.some((bridge) => bridge.floor === floor.floor);

        return (
          <group key={floor.id} position={[0, getFloorY(floor.floor), 0]}>
            {building.wings.map((wing) =>
              (floor.floor === 0 ? wing.hasBasement : floor.floor <= wing.floors) ? (
                <group key={`${floor.id}-${wing.id}`}>
                  <mesh position={[wing.x, -0.08, 0]} receiveShadow>
                    <boxGeometry args={[wing.width, 0.08, wing.depth]} />
                    <meshStandardMaterial color="#dfe7ef" transparent opacity={0.42} />
                  </mesh>
                  <mesh position={[wing.x, -0.02, 0]}>
                    <boxGeometry args={[wing.width + 0.12, 0.04, wing.depth + 0.12]} />
                    <meshStandardMaterial color="#2d3644" transparent opacity={0.18} />
                  </mesh>
                </group>
              ) : null,
            )}

            {hasBridge && (
              <group>
                <mesh position={[0, 0.02, 0]}>
                  <boxGeometry args={[1.6, 0.16, 1.25]} />
                  <meshStandardMaterial color="#cbd5e1" transparent opacity={0.72} />
                </mesh>
                <Html position={[0, 0.32, 0]} center distanceFactor={10}>
                  <div className="rounded-md border border-sky-100/70 bg-sky-950/80 px-2 py-1 text-[11px] font-[900] text-white shadow">
                    연결 다리
                  </div>
                </Html>
              </group>
            )}

            <Html position={[-4.15, 0.16, 0]} center distanceFactor={12}>
              <div className="min-w-[36px] whitespace-nowrap rounded-md border border-white/20 bg-slate-950/70 px-2 py-1 text-center text-[12px] font-[900] text-white shadow">
                {floor.label}
              </div>
            </Html>

            {floorRooms.map((room) => {
              const selected = room.id === selectedRoomId;
              const isInUse = roomUsageById.get(room.id) ?? false;
              const height = 0.28 + Math.min(0.62, room.weeklySavingsKwh / 180);

              return (
                <group
                  key={room.id}
                  position={[room.geometry.x, height / 2, room.geometry.z]}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    onSelectRoom(room.id);
                  }}
                >
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[room.geometry.width, height, room.geometry.depth]} />
                    <meshStandardMaterial
                      color={isInUse ? ACTIVE_ROOM_COLOR : IDLE_ROOM_COLOR}
                      emissive={selected ? "#f59e0b" : "#000000"}
                      emissiveIntensity={selected ? 0.18 : 0}
                    />
                  </mesh>
                  <Html position={[0, height / 2 + 0.16, 0]} center distanceFactor={10}>
                    <button
                      type="button"
                      className={`min-w-[48px] rounded-md border px-2 py-1 text-[12px] font-[900] shadow-lg ${selected ? "border-amber-200 bg-amber-300 text-slate-950" : "border-white/25 bg-slate-950/75 text-white"}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectRoom(room.id);
                      }}
                    >
                      {room.roomNumber}
                    </button>
                  </Html>
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
