import { ChevronLeft } from "lucide-react";
import { D4WingFloorScene } from "./D4WingFloorScene";
import { formatRoomNumber, getWingById } from "../utils/d4BuildingData.mjs";

function InUseRoomList({ rooms, onSelectRoom }) {
  return (
    <div className="flex h-[64vh] w-[340px] shrink-0 flex-col rounded-[16px] border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-[900] text-[var(--colors-ink)]">사용 중인 강의실</div>
        <span className="rounded-full bg-[var(--colors-primary)] px-2 py-0.5 text-[11px] font-[800] text-white">{rooms.length}</span>
      </div>
      <div className="mt-3 flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <div className="rounded-lg bg-[var(--colors-surface-2)] p-3 text-[12px] font-[700] text-[var(--colors-ink-subtle)]">
            현재 사용 중인 강의실이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => onSelectRoom(room)}
                className="flex w-full min-w-0 flex-col items-start gap-1 rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-3 py-2.5 text-left transition hover:bg-[var(--colors-surface-3)]"
              >
                <div className="flex items-center gap-1.5 text-[13px] font-[900] text-[var(--colors-ink)]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--colors-primary)]" />
                  D4 {formatRoomNumber(room.roomNumber)}
                </div>
                <div className="w-full truncate text-[11px] font-[700] text-[var(--colors-ink-subtle)]">{room.specialLabel}</div>
                <div className="text-[11px] font-[800] text-[var(--colors-ink-muted)]">
                  {getWingById(room.wing).label} {room.floor === 0 ? "B1" : `${room.floor}층`}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function D4WingFloorSelect({ building, activeWingId, onSelectWing, onSelectFloor, onBack, inUseRooms = [], onSelectInUseRoom }) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-6 overflow-x-auto px-4">
      <div className="w-[340px] shrink-0" aria-hidden="true" />

      <div className="flex shrink-0 flex-col items-center justify-center gap-6">
        <div className="flex w-full max-w-[560px] items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-md border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] px-3 py-2 text-[13px] font-[700] text-[var(--colors-ink-muted)] transition hover:text-[var(--colors-ink)] hover:bg-[var(--colors-surface-2)]"
          >
            <ChevronLeft size={16} />
            캠퍼스 전체 보기
          </button>
          <div className="text-lg font-[900] text-[var(--colors-ink)]">{building.displayName}</div>
          <div className="w-[132px]" />
        </div>

        <div className="flex rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] p-1">
          {building.wings.map((wing) => (
            <button
              key={wing.id}
              type="button"
              onClick={() => onSelectWing(wing.id)}
              className={`rounded-md px-5 py-2 text-[13px] font-[800] transition-colors ${
                activeWingId === wing.id
                  ? "bg-[var(--colors-primary)] text-white shadow-sm"
                  : "text-[var(--colors-ink-subtle)] hover:text-[var(--colors-ink)]"
              }`}
            >
              {wing.label}
            </button>
          ))}
        </div>

        <div className="h-[64vh] w-[560px]">
          <D4WingFloorScene building={building} activeWingId={activeWingId} onSelectFloor={onSelectFloor} />
        </div>

        <div className="text-center text-[12px] font-[600] text-[var(--colors-ink-subtle)]">
          층을 클릭하면 해당 층의 강의실 목록으로 이동합니다.
        </div>
      </div>

      <InUseRoomList rooms={inUseRooms} onSelectRoom={onSelectInUseRoom} />
    </div>
  );
}
