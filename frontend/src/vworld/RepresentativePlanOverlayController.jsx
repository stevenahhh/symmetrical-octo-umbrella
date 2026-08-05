import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createInstallationPlanClient } from "../features/energy/installations/installationPlanApi.mjs";
import {
  hasVerifiedVWorldRoofTransform,
  loadRepresentativePlanOverlays,
} from "./representativePlanOverlay.mjs";

/**
 * UI/controller leaf for a VWorld representative-plan layer.
 * onOverlayDataChange receives renderer-neutral roof-local overlays; [] means hidden.
 */
export function RepresentativePlanOverlayController({
  buildingIds,
  client,
  loadOverlays = loadRepresentativePlanOverlays,
  onOverlayDataChange,
  onBuildingSelect,
  refreshKey,
  defaultVisible = true,
  className = "",
}) {
  const api = useMemo(() => client ?? createInstallationPlanClient(), [client]);
  const callbackRef = useRef(onOverlayDataChange);
  const visibleRef = useRef(defaultVisible);
  const [visible, setVisible] = useState(defaultVisible);
  const [overlays, setOverlays] = useState([]);
  const [state, setState] = useState({ status: "loading", message: "대표 설치 계획을 불러오는 중입니다." });
  const buildingKey = Array.isArray(buildingIds) ? buildingIds.join("\u0000") : "";

  useEffect(() => { callbackRef.current = onOverlayDataChange; }, [onOverlayDataChange]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setOverlays([]);
    setState({ status: "loading", message: "대표 설치 계획을 불러오는 중입니다." });
    callbackRef.current?.([]);
    loadOverlays({ buildingIds, client: api, signal: controller.signal }).then((next) => {
      if (!active) return;
      setOverlays(next);
      setState({ status: "ready", message: "" });
      callbackRef.current?.(visibleRef.current ? next : []);
    }).catch((error) => {
      if (!active || error?.name === "AbortError") return;
      setOverlays([]);
      setState({ status: "error", message: error?.message || "대표 설치 계획을 불러오지 못했습니다." });
      callbackRef.current?.([]);
    });
    return () => {
      active = false;
      controller.abort();
      callbackRef.current?.([]);
    };
  // buildingKey intentionally represents the value identity of buildingIds.
  }, [api, buildingKey, loadOverlays, refreshKey]);

  const toggle = () => {
    const next = !visibleRef.current;
    visibleRef.current = next;
    setVisible(next);
    callbackRef.current?.(next ? overlays : []);
  };

  const overlayByBuilding = new Map(overlays.map((overlay) => [overlay.buildingId, overlay]));
  const label = visible ? "대표 설치 계획 숨기기" : "대표 설치 계획 표시하기";
  return <aside className={`dashboard-card pointer-events-auto max-w-72 rounded-lg p-2 ${className}`} aria-label="대표 설치 계획 지도 레이어">
    <button type="button" aria-label={label} aria-pressed={visible} onClick={toggle} className="dashboard-ghost-button inline-flex min-h-10 items-center gap-2 px-3 text-xs font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]">
      {state.status === "loading" ? <RefreshCw className="animate-spin" size={15} /> : visible ? <Eye size={15} /> : <EyeOff size={15} />}
      대표 설치 계획
    </button>
    {state.status === "loading" && <span className="sr-only" role="status">{state.message}</span>}
    {state.status === "error" && <p role="alert" className="mt-1 max-w-56 px-2 text-[11px] text-red-300">{state.message}</p>}
    {state.status === "ready" && <div className="mt-1 border-t border-[var(--colors-hairline)] pt-1" aria-label="건물별 대표 설치 계획 상태">
      {buildingIds.map((buildingId) => {
        const overlay = overlayByBuilding.get(buildingId);
        const hasWorldGeometry = hasVerifiedVWorldRoofTransform(buildingId);
        const panelCount = overlay?.arrays?.length ?? 0;
        const capacity = Number.isFinite(overlay?.installedCapacityKwp)
          ? `${overlay.installedCapacityKwp.toFixed(3)} kWp`
          : "설치 용량 확인 불가";
        return <div key={buildingId} data-building-id={buildingId} data-geometry-status={hasWorldGeometry ? "verified" : "unverified"} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-[11px]">
          <div className="min-w-0">
            <strong>{buildingId}</strong>
            {overlay && <p className="truncate font-bold text-[var(--colors-ink)]">{overlay.name}</p>}
            <p className="break-keep text-[var(--colors-ink-subtle)]">
              {!overlay ? "대표 설치안 미지정" : hasWorldGeometry ? `${capacity} · ${panelCount}개 배열 · 지도 표시 가능` : `${capacity} · ${panelCount}개 배열 · 검증된 지도 좌표 없음`}
            </p>
          </div>
          {!hasWorldGeometry && onBuildingSelect && <button type="button" onClick={() => onBuildingSelect(buildingId)} className="dashboard-ghost-button min-h-9 shrink-0 px-2 text-[10px] font-extrabold" aria-label={`${buildingId} 상세 분석 보기`}>상세 분석</button>}
        </div>;
      })}
      <p className="px-2 pt-1 text-[10px] leading-4 text-[var(--colors-ink-subtle)]">읽기 전용 · 검증된 옥상 좌표가 있는 건물만 지도에 표시됩니다.</p>
    </div>}
  </aside>;
}
