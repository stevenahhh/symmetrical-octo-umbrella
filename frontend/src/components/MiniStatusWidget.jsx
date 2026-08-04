import { CalendarDays, Sun, Moon } from "lucide-react";

export function MiniStatusWidget({ formattedTime, formattedDate, isDaytime, systemStatusLabel, activeWeather, airQualityStatus }) {
  return (
    <div className="w-[17vw] min-w-[260px] max-w-[360px] rounded-[16px] border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] p-5 shadow-lg">
      <div className="text-[12px] font-[900] uppercase tracking-[0.08em] text-[var(--colors-ink-subtle)]">
        SMART CITY DASHBOARD
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[22px] font-[800] tracking-[-0.5px] text-[var(--colors-ink)]">{formattedTime}</div>
        {isDaytime ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-[var(--colors-ink-subtle)]" />}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[12px] font-[600] text-[var(--colors-ink-muted)]">
        <CalendarDays size={12} />
        {formattedDate}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-3 py-2">
        <span className="text-[12px] font-[700] text-[var(--colors-ink-subtle)]">시스템 상태</span>
        <span className="flex items-center gap-1.5 text-[13px] font-[800] text-[var(--colors-ink)]">
          <span className="h-2 w-2 rounded-full bg-[var(--colors-semantic-success)] shadow-[0_0_6px_var(--colors-semantic-success)]" />
          {systemStatusLabel}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between px-1 text-[12px] font-[700] text-[var(--colors-ink-subtle)]">
        <span>날씨</span>
        <span className="text-[var(--colors-ink)]">
          {activeWeather?.sky ?? "맑음"} {activeWeather?.temperature ?? "-"}°C
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between px-1 text-[12px] font-[700] text-[var(--colors-ink-subtle)]">
        <span>대기질</span>
        <span className="flex items-center gap-1.5 text-[var(--colors-ink)]">
          {airQualityStatus ?? "보통"}
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--colors-semantic-success)]" />
        </span>
      </div>
    </div>
  );
}
