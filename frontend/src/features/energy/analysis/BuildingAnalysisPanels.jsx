import { Lightbulb, TrendingDown } from "lucide-react";
import { formatEnergy, formatPercent } from "../dashboard/dashboardFormatting.mjs";
import { buildAnalysisInsights } from "./analysisContracts.mjs";

const surface = "rounded-xl border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)]";

function line(values, max, width = 640, height = 170) {
  return values.map((value, index) => `${index ? "L" : "M"}${(index / (values.length - 1)) * width} ${height - value / max * (height - 10)}`).join(" ");
}

export function AnalysisKpis({ run }) {
  const values = [
    ["무태양광 기준 수요", formatEnergy(run.kpis.baseline.demandEnergyKwh)],
    ["대표 계획 발전", formatEnergy(run.kpis.proposed.generationEnergyKwh)],
    ...(run.kpis.alternative ? [
      ["대안 계획 발전", formatEnergy(run.kpis.alternative.generationEnergyKwh)],
      ["대표 대비 발전 차이", formatEnergy(run.deltas.alternativeGenerationDifferenceEnergyKwh)],
    ] : []),
    ["계통전력 절감", formatEnergy(run.deltas.gridImportReductionEnergyKwh)],
    ["계통전력 절감률", formatPercent(run.deltas.gridImportReductionRatio)],
    ["비용 절감", `${Math.round(run.deltas.costSavingsKrw).toLocaleString("ko-KR")} KRW`],
    ["탄소 감축", `${run.deltas.carbonReductionKgCo2e.toFixed(1)} kgCO2`],
    ["대표 계획 자급률", formatPercent(run.deltas.selfSufficiencyRatio)],
    ["잉여 발전", formatEnergy(run.kpis.proposed.surplusEnergyKwh)],
  ];
  return <section aria-label="단일 건물 분석 KPI" className="grid grid-cols-2 gap-2">{values.map(([label, value]) => <article key={label} className={`${surface} p-3`}><span className="text-[11px] font-bold text-[var(--colors-ink-subtle)]">{label}</span><strong className="mt-1 block text-base tabular-nums">{value}</strong></article>)}</section>;
}

export function AnalysisSeriesChart({ run }) {
  const demand = run.series.map((item) => item.demandEnergyKwh);
  const proposed = run.series.map((item) => item.proposedGenerationEnergyKwh);
  const alternative = run.series.map((item) => item.alternativeGenerationEnergyKwh ?? 0);
  const gridDraw = run.series.map((item) => item.gridImportEnergyKwh);
  const max = Math.max(...demand, ...proposed, ...alternative, ...gridDraw, 0.001);
  return <section className={`${surface} overflow-hidden p-4`}><h3 className="text-sm font-extrabold">수요·기준선·설치 계획</h3><p className="mt-1 text-[11px] text-[var(--colors-ink-subtle)]">96개 15분 구간 · 실행 스냅샷</p><svg role="img" aria-label="96개 15분 구간의 수요, 계통 인입과 대표 및 대안 설치 계획 발전량" viewBox="0 0 640 170" preserveAspectRatio="none" className="mt-3 h-40 w-full"><path d={line(demand, max)} fill="none" stroke="#828fff" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/><path data-series="grid-draw" d={line(gridDraw, max)} fill="none" stroke="#d45555" strokeDasharray="3 3" strokeWidth="2" vectorEffect="non-scaling-stroke"/><path d={line(proposed, max)} fill="none" stroke="#27a644" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>{run.kpis.alternative && <path d={line(alternative, max)} fill="none" stroke="#d89b2b" strokeDasharray="5 4" strokeWidth="2" vectorEffect="non-scaling-stroke"/>}</svg><div className="mt-2 flex flex-wrap gap-3 text-[10px] font-bold"><span className="text-[#828fff]">— 수요</span><span className="text-[#d45555]">┄ 계통 인입</span><span className="text-[#27a644]">— 대표 계획</span>{run.kpis.alternative && <span className="text-[#d89b2b]">┄ 대안 계획</span>}<span className="text-[var(--colors-ink-subtle)]">무태양광 기준 발전: 0 kWh</span></div></section>;
}

export function AnalysisInsights({ run }) {
  return <section className={`${surface} p-4`} aria-labelledby="analysis-insights-title"><h3 id="analysis-insights-title" className="flex items-center gap-2 text-sm font-extrabold"><Lightbulb size={15}/>규칙 기반 해석</h3><ul className="mt-3 space-y-2">{buildAnalysisInsights(run).map((item) => <li key={item.id} className="flex gap-2 text-xs leading-5 text-[var(--colors-ink-muted)]"><TrendingDown size={14} className="mt-0.5 shrink-0 text-[var(--colors-primary)]"/>{item.message}</li>)}</ul></section>;
}
