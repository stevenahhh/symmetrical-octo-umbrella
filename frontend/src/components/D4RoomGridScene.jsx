import { Canvas, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { formatRoomNumber } from "../utils/d4BuildingData.mjs";

const SELECTED_COLOR = "#3b82f6";
const IDLE_COLOR = "#e4e7ec";
const UTILITY_COLOR = "#cbd0d8";
const UNIT = 1.35;
const ROW_DEPTH = 1.7;
const BOX_HEIGHT = 0.5;
const GAP = 0.12;

function RoomBox({ room, x, z, width, isSelected, isInUse, onSelect }) {
  const boxWidth = width * UNIT - GAP;
  const isUtility = !room.isSelectable;

  return (
    <group
      position={[x, 0, z]}
      onPointerUp={
        isUtility
          ? undefined
          : (event) => {
              event.stopPropagation();
              onSelect(room.id);
            }
      }
    >
      <mesh castShadow={!isUtility} receiveShadow>
        <boxGeometry args={[boxWidth, isUtility ? BOX_HEIGHT * 0.6 : BOX_HEIGHT, ROW_DEPTH - GAP]} />
        <meshStandardMaterial color={isUtility ? UTILITY_COLOR : isSelected ? SELECTED_COLOR : IDLE_COLOR} />
      </mesh>
      <Html position={[0, (isUtility ? BOX_HEIGHT * 0.3 : BOX_HEIGHT / 2) + 0.06, 0]} center distanceFactor={11} style={{ pointerEvents: "none" }}>
        <div
          className={`pointer-events-none flex flex-col items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-center text-[12px] font-[800] ${
            isUtility ? "text-slate-400" : isSelected ? "bg-black/15 text-white" : "text-slate-600"
          }`}
          style={{ maxWidth: `${Math.max(70, boxWidth * 34)}px`, whiteSpace: boxWidth > 1.6 ? "nowrap" : "normal" }}
        >
          {isUtility ? room.roomNumber : formatRoomNumber(room.roomNumber)}
          {!isUtility && (
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isInUse ? (isSelected ? "bg-white" : "bg-[var(--colors-primary)]") : "bg-slate-300"
              }`}
            />
          )}
        </div>
      </Html>
    </group>
  );
}

// 콘텐츠 크기(줄 수 · 최대 폭)와 캔버스 비율에 맞춰 카메라 거리를 매번 다시 계산해서
// 방이 많은 줄도 화면 밖으로 잘리지 않도록 한다.
function FitCamera({ contentWidth, contentDepth }) {
  const { camera, size } = useThree();

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    const distanceForWidth = (contentWidth / 2) / Math.tan(hFov / 2);
    const distanceForDepth = (contentDepth / 1.15) / Math.tan(vFov / 2);
    const distance = Math.max(distanceForWidth, distanceForDepth, 5);

    camera.position.set(0, distance * 0.62, distance * 0.82);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size, contentWidth, contentDepth]);

  return null;
}

export function D4RoomGridScene({ rooms, roomUsageById, selectedRoomId, onSelectRoom }) {
  const rowCount = useMemo(() => Math.max(1, ...rooms.map((r) => r.row + 1)), [rooms]);
  const rowTotalWidth = useMemo(() => {
    const totals = {};
    rooms.forEach((room) => {
      totals[room.row] = Math.max(totals[room.row] ?? 0, room.colOffset + room.colWidth);
    });
    return totals;
  }, [rooms]);
  const maxRowWidth = Math.max(1, ...Object.values(rowTotalWidth));
  const contentWidth = maxRowWidth * UNIT + 1.2;
  const contentDepth = rowCount * ROW_DEPTH + 1.6;

  return (
    <Canvas camera={{ fov: 26 }} shadows>
      <FitCamera contentWidth={contentWidth} contentDepth={contentDepth} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 8, 6]} intensity={1.3} castShadow />
      <group position={[0, -1, -((rowCount - 1) * ROW_DEPTH) / 2]}>
        {rooms.map((room) => {
          const rowWidth = rowTotalWidth[room.row] ?? maxRowWidth;
          const rowStartX = -(rowWidth * UNIT) / 2 + ((maxRowWidth - rowWidth) * UNIT) / 2;
          const x = rowStartX + (room.colOffset + room.colWidth / 2) * UNIT;
          const z = room.row * ROW_DEPTH;
          return (
            <RoomBox
              key={room.id}
              room={room}
              x={x}
              z={z}
              width={room.colWidth}
              isSelected={room.id === selectedRoomId}
              isInUse={roomUsageById?.get(room.id) ?? false}
              onSelect={onSelectRoom}
            />
          );
        })}
      </group>
    </Canvas>
  );
}
