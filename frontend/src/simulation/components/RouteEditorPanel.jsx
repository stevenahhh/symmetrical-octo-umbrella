import React, { useEffect, useRef, useState } from "react";
import { routeEditorStore, useRouteEditorStore } from "../stores/routeEditorStore";
import { SIMULATION_API_URL } from "../utils/apiConfig";

const KINDS = ["vehicle_lane", "sidewalk", "scooter_lane", "shared_path", "crosswalk", "building_entrance", "parking_connection", "scooter_parking_connection"];

function downloadGeoJSON(feature) {
  const payload = { type: "FeatureCollection", metadata: { status: "draft_requires_validation", coordinate_system: "simulation local meters" }, features: [feature] };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${feature.properties.id}.geojson`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function RouteEditorPanel() {
  const state = useRouteEditorStore((value) => value);
  const input = useRef(null);
  const [message, setMessage] = useState("");
  const [quality, setQuality] = useState(null);
  useEffect(() => {
    if (!state.enabled) return;
    fetch(`${SIMULATION_API_URL}/api/simulation/network/quality`).then((response) => response.json()).then(setQuality).catch(() => setQuality(null));
  }, [state.enabled]);
  const save = () => {
    try { downloadGeoJSON(routeEditorStore.toFeature()); setMessage("Draft GeoJSON을 다운로드했습니다. 검증·승인 전에는 authoritative network에 포함되지 않습니다."); }
    catch (error) { setMessage(error.message); }
  };
  const load = async (event) => {
    try {
      const payload = JSON.parse(await event.target.files[0].text());
      const features = payload.type === "FeatureCollection" ? payload.features : [payload];
      routeEditorStore.loadFeatures(features);
      const editable = features.find((feature) => ["LineString", "Polygon"].includes(feature.geometry?.type));
      if (editable) routeEditorStore.loadFeature(editable);
      setMessage(`${features.length}개 Feature를 불러왔습니다.`);
    } catch (error) { setMessage(`불러오기 실패: ${error.message}`); }
    event.target.value = "";
  };
  return (
    <div className="space-y-3 rounded-md border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-3 text-[12px]">
      <div className="flex items-center justify-between"><span className="font-[900]">Route Editing Mode</span><button type="button" onClick={() => routeEditorStore.setEnabled(!state.enabled)} className="font-[800] text-[var(--colors-primary)]">{state.enabled ? "끄기" : "켜기"}</button></div>
      {state.enabled && <>
        <label className="block">종류<select value={state.kind} onChange={(event) => routeEditorStore.setMetadata({ kind: event.target.value })} className="mt-1 h-8 w-full rounded border bg-transparent px-2">{KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        {state.kind === "crosswalk" && <div className="grid grid-cols-2 gap-2"><label>Geometry<select value={state.geometryMode} onChange={(event) => routeEditorStore.setMetadata({ geometryMode: event.target.value })} className="mt-1 h-8 w-full rounded border bg-transparent px-1"><option value="centerline">중심선+폭</option><option value="polygon">Polygon</option></select></label><label>폭(m)<input type="number" min="0.5" step="0.5" value={state.width} onChange={(event) => routeEditorStore.setMetadata({ width: Number(event.target.value) })} className="mt-1 h-8 w-full rounded border bg-transparent px-2" /></label></div>}
        <div className="grid grid-cols-2 gap-2"><label>방향<select value={state.direction} onChange={(event) => routeEditorStore.setMetadata({ direction: event.target.value })} className="mt-1 h-8 w-full rounded border bg-transparent px-1"><option value="bidirectional">양방향</option><option value="forward">단방향</option></select></label><label>신뢰도<input type="number" min="0" max="1" step="0.05" value={state.confidence} onChange={(event) => routeEditorStore.setMetadata({ confidence: Number(event.target.value) })} className="mt-1 h-8 w-full rounded border bg-transparent px-2" /></label></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={state.showNetwork} onChange={(event) => routeEditorStore.setShowNetwork(event.target.checked)} />기존 Network 표시</label>
        <div>상태: <b>{state.mode}</b> · Point {state.points.length}개{state.mode === "moving" ? " · 지도에서 새 위치 클릭" : ""}</div>
        <div className="grid grid-cols-4 overflow-hidden rounded border"><button type="button" onClick={() => routeEditorStore.create()} className="h-8 border-r">생성</button><button type="button" onClick={() => routeEditorStore.edit()} className="h-8 border-r">편집</button><button type="button" onClick={() => routeEditorStore.finish()} className="h-8 border-r">완료</button><button type="button" onClick={() => routeEditorStore.cancel()} className="h-8">취소</button></div>
        <div className="grid grid-cols-3 overflow-hidden rounded border"><button type="button" onClick={() => routeEditorStore.moveSelected()} className="h-8 border-r">Point 이동</button><button type="button" onClick={() => routeEditorStore.deleteSelected()} className="h-8 border-r">Point 삭제</button><button type="button" onClick={save} className="h-8">GeoJSON 저장</button></div>
        <button type="button" onClick={() => input.current?.click()} className="h-8 w-full rounded border">기존 GeoJSON 불러오기</button><input ref={input} type="file" accept=".json,.geojson,application/json" className="hidden" onChange={load} />
        {quality && <div className="border-t pt-2 text-[11px]"><b>Data Quality</b><br />Edge {quality.summary?.edges} · Derived {quality.summary?.derived_edges} · Authoritative {quality.summary?.authoritative_edges}<br />Crosswalk Edge {quality.summary?.crosswalk_edges} · Validation {quality.valid ? "PASS" : "FAIL"}</div>}
        {message && <div className="text-[11px] text-[var(--colors-ink-subtle)]">{message}</div>}
      </>}
    </div>
  );
}
