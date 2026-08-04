import { useCallback, useEffect, useMemo, useState } from "react";
import { D4_ROOF_SCENARIO_FIXTURE } from "../domain/fixtures/d4RoofScenarioFixture.mjs";
import { loadEnergyEditorDocument, saveEnergyScenario, toScenarioPayload } from "./energyScenarioApi.mjs";
import { RoofEditorControls } from "./RoofEditorControls";
import { RoofEditorScene } from "./RoofEditorScene";
import { addArray, createRoofEditorState, deleteSelectedArray, dismissInvalidPreview, moveSelectedArray, replaceScenarioArrays, selectArray, summarizeLayout, undoLatestEdit, updateSelectedArray } from "./roofEditorState.mjs";

const DEFAULT_SCENARIO_ID = "D4-scenario-south-2x8";
const initialStatus = { busy: false, kind: "idle", message: "" };

export function RoofEditor({ buildingId = "D4", scenarioId = DEFAULT_SCENARIO_ID }) {
  const [editor, setEditor] = useState(() => buildingId === "D4" && scenarioId === DEFAULT_SCENARIO_ID
    ? createRoofEditorState(structuredClone(D4_ROOF_SCENARIO_FIXTURE)) : null);
  const [status, setStatus] = useState(initialStatus);
  const apiBase = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

  const reload = useCallback(async () => {
    setEditor((current) => current?.roof.buildingId === buildingId ? current : null);
    setStatus({ busy: true, kind: "idle", message: "저장된 배치를 불러오는 중입니다." });
    try {
      const document = await loadEnergyEditorDocument(apiBase, buildingId, scenarioId);
      setEditor(createRoofEditorState(document));
      setStatus({ busy: false, kind: "success", message: "저장된 배치를 불러왔습니다." });
    } catch (error) {
      setStatus({ busy: false, kind: "error", message: error.message });
    }
  }, [apiBase, buildingId, scenarioId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setEditor((current) => dismissInvalidPreview(current));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const save = async () => {
    if (!editor.canSave || editor.violations.length) return;
    setStatus({ busy: true, kind: "idle", message: "배치를 저장하는 중입니다." });
    try {
      const payload = toScenarioPayload(editor.committedArrays, editor.modules[0]);
      const scenario = await saveEnergyScenario(apiBase, editor.scenarioId, payload, fetch, { buildingId });
      setEditor((current) => replaceScenarioArrays(current, scenario));
      setStatus({ busy: false, kind: "success", message: "배치를 저장했습니다." });
    } catch (error) {
      setStatus({ busy: false, kind: "error", message: error.message });
    }
  };

  const selectedArray = editor?.previewArrays.find((item) => item.id === editor.selectedArrayId) ?? null;
  const summary = useMemo(() => editor ? summarizeLayout(editor) : null, [editor]);

  if (!editor) return <div className="absolute inset-0 grid place-items-center bg-[#07101b] text-sm text-white" role={status.kind === "error" ? "alert" : "status"}>{status.message || "옥상 데이터를 불러오는 중입니다."}</div>;

  return <div className="absolute inset-0 bg-[#07101b]" aria-label={`${buildingId} 태양광 설치 모드`}>
    <RoofEditorScene state={editor} onSelect={(id) => setEditor((current) => selectArray(current, id))} onMove={(origin) => setEditor((current) => moveSelectedArray(current, origin))} />
    <div className="pointer-events-none absolute left-4 top-20 z-10 hidden rounded-lg border border-white/15 bg-black/55 px-4 py-3 text-xs font-semibold leading-5 text-white/80 backdrop-blur-md sm:block">
      <strong className="block text-sm text-white">옥상 로컬 좌표 · m</strong>배열 전체를 드래그해 이동합니다.<br />회색 영역은 계단실 장애물입니다.
    </div>
    <RoofEditorControls buildingId={buildingId} arrays={editor.previewArrays} selectedArray={selectedArray} summary={summary} canSave={editor.canSave && !editor.violations.length} canUndo={Boolean(editor.undoArrays)} status={status} violations={editor.violations} onAdd={() => setEditor((current) => addArray(current))} onSelect={(id) => setEditor((current) => selectArray(current, id))} onUpdate={(changes) => setEditor((current) => updateSelectedArray(current, changes))} onDelete={() => setEditor((current) => deleteSelectedArray(current))} onUndo={() => setEditor((current) => undoLatestEdit(current))} onSave={save} onReload={reload} />
  </div>;
}
