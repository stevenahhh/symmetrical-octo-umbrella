import { ChevronLeft } from "lucide-react";
import { D4WingFloorScene } from "./D4WingFloorScene";

export function D4WingFloorSelect({ building, activeWingId, onSelectWing, onSelectFloor, onBack }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-4">
      <div className="flex w-full max-w-[800px] items-center justify-between">
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

      <div className="h-[64vh] w-full min-w-[560px] max-w-[1000px]">
        <D4WingFloorScene building={building} activeWingId={activeWingId} onSelectFloor={onSelectFloor} />
      </div>

      <div className="text-center text-[12px] font-[600] text-[var(--colors-ink-subtle)]">
        층을 클릭하면 해당 층의 강의실 목록으로 이동합니다.
      </div>
    </div>
  );
}
