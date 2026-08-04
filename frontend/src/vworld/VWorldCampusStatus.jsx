import { useEffect, useMemo, useState } from "react";
import { createCampusComparisonClient } from "../features/energy/campus/CampusComparisonPanel";

const LABELS = { simulated: "완료", incomplete: "불완전", no_scenario: "미설정" };
const TONES = { simulated: "#27a644", incomplete: "#d89b2b", no_scenario: "#737880" };

export function VWorldCampusStatus({ onSelection, date = "2026-05-18", client }) {
  const api = useMemo(() => client ?? createCampusComparisonClient(), [client]);
  const [state, setState] = useState({ status: "loading", entries: [] });
  useEffect(() => {
    const controller = new AbortController();
    api.load({ date, weatherPreset: "clear", signal: controller.signal }).then((data) => {
      const byBuilding = new Map();
      for (const item of [...data.excluded, ...data.ranked]) byBuilding.set(item.buildingId, item);
      setState({ status: "success", entries: [...byBuilding.values()].sort((a, b) => a.buildingId.localeCompare(b.buildingId)) });
    }).catch((error) => { if (error?.name !== "AbortError") setState({ status: "error", entries: [] }); });
    return () => controller.abort();
  }, [api, date]);
  return <aside data-qa="vworld-campus-status" className="dashboard-card pointer-events-auto absolute bottom-20 left-6 z-10 hidden max-w-[280px] p-3 lg:block" aria-label="VWorld 건물 태양광 상태">
    <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[var(--colors-primary)]">Solar status · {date}</div>
    {state.status === "loading" && <p role="status" className="mt-2 text-xs text-[var(--colors-ink-muted)]">건물 상태 확인 중</p>}
    {state.status === "error" && <p role="alert" className="mt-2 text-xs text-[var(--colors-ink-muted)]">상태 API 연결 필요</p>}
    {state.status === "success" && <div className="mt-2 flex flex-wrap gap-1.5">{state.entries.map((item) => <button key={item.buildingId} type="button" data-status={item.buildingStatus} title={`${item.buildingName}: ${LABELS[item.buildingStatus]}`} aria-label={`${item.buildingName} ${LABELS[item.buildingStatus]} 시나리오 열기`} onClick={() => onSelection({ elementId: `BLD_${item.buildingId}`, buildingId: item.buildingId, displayName: item.buildingName })} className="flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--colors-hairline-strong)] bg-[var(--colors-surface-2)] px-2.5 text-[11px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TONES[item.buildingStatus] }} />{item.buildingId}<span className="font-medium text-[var(--colors-ink-subtle)]">{LABELS[item.buildingStatus]}</span></button>)}</div>}
    <p className="mt-2 break-keep text-[10px] leading-4 text-[var(--colors-ink-subtle)]">색상과 상태 텍스트를 함께 표시합니다. 건물을 선택하면 일치하는 에너지 시나리오가 열립니다.</p>
  </aside>;
}
