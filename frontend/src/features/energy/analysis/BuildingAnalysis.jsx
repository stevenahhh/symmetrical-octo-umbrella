import { AlertTriangle, CalendarDays, Play, RefreshCw, SunMedium } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef } from "react";
import { createBuildingAnalysisClient } from "./analysisApi.mjs";
import { buildAnalysisReport, parseAnalysisRun } from "./analysisContracts.mjs";
import { analysisReducer, createAnalysisState } from "./analysisState.mjs";
import { AnalysisInsights, AnalysisKpis, AnalysisSeriesChart } from "./BuildingAnalysisPanels.jsx";

function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const inputClass = "mt-1 h-10 w-full rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-2 text-xs text-[var(--colors-ink)]";
const labelClass = "text-[11px] font-bold text-[var(--colors-ink-subtle)]";

export function BuildingAnalysis({
  buildingId,
  buildingName = buildingId,
  plans = [],
  representativePlanId,
  initialDate = localDate(),
  client,
  onRun = () => {},
}) {
  const api = useMemo(() => client ?? createBuildingAnalysisClient(), [client]);
  const [state, dispatch] = useReducer(analysisReducer, { buildingId, plans, representativePlanId, date: initialDate }, createAnalysisState);
  const requestId = useRef(0);
  const execution = useRef(null);
  const planKey = plans.map((plan) => plan.id).join("\u0000");
  const normalizeRun = (value) => value?.kpis && value?.series ? value : parseAnalysisRun(value);

  useEffect(() => {
    const id = ++requestId.current;
    execution.current?.abort();
    dispatch({ type: "context", requestId: id, buildingId, plans, representativePlanId });
    return () => {
      requestId.current += 1;
      execution.current?.abort();
    };
  }, [buildingId, planKey, representativePlanId]);

  useEffect(() => {
    const id = requestId.current;
    const controller = new AbortController();
    (async () => {
      const [scenarioResult, runResult] = await Promise.allSettled([
        api.listScenarios(buildingId, controller.signal),
        api.listRuns(buildingId, controller.signal),
      ]);
      if (controller.signal.aborted || id !== requestId.current) return;
      const failures = [scenarioResult, runResult].filter((item) => item.status === "rejected").map((item) => item.reason);
      if (failures.some((error) => error?.name === "AbortError")) return;
      dispatch({
        type: "loaded",
        requestId: id,
        scenarios: scenarioResult.status === "fulfilled" ? scenarioResult.value : [],
        runs: runResult.status === "fulfilled" ? runResult.value.map(normalizeRun) : [],
        error: failures[0]?.message ?? null,
      });
    })();
    return () => controller.abort();
  }, [api, buildingId, planKey, representativePlanId]);

  const change = (field) => (event) => dispatch({ type: "draft", field, value: event.target.value || (field === "alternativePlanId" ? null : "") });
  const condition = (field) => (event) => dispatch({ type: "draft", condition: true, field, value: event.target.value });
  const costConditionsValid = [
    state.draft.conditions.electricityPriceKrwPerKwh,
    state.draft.conditions.carbonIntensityKgCo2ePerKwh,
  ].every((value) => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0);

  const execute = async () => {
    if (!state.draft.representativePlanId || !state.draft.date || !costConditionsValid || state.status === "loading") return;
    const id = ++requestId.current;
    const controller = new AbortController();
    execution.current?.abort();
    execution.current = controller;
    dispatch({ type: "request", requestId: id });
    const definitionInput = {
      buildingId,
      name: `${buildingName} 비교 분석`.slice(0, 120),
      representativePlanId: state.draft.representativePlanId,
      alternativePlanId: state.draft.alternativePlanId,
      weatherPreset: state.draft.conditions.weatherPreset,
      electricityPriceKrwPerKwh: Number(state.draft.conditions.electricityPriceKrwPerKwh),
      carbonIntensityKgCo2ePerKwh: Number(state.draft.conditions.carbonIntensityKgCo2ePerKwh),
    };
    try {
      const definition = state.scenarioId
        ? await api.updateScenario(state.scenarioId, definitionInput, controller.signal)
        : await api.createScenario(definitionInput, controller.signal);
      if (controller.signal.aborted || id !== requestId.current) return;
      const report = normalizeRun(await api.runScenario(definition.id, state.draft.date, controller.signal, {
        demandSource: "predicted",
        weatherPreset: definitionInput.weatherPreset,
        electricityPriceKrwPerKwh: definitionInput.electricityPriceKrwPerKwh,
        carbonIntensityKgCo2ePerKwh: definitionInput.carbonIntensityKgCo2ePerKwh,
      }));
      if (controller.signal.aborted || id !== requestId.current) return;
      dispatch({ type: "report", requestId: id, report: buildAnalysisReport(report), scenarioId: definition.id });
      onRun(report);
    } catch (error) {
      if (error?.name !== "AbortError" && id === requestId.current) dispatch({ type: "failure", requestId: id, error: error?.message || "건물 분석을 실행하지 못했습니다." });
    } finally {
      if (execution.current === controller) execution.current = null;
    }
  };

  const selectRun = (event) => {
    const run = state.runs.find((item) => item.id === event.target.value);
    if (run) dispatch({ type: "report", requestId: state.requestId, report: buildAnalysisReport(run), scenarioId: state.scenarioId });
  };

  return <section data-qa="building-analysis" className="space-y-4 pb-4" aria-labelledby="building-analysis-title">
    <header className="border-b border-[var(--colors-hairline)] pb-4">
      <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.08em] text-[var(--colors-primary)]"><SunMedium size={15}/>Single-building analysis</div>
      <h2 id="building-analysis-title" className="mt-2 break-keep text-xl font-bold">{buildingName} 독립 분석</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--colors-ink-subtle)]">대표 설치 계획을 무태양광 기준선 및 선택 대안과 동일 조건으로 비교합니다.</p>
    </header>

    {plans.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--colors-hairline-strong)] p-6 text-center text-sm text-[var(--colors-ink-muted)]">분석할 설치 계획이 없습니다.</div> : <>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelClass}>분석 날짜<span className="flex items-center gap-1"><CalendarDays size={12}/><input aria-label="분석 날짜" type="date" value={state.draft.date} onChange={change("date")} className={inputClass}/></span></label>
        <label className={labelClass}>기상 프리셋<select aria-label="기상 프리셋" value={state.draft.conditions.weatherPreset} onChange={condition("weatherPreset")} className={inputClass}><option value="clear">맑음</option><option value="partly_cloudy">부분 흐림</option><option value="overcast">흐림</option></select></label>
        <label className={labelClass}>대표 설치 계획<select aria-label="대표 설치 계획" value={state.draft.representativePlanId} onChange={change("representativePlanId")} className={inputClass}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label className={labelClass}>대안 설치 계획<select aria-label="대안 설치 계획" value={state.draft.alternativePlanId ?? ""} onChange={change("alternativePlanId")} className={inputClass}><option value="">대안 없음</option>{plans.filter((plan) => plan.id !== state.draft.representativePlanId).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label className={labelClass}>기준선<select aria-label="기준선" value="no_solar" disabled className={inputClass}><option value="no_solar">무태양광 기준선</option></select></label>
        <div className={`${labelClass} rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-2`}>수요 조건<strong className="mt-1 block text-xs text-[var(--colors-ink)]">예측 수요 · 15분 간격</strong></div>
        <label className={labelClass}>전기요금 (KRW/kWh)<input aria-label="전기요금 (KRW/kWh)" type="number" min="0" step="1" value={state.draft.conditions.electricityPriceKrwPerKwh} onChange={condition("electricityPriceKrwPerKwh")} className={inputClass}/></label>
        <label className={labelClass}>탄소배출계수 (kgCO2/kWh)<input aria-label="탄소배출계수 (kgCO2/kWh)" type="number" min="0" step="0.01" value={state.draft.conditions.carbonIntensityKgCo2ePerKwh} onChange={condition("carbonIntensityKgCo2ePerKwh")} className={inputClass}/></label>
      </div>
      <button type="button" aria-label="분석 실행" onClick={execute} disabled={state.status === "loading" || !state.draft.representativePlanId || !state.draft.date || !costConditionsValid} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--colors-primary)] px-3 text-xs font-extrabold text-white disabled:opacity-60">{state.status === "loading" ? <><RefreshCw size={15} className="animate-spin"/>분석 중</> : <><Play size={15}/>분석 실행</>}</button>
    </>}

    {state.error && <div role="alert" className="rounded-xl border border-[#d45555]/40 bg-[#d45555]/10 p-3 text-xs"><span className="flex items-center gap-2 font-bold"><AlertTriangle size={15}/>분석을 완료하지 못했습니다.</span><span className="mt-1 block break-words text-[var(--colors-ink-muted)]">{state.error}</span></div>}
    {state.runs.length > 0 && <label className={labelClass}>이전 실행 스냅샷<select aria-label="이전 실행 스냅샷" value={state.report?.id ?? ""} onChange={selectRun} className={inputClass}><option value="" disabled>실행 선택</option>{state.runs.map((run) => <option key={run.id} value={run.id}>{run.date} · {run.plans.representative.name}</option>)}</select></label>}
    {state.dirty && state.report && <p className="rounded-lg border border-[#d89b2b]/40 bg-[#d89b2b]/10 p-3 text-[11px] leading-5 text-[var(--colors-ink-muted)]">조건이 변경되었습니다. 다시 실행하기 전까지 아래 결과는 이전 실행 스냅샷입니다.</p>}
    {state.report && <div data-qa="analysis-report" className="space-y-3"><div className="rounded-xl border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-3 text-[11px] leading-5 text-[var(--colors-ink-subtle)]"><strong className="block text-xs text-[var(--colors-ink)]">실행 스냅샷 · {state.report.date}</strong>{state.report.plans.representative.name} · {state.report.conditions.weatherPreset} · 예측 수요 · {state.report.conditions.intervalMinutes}분 · {state.report.conditions.electricityPriceKrwPerKwh.toLocaleString("ko-KR")} KRW/kWh · {state.report.conditions.carbonIntensityKgCo2ePerKwh} kgCO2/kWh · {state.report.conditions.generationModel} · {state.report.conditions.timezone}</div><AnalysisKpis run={state.report}/><AnalysisSeriesChart run={state.report}/><AnalysisInsights run={state.report}/></div>}
  </section>;
}
