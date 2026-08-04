import { ArrowLeft, X } from "lucide-react";

function ScheduleList({ timetable }) {
  if (timetable.length === 0) {
    return (
      <div className="rounded-lg bg-[var(--colors-surface-2)] p-4 text-sm font-[700] text-[var(--colors-ink-muted)]">
        등록된 강의 시간이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {timetable.map((item) => (
        <div
          key={`${item.day}-${item.startHour}-${item.subject}`}
          className="rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-3"
        >
          <div className="text-[13px] font-[900] text-[var(--colors-ink)]">{item.subject}</div>
          <div className="mt-1 text-[12px] font-[700] text-[var(--colors-ink-muted)]">
            {item.day}요일 {item.startHour}:00-{item.startHour + item.durationHours}:00 ·{" "}
            {item.professorId}
          </div>
        </div>
      ))}
    </div>
  );
}

export function D4RoomPopup({ room, status, view, onChangeView, onClose }) {
  return (
    <section
      aria-labelledby="d4-room-popup-title"
      className="pointer-events-auto absolute left-4 top-4 z-40 max-h-[calc(100dvh-2rem)] w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] p-5 text-[var(--colors-ink)] shadow-2xl sm:left-6 sm:top-6"
      role="dialog"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-[900] uppercase tracking-[0.08em] text-[var(--colors-primary)]">
            {view === "schedule" ? "Room Schedule" : "Room Detail"}
          </div>
          <h2 id="d4-room-popup-title" className="mt-1 text-xl font-[900]">
            D4 {room.roomNumber}
          </h2>
          <div className="mt-1 text-[12px] font-[700] text-[var(--colors-ink-muted)]">
            {room.floor}층 {room.roomNumber}호 · {room.wing === "left" ? "왼쪽 동" : "오른쪽 동"}
          </div>
        </div>
        <button
          type="button"
          onClick={view === "schedule" ? () => onChangeView("detail") : onClose}
          className="rounded-md border border-[var(--colors-hairline)] p-2 text-[var(--colors-ink-muted)] transition-colors hover:bg-[var(--colors-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]"
          aria-label={view === "schedule" ? "상세로 돌아가기" : "강의실 팝업 닫기"}
        >
          {view === "schedule" ? <ArrowLeft size={16} /> : <X size={16} />}
        </button>
      </div>

      {view === "schedule" ? (
        <ScheduleList timetable={room.timetable} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <InfoCell label="현재 상태" value={status.statusText} />
            <InfoCell label="냉난방 상태" value={status.hvacText} />
          </div>
          <InfoCell
            label="현재 수업/다음 일정"
            value={`${status.currentClass?.subject ?? status.nextClass?.subject ?? "오늘 예정 없음"}${status.nextClass ? ` · ${status.nextClass.startHour}:00 예정` : ""}`}
          />
          <div className="grid grid-cols-2 gap-2">
            <InfoCell label="공간 유형" value={room.specialLabel} />
            <InfoCell label="규모" value={room.sizeLabel} />
            <InfoCell label="냉난방기" value={`${room.hvacUnits}대`} />
            <InfoCell
              label="특수 설비"
              value={room.hasLargeScreen ? "대형 스크린" : room.computerCount ? `PC ${room.computerCount}대` : "없음"}
            />
          </div>
          <div className="rounded-lg bg-[var(--colors-surface-2)] p-3">
            <div className="flex items-center justify-between text-[13px] font-[900]">
              <span>주 {room.weeklySavingsKwh.toFixed(1)} kWh 절감 가능</span>
              <span className="text-[var(--colors-primary)]">{room.savingRate.toFixed(1)}%</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChangeView("schedule")}
            className="w-full rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-4 py-3 text-sm font-[900] transition-colors hover:border-[var(--colors-hairline-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]"
          >
            강의실 시간표 보기
          </button>
        </div>
      )}
    </section>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg bg-[var(--colors-surface-2)] p-3">
      <div className="text-[12px] font-[700] text-[var(--colors-ink-muted)]">{label}</div>
      <div className="mt-1 [overflow-wrap:anywhere] text-[13px] font-[900]">{value}</div>
    </div>
  );
}
