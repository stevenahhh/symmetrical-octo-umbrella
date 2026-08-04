import { getWingFloorLabel } from "../utils/d4BuildingData.mjs";

function EnergySparkline({ hour }) {
  const bars = Array.from({ length: 24 }, (_, h) => {
    const base = Math.max(0, Math.sin(((h - 7) / 24) * Math.PI * 1.55)) * 0.8 + 0.15;
    const isPast = h <= hour;
    return { h, value: base, isPast };
  });

  return (
    <div>
      <div className="flex h-[42px] items-end gap-[2px]">
        {bars.map(({ h, value, isPast }) => (
          <div
            key={h}
            className={`flex-1 rounded-t-[2px] ${isPast ? "bg-[var(--colors-primary)]" : "bg-[var(--colors-surface-3)]"}`}
            style={{ height: `${Math.max(6, value * 42)}px` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-[600] text-[var(--colors-ink-subtle)]">
        <span>00시</span>
        <span>12시</span>
        <span>24시</span>
      </div>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--colors-hairline)] py-2.5 text-[13px]">
      <span className="font-[600] text-[var(--colors-ink-subtle)]">{label}</span>
      <span className="font-[800] text-[var(--colors-ink)]">{children}</span>
    </div>
  );
}

export function D4WingDetailCard({ building, wing, activeWingId, onSelectWing, usagePercent, todayEnergyKwh, currentHour }) {
  return (
    <div className="w-[19vw] min-w-[300px] max-w-[400px] rounded-[16px] border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] p-5 shadow-lg">
      <div className="text-[12px] font-[900] uppercase tracking-[0.08em] text-[var(--colors-primary)]">
        BUILDING DETAIL
      </div>
      <div className="mt-1 text-xl font-[900] text-[var(--colors-ink)]">{building.displayName}</div>

      <div className="mt-3 flex rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-1">
        {building.wings.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onSelectWing(w.id)}
            className={`flex-1 rounded-md py-1.5 text-[13px] font-[800] transition-colors ${
              activeWingId === w.id
                ? "bg-[var(--colors-primary)] text-white shadow-sm"
                : "text-[var(--colors-ink-subtle)] hover:text-[var(--colors-ink)]"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <DetailRow label="층 층수">{getWingFloorLabel(wing)}</DetailRow>
        <DetailRow label="연면적">{wing.totalFloorAreaSqm.toLocaleString()} ㎡</DetailRow>
        <DetailRow label="현재 상태">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--colors-semantic-success)]" />
            정상 운영 중
          </span>
        </DetailRow>
        <DetailRow label="사용 현황">{usagePercent}%</DetailRow>
      </div>

      <div className="mt-3 rounded-lg bg-[var(--colors-surface-2)] p-3">
        <div className="mb-2 flex items-center justify-between text-[12px] font-[700] text-[var(--colors-ink-subtle)]">
          <span>건물 에너지</span>
          <span className="text-[13px] font-[900] text-[var(--colors-ink)]">오늘 {todayEnergyKwh} kWh</span>
        </div>
        <EnergySparkline hour={currentHour} />
      </div>
    </div>
  );
}
