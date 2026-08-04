import { Activity, BatteryCharging, Building2, CloudSun, Leaf, PlugZap, SunMedium, WalletCards } from "lucide-react";
import { formatCarbon, formatEnergy, formatKrw, formatPercent } from "./dashboardFormatting.mjs";

const surface = "rounded-xl border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)]";

export function ProvenancePanel({ data }) {
  return <section data-qa="energy-provenance" className={`${surface} p-4`} aria-labelledby="energy-provenance-title">
    <div className="flex items-center justify-between gap-3"><h3 id="energy-provenance-title" className="text-sm font-extrabold">가정과 데이터 출처</h3><CloudSun size={16} className="text-[var(--colors-primary)]" /></div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div><span className="block text-[var(--colors-ink-subtle)]">소비 전력</span><strong className="mt-1 block text-[var(--colors-ink)]">가상 예측</strong></div>
      <div><span className="block text-[var(--colors-ink-subtle)]">일사량</span><strong className="mt-1 block text-[var(--colors-ink)]">시나리오/추정</strong></div>
    </div>
    <p className="mt-3 text-[11px] leading-5 text-[var(--colors-ink-subtle)]">공학 보정 전 시뮬레이션 · {data.provenance.model} · 15분 간격 · Asia/Seoul</p>
    <p className="mt-1 text-[11px] leading-5 text-[var(--colors-ink-muted)]">절감 가정: 160 KRW/kWh · 탄소계수 0.45 kgCO₂e/kWh</p>
  </section>;
}

const KPI_DEFS = [
  ["예측 소비", "predictedDemandEnergyKwh", formatEnergy, Activity],
  ["태양광 발전", "generationEnergyKwh", formatEnergy, SunMedium],
  ["자급률", "selfSufficiencyRatio", formatPercent, BatteryCharging],
  ["외부 전력", "gridImportEnergyKwh", formatEnergy, PlugZap],
  ["잉여 발전", "surplusEnergyKwh", formatEnergy, Building2],
  ["전기료 절감", "savingsKrw", formatKrw, WalletCards],
  ["탄소 회피", "carbonAvoidedKgCo2e", formatCarbon, Leaf],
];
export function KpiGrid({ data }) {
  return <section data-qa="energy-kpi" aria-label="에너지 핵심 지표" className="grid grid-cols-2 gap-2">
    {KPI_DEFS.map(([label, key, format, Icon], index) => <article key={key} className={`${surface} min-w-0 p-3 ${index === 0 ? "col-span-2" : ""}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--colors-ink-subtle)]"><Icon size={13} />{label}{key === "predictedDemandEnergyKwh" && <span className="rounded-full bg-[var(--colors-surface-3)] px-1.5 py-0.5">가상 예측</span>}</div>
      <div className="mt-2 break-keep text-lg font-semibold tabular-nums text-[var(--colors-ink)]">{format(data.kpis[key])}</div>
    </article>)}
  </section>;
}

function path(values, max, width = 640, height = 180) {
  return values.map((value, index) => `${index ? "L" : "M"}${(index / 95) * width} ${height - (value / max) * (height - 12)}`).join(" ");
}
export function EnergyChart({ data }) {
  const demand = data.chart.map((item) => item.predictedDemandEnergyKwh);
  const generation = data.chart.map((item) => item.generationEnergyKwh);
  const irradiance = data.chart.map((item) => item.irradianceWm2);
  const energyMax = Math.max(...demand, ...generation, 0.001);
  const irradianceMax = Math.max(...irradiance, 1);
  return <section data-qa="energy-chart" className={`${surface} overflow-hidden p-4`} aria-labelledby="energy-chart-title">
    <div className="flex items-start justify-between gap-3"><div><h3 id="energy-chart-title" className="text-sm font-extrabold">수요와 발전</h3><p className="mt-1 text-[11px] text-[var(--colors-ink-subtle)]">같은 15분 시간축 · 에너지 kWh</p></div><span className="text-[10px] font-bold text-[var(--colors-ink-muted)]">일사량 · 시나리오/추정</span></div>
    <svg role="img" aria-label="96개 15분 구간의 가상 예측 수요와 시나리오 발전 비교" viewBox="0 0 640 180" className="mt-4 h-[180px] w-full" preserveAspectRatio="none">
      {[0, 45, 90, 135, 180].map((y) => <line key={y} x1="0" x2="640" y1={y} y2={y} stroke="var(--colors-hairline)" />)}
      <path d={path(irradiance, irradianceMax)} fill="none" stroke="var(--colors-ink-subtle)" strokeDasharray="4 5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={path(demand, energyMax)} fill="none" stroke="#828fff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <path d={path(generation, energyMax)} fill="none" stroke="#27a644" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="mt-2 flex flex-wrap gap-4 text-[11px] font-bold"><span className="text-[#828fff]">— 수요 · 가상 예측</span><span className="text-[#27a644]">— 발전</span><span className="text-[var(--colors-ink-subtle)]">┄ 일사량 · 시나리오/추정</span></div>
  </section>;
}

export function LossBreakdown({ data }) {
  return <section data-qa="energy-loss" className={`${surface} p-4`} aria-labelledby="energy-loss-title">
    <h3 id="energy-loss-title" className="text-sm font-extrabold">발전 손실 구조</h3>
    <div className="mt-3 flex items-center justify-between text-xs"><span>시스템 손실</span><strong>시스템 손실 {formatPercent(data.losses.systemLossFraction)}</strong></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--colors-surface-3)]"><div className="h-full bg-[var(--colors-primary)]" style={{ width: formatPercent(data.losses.systemLossFraction) }} /></div>
    <p className="mt-3 text-[11px] leading-5 text-[var(--colors-ink-subtle)]">배선·인버터 등 모델 일괄 계수입니다. 개별 손실 에너지는 API가 제공하지 않아 표시하지 않습니다.</p>
  </section>;
}

export function RoomBreakdown({ data }) {
  const max = Math.max(...data.roomTypes.map((item) => item.energyKwh));
  return <section data-qa="energy-room-breakdown" className={`${surface} p-4`} aria-labelledby="energy-room-title">
    <h3 id="energy-room-title" className="text-sm font-extrabold">공간 유형별 수요</h3><p className="mt-1 text-[11px] text-[var(--colors-ink-subtle)]">가상 시간표·설비 부하 가정</p>
    {data.roomTypes.length === 0 ? <p className="mt-4 text-xs leading-5 text-[var(--colors-ink-muted)]">이 비교 건물의 공간 유형별 상세 수요는 제공되지 않습니다.</p> : <div className="mt-4 space-y-3">{data.roomTypes.map((item) => <div key={item.type}><div className="flex items-center justify-between text-xs"><span>{item.label}</span><strong>{formatEnergy(item.energyKwh)}</strong></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--colors-surface-3)]"><div className="h-full bg-[var(--colors-primary)]" style={{ width: `${(item.energyKwh / max) * 100}%` }} /></div></div>)}</div>}
  </section>;
}
