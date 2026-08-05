import { AlertTriangle, ArrowUpRight, Building2, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseCampusComparison, parseRecommendationResponse } from "./campusComparison.mjs";

async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.detail?.message_ko ?? `에너지 API 요청 실패 (HTTP ${response.status})`);
  return body;
}

export function createCampusComparisonClient(apiBase = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000", fetchImpl = fetch) {
  return {
    async load({ date, weatherPreset, signal }) {
      const response = await fetchImpl(`${apiBase}/energy/rankings?date=${encodeURIComponent(date)}&weather_preset=${encodeURIComponent(weatherPreset)}&representative_only=true`, { signal, headers: { Accept: "application/json" } });
      return parseCampusComparison(await json(response), { date, weatherPreset });
    },
    async recommend({ sourceScenarioId, date }) {
      const response = await fetchImpl(`${apiBase}/energy/scenarios/${encodeURIComponent(sourceScenarioId)}/recommend`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ date }) });
      return parseRecommendationResponse(await json(response), { sourceScenarioId });
    },
  };
}

const STATUS_LABELS = { simulated: "시뮬레이션 완료", incomplete: "정보 불완전", no_scenario: "시나리오 없음" };
const COMPONENTS = [
  ["annualizedYield", "연환산 발전량"], ["roofUtilization", "옥상 활용"],
  ["selfSufficiency", "자급률"], ["gridReduction", "계통전력 절감"], ["constraints", "제약 위반"],
];
const percent = (value) => `${(value * 100).toFixed(1)}%`;

export function CampusComparison({ client, initialDate = "2026-05-18", onOpenRecommendation = () => {} }) {
  const api = useMemo(() => client ?? createCampusComparisonClient(), [client]);
  const [date, setDate] = useState(initialDate);
  const [weatherPreset, setWeatherPreset] = useState("clear");
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [opening, setOpening] = useState(false);
  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null, error: "" });
    api.load({ date, weatherPreset, signal: controller.signal }).then((data) => setState({ status: "success", data, error: "" })).catch((error) => {
      if (error?.name !== "AbortError") setState({ status: "error", data: null, error: error.message });
    });
    return () => controller.abort();
  }, [api, date, weatherPreset]);
  useEffect(load, [load]);
  const top = state.data?.ranked?.[0];
  const openTop = async () => {
    if (!top || opening) return;
    setOpening(true);
    try { const scenario = await api.recommend({ sourceScenarioId: top.scenarioId, date }); onOpenRecommendation({ scenarioId: scenario.id, buildingId: scenario.buildingId }); }
    catch (error) { setState((current) => ({ ...current, status: "error", error: error.message })); }
    finally { setOpening(false); }
  };
  return <section data-qa="campus-comparison" className="space-y-3 rounded-xl border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-3" aria-labelledby="campus-comparison-title">
    <header className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.08em] text-[var(--colors-primary)]"><Building2 size={14} />Campus comparison</div><h2 id="campus-comparison-title" className="mt-1 break-keep text-base font-bold">건물별 태양광 추천</h2></div><Sparkles className="shrink-0 text-[var(--colors-primary)]" size={18} /></header>
    <div className="grid grid-cols-2 gap-2"><label className="text-[11px] font-bold text-[var(--colors-ink-subtle)]">비교 날짜<input aria-label="캠퍼스 비교 날짜" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] px-2 text-xs text-[var(--colors-ink)]" /></label><label className="text-[11px] font-bold text-[var(--colors-ink-subtle)]">기상 프리셋<select aria-label="캠퍼스 비교 기상 프리셋" value={weatherPreset} onChange={(event) => setWeatherPreset(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] px-2 text-xs text-[var(--colors-ink)]"><option value="clear">맑음</option><option value="partly_cloudy">부분 흐림</option><option value="overcast">흐림</option></select></label></div>
    {state.status === "loading" && <div role="status" className="flex min-h-24 items-center justify-center gap-2 text-xs text-[var(--colors-ink-muted)]"><RefreshCw className="animate-spin" size={15} />동일 조건 비교 중</div>}
    {state.status === "error" && <div role="alert" data-qa="campus-comparison-error" className="rounded-lg border border-[#d45555]/40 bg-[#d45555]/10 p-3 text-xs"><span className="flex items-center gap-2 font-bold"><AlertTriangle size={15} />비교 API를 불러오지 못했습니다.</span><span className="mt-1 block break-words text-[var(--colors-ink-muted)]">{state.error}</span><button type="button" onClick={load} className="mt-2 h-9 rounded-md border border-[var(--colors-hairline-strong)] px-3 font-bold">다시 시도</button></div>}
    {state.status === "success" && <>
      <p className="text-[11px] leading-4 text-[var(--colors-ink-subtle)]">같은 날짜·기상 프리셋만 비교 · 수요 가상 예측 · 일사량 시나리오/추정 · 365일 연환산</p>
      <div className="space-y-2">{state.data.ranked.map((item) => <article key={item.scenarioId} data-status="simulated" className="rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] p-3"><div className="flex items-center justify-between gap-2"><div><span className="text-[10px] font-extrabold text-[var(--colors-primary)]">#{item.rank} · {STATUS_LABELS[item.buildingStatus]}</span><h3 className="break-keep text-sm font-bold">{item.buildingName}</h3></div><strong className="text-lg tabular-nums">{percent(item.score)}</strong></div><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">{COMPONENTS.map(([key, label]) => <div key={key} className="flex justify-between gap-2"><dt className="text-[var(--colors-ink-subtle)]">{label}</dt><dd>{percent(item.components[key])}</dd></div>)}</dl><div className="mt-2 flex items-center justify-between gap-2"><p className="text-[10px] text-[var(--colors-ink-subtle)]">{item.metrics.annualizedKwhPerKwp.toFixed(0)} kWh/kWp/년 · 옥상 {percent(item.metrics.roofUtilizationRatio)} · 위반 {item.metrics.constraintViolationCount}건</p><button type="button" aria-label={`${item.buildingName} 배치 편집`} onClick={() => onOpenRecommendation({ scenarioId: item.scenarioId, buildingId: item.buildingId })} className="min-h-10 shrink-0 rounded-md border border-[var(--colors-hairline-strong)] px-3 text-[11px] font-extrabold text-[var(--colors-ink-muted)] hover:bg-[var(--colors-surface-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]">배치 편집</button></div></article>)}</div>
      {top && <button type="button" aria-label="1위 추천을 새 편집 시나리오로 열기" onClick={openTop} disabled={opening} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--colors-primary)] px-3 text-xs font-extrabold text-white disabled:opacity-60">{opening ? "새 시나리오 생성 중" : "1위 추천을 새 시나리오로 열기"}<ArrowUpRight size={15} /></button>}
      <div className="space-y-1" aria-label="비교 제외 건물">{state.data.excluded.map((item) => <div key={`${item.buildingId}-${item.scenarioId ?? "none"}`} data-status={item.buildingStatus} className="rounded-lg border border-dashed border-[var(--colors-hairline-strong)] px-3 py-2 text-[11px]"><div className="flex items-center justify-between gap-2"><strong className="break-keep">{item.buildingName}</strong><span className="shrink-0 text-[var(--colors-ink-subtle)]">{STATUS_LABELS[item.buildingStatus]}</span></div><p className="mt-1 break-keep text-[var(--colors-ink-subtle)]">{item.reasonLabel}</p></div>)}</div>
    </>}
  </section>;
}
