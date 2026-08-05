import { AlertTriangle, CalendarDays, RefreshCw, SunMedium } from "lucide-react";
import { useMemo, useState } from "react";
import { createEnergyDashboardClient } from "./energyDashboardApi.mjs";
import { EnergyChart, KpiGrid, LossBreakdown, ProvenancePanel, RoomBreakdown } from "./EnergyDashboardPanels.jsx";
import { useEnergyDashboard } from "./useEnergyDashboard.js";

const DEFAULT_SCENARIO = "D4-scenario-south-2x8";
function localDate() {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function EnergyDashboard({ buildingId = "D4", initialDate = localDate(), scenarios, client }) {
  const apiClient = useMemo(() => client ?? createEnergyDashboardClient(), [client]);
  const [date, setDate] = useState(initialDate);
  const [scenarioId, setScenarioId] = useState(scenarios?.[0]?.id ?? DEFAULT_SCENARIO);
  const state = useEnergyDashboard({ buildingId, date, scenarioId, client: apiClient });
  const options = scenarios ?? state.data?.scenarios ?? [{ id: scenarioId, label: "D4 기본 2×8" }];

  return <div data-qa="energy-dashboard" className="space-y-4 pb-4">
    <header className="border-b border-[var(--colors-hairline)] pb-4">
      <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--colors-primary)]"><SunMedium size={15} />Building energy</div>
      {state.status === "success" ? <><h2 className="mt-2 break-keep text-xl font-bold leading-7">{state.data.building.displayName}</h2><p className="mt-1 text-xs text-[var(--colors-ink-subtle)]">{state.data.scenario.name} · 배열 {state.data.scenario.arrayCount}개 · {state.data.scenario.weatherPreset}</p></> : <h2 className="mt-2 text-xl font-bold">건물 에너지 시뮬레이션</h2>}
    </header>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[11px] font-bold text-[var(--colors-ink-subtle)]"><span className="mb-1.5 flex items-center gap-1"><CalendarDays size={12} />날짜</span><input data-qa="energy-date" aria-label="시뮬레이션 날짜" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 w-full rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-2 text-xs text-[var(--colors-ink)]" /></label>
      <label className="text-[11px] font-bold text-[var(--colors-ink-subtle)]"><span className="mb-1.5 block">시나리오</span><select data-qa="energy-scenario" aria-label="설치 시나리오" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} className="h-10 w-full rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-2 text-xs text-[var(--colors-ink)]">{options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
    {state.status === "loading" && <div data-qa="energy-loading" role="status" className="grid min-h-48 place-items-center rounded-xl border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-6 text-center text-sm text-[var(--colors-ink-muted)]"><span><RefreshCw className="mx-auto mb-3 animate-spin text-[var(--colors-primary)]" size={22} />에너지 시뮬레이션을 불러오는 중입니다.</span></div>}
    {state.status === "error" && <div data-qa="energy-error" role="alert" className="rounded-xl border border-[#d45555]/40 bg-[#d45555]/10 p-4"><div className="flex gap-2 text-sm font-bold"><AlertTriangle size={17} />에너지 API에 연결할 수 없습니다.</div><p className="mt-2 break-words text-xs text-[var(--colors-ink-muted)]">{state.error}</p><p className="mt-2 text-[11px] text-[var(--colors-ink-subtle)]">편집 중인 옥상 배치는 유지됩니다. 연결 복구 후 다시 시도하세요.</p><button data-qa="energy-retry" type="button" aria-label="에너지 데이터 다시 시도" onClick={state.retry} className="mt-3 h-10 rounded-lg border border-[var(--colors-hairline-strong)] bg-[var(--colors-surface-2)] px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]">다시 시도</button></div>}
    {state.status === "empty" && <div data-qa="energy-empty" className="rounded-xl border border-dashed border-[var(--colors-hairline-strong)] p-8 text-center text-sm text-[var(--colors-ink-muted)]">표시할 에너지 시나리오가 없습니다.<p className="mt-2 text-xs text-[var(--colors-ink-subtle)]">태양광 설치 모드에서 배열을 저장하면 여기에 표시됩니다.</p></div>}
    {state.status === "success" && <><ProvenancePanel data={state.data} /><KpiGrid data={state.data} /><EnergyChart data={state.data} /><LossBreakdown data={state.data} /><RoomBreakdown data={state.data} /></>}
  </div>;
}
