import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { ArrowLeft, Building2, List, Sun, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BuildingSectionView } from "../components/BuildingSectionView";
import { D4RoomPopup } from "../components/D4RoomPopup";
import { RoofEditor } from "../features/energy/editor/RoofEditor";
import { InstallationPlanManager } from "../features/energy/installations/InstallationPlanManager";
import { D4_BUILDING_DATA, D4_ROOMS } from "../utils/d4BuildingData.mjs";
import { getCurrentRoomStatus, isRoomInUse } from "../utils/d4RoomStatus.mjs";

export function D4SectionExperience({
  onClose,
  buildingId = "D4",
  scenarioId,
  installationPlanId,
  onPlanSaved,
  createInstallationPlanDraft,
  onPlansChange,
  onRepresentativeChange,
  planRefreshKey,
  startInstallation = false,
}) {
  const controlsRef = useRef(null);
  const [experienceMode, setExperienceMode] = useState(startInstallation ? "installation" : "rooms");
  const [isPlanEditorOpen, setIsPlanEditorOpen] = useState(Boolean(scenarioId || installationPlanId));
  const [activeInstallationPlanId, setActiveInstallationPlanId] = useState(installationPlanId ?? null);
  const [localPlanRevision, setLocalPlanRevision] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState(D4_ROOMS[0].id);
  const [isPopupOpen, setIsPopupOpen] = useState(true);
  const [popupView, setPopupView] = useState("detail");
  const [currentTime] = useState(() => new Date());
  const selectedRoom = useMemo(
    () => D4_ROOMS.find((room) => room.id === selectedRoomId) ?? D4_ROOMS[0],
    [selectedRoomId],
  );
  const roomUsageById = useMemo(
    () => new Map(D4_ROOMS.map((room) => [room.id, isRoomInUse(room, currentTime)])),
    [currentTime],
  );
  const selectedRoomStatus = getCurrentRoomStatus(selectedRoom, currentTime);

  useEffect(() => {
    if (!scenarioId && !installationPlanId) return;
    setExperienceMode("installation");
    setActiveInstallationPlanId(installationPlanId ?? null);
    setIsPlanEditorOpen(true);
  }, [installationPlanId, scenarioId]);

  const selectRoom = (roomId) => {
    setSelectedRoomId(roomId);
    setPopupView("detail");
    setIsPopupOpen(true);
  };

  const zoom = (scale) => {
    const controls = controlsRef.current;
    const camera = controls?.object;
    const target = controls?.target;
    if (!camera || !target) return;

    const offset = camera.position.clone().sub(target);
    offset.setLength(Math.min(42, Math.max(4, offset.length() * scale)));
    camera.position.copy(target).add(offset);
    controls.update();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] min-h-0 overflow-hidden bg-[#09111d]" aria-label="D4 공과대학 3호관 상세 경험">
      {experienceMode === "rooms" ? (
        <Canvas camera={{ position: [8.4, 7.4, 8.8], fov: 48 }} shadows>
          <color attach="background" args={["#09111d"]} />
          <ambientLight intensity={1.1} />
          <directionalLight castShadow intensity={2.1} position={[12, 18, 9]} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
          <BuildingSectionView
            building={D4_BUILDING_DATA}
            rooms={D4_ROOMS}
            roomUsageById={roomUsageById}
            selectedRoomId={selectedRoom.id}
            onSelectRoom={selectRoom}
          />
          <OrbitControls ref={controlsRef} enableDamping minDistance={4} maxDistance={42} />
        </Canvas>
  ) : isPlanEditorOpen ? (
    <>
      <RoofEditor
        key={activeInstallationPlanId ?? scenarioId ?? "default-scenario"}
        buildingId={buildingId}
        scenarioId={activeInstallationPlanId ? undefined : scenarioId}
        installationPlanId={activeInstallationPlanId}
        onPlanSaved={(plan) => {
          setLocalPlanRevision((value) => value + 1);
          onPlanSaved?.(plan);
        }}
      />
      <button type="button" onClick={() => setIsPlanEditorOpen(false)} className="dashboard-ghost-button pointer-events-auto absolute right-4 top-4 z-50 flex min-h-11 items-center gap-2 px-3 text-xs font-extrabold" aria-label="설치 계획 목록으로 돌아가기"><List size={16} /> 계획 목록</button>
    </>
  ) : (
    <div className="absolute inset-0 overflow-y-auto bg-[#07101b] px-4 pb-8 pt-20 sm:px-6">
      <InstallationPlanManager
        buildingId={buildingId}
        refreshKey={`${planRefreshKey ?? ""}:${localPlanRevision}`}
        createPlanDraft={createInstallationPlanDraft ?? (({ plans }) => ({ name: `${buildingId} 새 설치안 ${plans.length + 1}`, arrays: [] }))}
        onEditPlan={(plan) => {
          setActiveInstallationPlanId(plan.id);
          setIsPlanEditorOpen(true);
        }}
        onPlansChange={onPlansChange}
        onRepresentativeChange={onRepresentativeChange}
        className="mx-auto max-w-5xl"
      />
    </div>
  )}

      <div className="pointer-events-auto absolute left-1/2 top-4 z-50 flex -translate-x-1/2 overflow-hidden rounded-lg border border-[var(--colors-hairline-strong)] bg-[var(--colors-surface-1)] p-1 shadow-lg" role="tablist" aria-label={`${buildingId} 상세 모드`}>
        {buildingId === "D4" && <button type="button" role="tab" aria-selected={experienceMode === "rooms"} onClick={() => setExperienceMode("rooms")} className={`flex h-10 items-center gap-2 rounded-md px-3 text-xs font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)] ${experienceMode === "rooms" ? "bg-[var(--colors-surface-3)] text-[var(--colors-ink)]" : "text-[var(--colors-ink-subtle)]"}`}><Building2 size={16} /> 공간 탐색</button>}
        <button type="button" role="tab" aria-selected={experienceMode === "installation"} onClick={() => { setExperienceMode("installation"); setIsPlanEditorOpen(false); }} className={`flex h-10 items-center gap-2 rounded-md px-3 text-xs font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)] ${experienceMode === "installation" ? "bg-[var(--colors-primary)] text-white" : "text-[var(--colors-ink-subtle)]"}`}><Sun size={16} /> 태양광 설치</button>
      </div>

      <div className={`pointer-events-auto absolute left-4 z-50 flex overflow-hidden rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] shadow-lg sm:left-6 ${experienceMode === "installation" ? "top-4" : "bottom-4 sm:bottom-6"}`}>
        <button type="button" onClick={onClose} className="flex h-11 items-center gap-2 border-r border-[var(--colors-hairline)] px-3 text-[12px] font-[800] text-[var(--colors-ink-muted)] transition-colors hover:bg-[var(--colors-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]" aria-label="캠퍼스 지도로 돌아가기" title="캠퍼스 지도로 돌아가기">
          <ArrowLeft size={16} /> 지도
        </button>
        {experienceMode === "rooms" && <>
          <button type="button" onClick={() => zoom(0.78)} className="grid h-11 w-11 place-items-center border-r border-[var(--colors-hairline)] text-[var(--colors-ink-muted)] transition-colors hover:bg-[var(--colors-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]" aria-label="D4 단면 확대" title="D4 단면 확대">
            <ZoomIn size={18} />
          </button>
          <button type="button" onClick={() => zoom(1.28)} className="grid h-11 w-11 place-items-center text-[var(--colors-ink-muted)] transition-colors hover:bg-[var(--colors-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]" aria-label="D4 단면 축소" title="D4 단면 축소">
            <ZoomOut size={18} />
          </button>
        </>}
      </div>

      {buildingId === "D4" && experienceMode === "rooms" && isPopupOpen && (
        <D4RoomPopup
          room={selectedRoom}
          status={selectedRoomStatus}
          view={popupView}
          onChangeView={setPopupView}
          onClose={() => setIsPopupOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}
