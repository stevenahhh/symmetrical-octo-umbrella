import { ArrowLeft, Building2, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { D4RoomGridSelect } from "../components/D4RoomGridSelect";
import { D4WingFloorSelect } from "../components/D4WingFloorSelect";
import { RoofEditor } from "../features/energy/editor/RoofEditor";
import { InstallationPlanManager } from "../features/energy/installations/InstallationPlanManager";
import { D4_BUILDING_DATA, D4_ROOMS, getWingById } from "../utils/d4BuildingData.mjs";
import { getCurrentRoomStatus, isRoomInUse } from "../utils/d4RoomStatus.mjs";

const DEFAULT_WING_ID = D4_BUILDING_DATA.wings[0].id;

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
  const [experienceMode, setExperienceMode] = useState(startInstallation ? "installation" : "rooms");
  const [isPlanEditorOpen, setIsPlanEditorOpen] = useState(Boolean(scenarioId || installationPlanId));
  const [activeInstallationPlanId, setActiveInstallationPlanId] = useState(installationPlanId ?? null);
  const [localPlanRevision, setLocalPlanRevision] = useState(0);
  const [d4View, setD4View] = useState("wings");
  const [d4ActiveWingId, setD4ActiveWingId] = useState(DEFAULT_WING_ID);
  const [d4SelectedFloor, setD4SelectedFloor] = useState(1);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [currentTime] = useState(() => new Date());
  const activeWing = getWingById(d4ActiveWingId);
  const floorRooms = useMemo(
    () => D4_ROOMS.filter((room) => room.wing === d4ActiveWingId && room.floor === d4SelectedFloor),
    [d4ActiveWingId, d4SelectedFloor],
  );
  const selectedRoom = useMemo(
    () => floorRooms.find((room) => room.id === selectedRoomId) ?? null,
    [floorRooms, selectedRoomId],
  );
  const roomUsageById = useMemo(
    () => new Map(D4_ROOMS.map((room) => [room.id, isRoomInUse(room, currentTime)])),
    [currentTime],
  );
  const selectedRoomStatus = selectedRoom ? getCurrentRoomStatus(selectedRoom, currentTime) : null;
  const inUseRooms = useMemo(
    () => D4_ROOMS.filter((room) => room.isSelectable && roomUsageById.get(room.id)),
    [roomUsageById],
  );

  useEffect(() => {
    if (!scenarioId && !installationPlanId) return;
    setExperienceMode("installation");
    setActiveInstallationPlanId(installationPlanId ?? null);
    setIsPlanEditorOpen(true);
  }, [installationPlanId, scenarioId]);

  const selectFloorFromWings = (wingId, floor) => {
    setD4ActiveWingId(wingId);
    setD4SelectedFloor(floor);
    setSelectedRoomId(null);
    setD4View("grid");
  };

  const changeWing = (wingId) => {
    const wing = getWingById(wingId);
    const minFloor = wing.hasBasement ? 0 : 1;
    setD4ActiveWingId(wingId);
    setD4SelectedFloor((previous) => Math.min(Math.max(previous, minFloor), wing.floors));
    setSelectedRoomId(null);
  };

  const changeFloor = (floor) => {
    setD4SelectedFloor(floor);
    setSelectedRoomId(null);
  };

  const jumpToInUseRoom = (room) => {
    setD4ActiveWingId(room.wing);
    setD4SelectedFloor(room.floor);
    setSelectedRoomId(room.id);
    setD4View("grid");
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] min-h-0 overflow-hidden bg-[#09111d]" aria-label="D4 공과대학 3호관 상세 경험">
      {experienceMode === "rooms" ? (
        <div className="absolute inset-0 bg-[var(--colors-canvas)] pt-16">
          {d4View === "wings" ? (
            <D4WingFloorSelect
              building={D4_BUILDING_DATA}
              activeWingId={d4ActiveWingId}
              onSelectWing={changeWing}
              onSelectFloor={selectFloorFromWings}
              onBack={onClose}
              inUseRooms={inUseRooms}
              onSelectInUseRoom={jumpToInUseRoom}
            />
          ) : (
            <D4RoomGridSelect
              building={D4_BUILDING_DATA}
              wing={activeWing}
              floor={d4SelectedFloor}
              rooms={floorRooms}
              roomUsageById={roomUsageById}
              selectedRoom={selectedRoom}
              selectedRoomStatus={selectedRoomStatus}
              onSelectRoom={setSelectedRoomId}
              onChangeWing={changeWing}
              onChangeFloor={changeFloor}
              onBack={() => setD4View("wings")}
            />
          )}
        </div>
  ) : isPlanEditorOpen ? (
      <RoofEditor
        key={activeInstallationPlanId ?? scenarioId ?? "default-scenario"}
        buildingId={buildingId}
        scenarioId={activeInstallationPlanId ? undefined : scenarioId}
        installationPlanId={activeInstallationPlanId}
        onPlanSaved={(plan) => {
          setLocalPlanRevision((value) => value + 1);
          onPlanSaved?.(plan);
        }}
        onBackToPlans={() => setIsPlanEditorOpen(false)}
      />
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
        <button type="button" onClick={onClose} className="flex h-11 items-center gap-2 px-3 text-[12px] font-[800] text-[var(--colors-ink-muted)] transition-colors hover:bg-[var(--colors-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]" aria-label="캠퍼스 지도로 돌아가기" title="캠퍼스 지도로 돌아가기">
          <ArrowLeft size={16} /> 지도
        </button>
      </div>
    </div>,
    document.body,
  );
}
