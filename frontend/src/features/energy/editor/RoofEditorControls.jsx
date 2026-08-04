import { Plus, Redo2, RotateCcw, Save, Trash2 } from "lucide-react";

const inputClass = "h-10 w-full rounded-md border border-[var(--colors-hairline-strong)] bg-[var(--colors-surface-2)] px-3 text-sm text-[var(--colors-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--colors-hairline-strong)] bg-[var(--colors-surface-2)] px-3 text-xs font-extrabold text-[var(--colors-ink-muted)] transition-colors hover:bg-[var(--colors-surface-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)] disabled:cursor-not-allowed disabled:opacity-40";
const selectedButtonClass = `${buttonClass} border-[var(--colors-primary)] bg-[color-mix(in_srgb,var(--colors-primary)_22%,var(--colors-surface-2))] text-[var(--colors-ink)]`;

function NumberField({ label, value, min, max, step = 1, suffix, onChange }) {
  return <label className="grid gap-1 text-xs font-bold text-[var(--colors-ink-muted)]">
    <span>{label} <span className="font-normal text-[var(--colors-ink-subtle)]">({suffix})</span></span>
    <input className={inputClass} aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>;
}

export function RoofEditorControls({ buildingId = "D4", arrays = [], selectedArray, summary, canSave, canUndo, status, violations, onAdd, onSelect, onUpdate, onDelete, onUndo, onSave, onReload }) {
  return <aside className="absolute inset-x-3 bottom-3 z-20 max-h-[52%] overflow-y-auto rounded-xl border border-[var(--colors-hairline-strong)] bg-[color-mix(in_srgb,var(--colors-surface-1)_94%,transparent)] p-4 shadow-2xl backdrop-blur-xl md:inset-y-4 md:left-auto md:right-4 md:max-h-none md:w-[360px]" aria-label="태양광 설치 제어판">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[11px] font-extrabold tracking-[0.08em] text-[var(--colors-primary-hover)]">ROOF INSTALLATION</p><h2 className="mt-1 text-xl font-bold">{buildingId} 옥상 태양광</h2></div>
      <button className={buttonClass} type="button" aria-label="태양광 배열 추가" onClick={onAdd}><Plus size={15} /> 배열 추가</button>
    </div>

    {arrays.length > 1 && <div className="mt-4 flex gap-2 overflow-x-auto" aria-label="배열 선택 목록">{arrays.map((array, index) => {
      const selected = array.id === selectedArray?.id;
      return <button className={selected ? selectedButtonClass : buttonClass} aria-pressed={selected} type="button" key={array.id} onClick={() => onSelect(array.id)}>배열 {index + 1}</button>;
    })}</div>}

    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-md bg-[var(--colors-surface-2)] p-2"><dt className="text-[11px] text-[var(--colors-ink-subtle)]">모듈</dt><dd className="mt-1 text-sm font-extrabold">{summary.moduleCount}장</dd></div>
      <div className="rounded-md bg-[var(--colors-surface-2)] p-2"><dt className="text-[11px] text-[var(--colors-ink-subtle)]">면적</dt><dd className="mt-1 text-sm font-extrabold">{summary.areaSquareMeters.toFixed(2)}m²</dd></div>
      <div className="rounded-md bg-[var(--colors-surface-2)] p-2"><dt className="text-[11px] text-[var(--colors-ink-subtle)]">용량</dt><dd className="mt-1 text-sm font-extrabold">{summary.capacityKwp.toFixed(3)}kWp</dd></div>
    </dl>

    {selectedArray && <div className="mt-4 grid grid-cols-2 gap-3">
      <NumberField label="가로 위치" suffix="m" min={0} step={0.1} value={selectedArray.originMeters.xMeters} onChange={(xMeters) => onUpdate({ originMeters: { ...selectedArray.originMeters, xMeters } })} />
      <NumberField label="세로 위치" suffix="m" min={0} step={0.1} value={selectedArray.originMeters.yMeters} onChange={(yMeters) => onUpdate({ originMeters: { ...selectedArray.originMeters, yMeters } })} />
      <NumberField label="행 수" suffix="행" min={1} max={12} value={selectedArray.rows} onChange={(rows) => onUpdate({ rows })} />
      <NumberField label="열 수" suffix="열" min={1} max={12} value={selectedArray.columns} onChange={(columns) => onUpdate({ columns })} />
      <NumberField label="방위각" suffix="°" min={0} max={359} value={selectedArray.azimuthDeg} onChange={(azimuthDeg) => onUpdate({ azimuthDeg })} />
      <NumberField label="경사각" suffix="°" min={0} max={45} value={selectedArray.tiltDeg} onChange={(tiltDeg) => onUpdate({ tiltDeg })} />
      <fieldset className="col-span-2"><legend className="mb-1 text-xs font-bold text-[var(--colors-ink-muted)]">모듈 방향</legend><div className="grid grid-cols-2 gap-2">
        <button type="button" className={buttonClass} aria-pressed={selectedArray.orientation === "portrait"} onClick={() => onUpdate({ orientation: "portrait" })}>세로형</button>
        <button type="button" className={buttonClass} aria-pressed={selectedArray.orientation === "landscape"} onClick={() => onUpdate({ orientation: "landscape" })}>가로형</button>
      </div></fieldset>
    </div>}

    {violations.length > 0 && <div className="mt-4 rounded-md border border-red-400/60 bg-red-950/70 px-3 py-2 text-xs font-semibold leading-5 text-red-100" role="alert"><ul>{violations.map((violation) => <li key={`${violation.code}-${violation.obstacleId ?? violation.otherArrayId ?? "layout"}`}>{violation.messageKo}</li>)}</ul><span className="block font-normal text-red-200/80">Esc 키로 마지막 유효 배치로 돌아갑니다.</span></div>}
    {status.message && <p className={`mt-3 text-xs font-semibold ${status.kind === "error" ? "text-red-300" : "text-emerald-300"}`} role="status">{status.message}</p>}

    <div className="mt-4 grid grid-cols-2 gap-2">
      <button className={buttonClass} type="button" onClick={onUndo} disabled={!canUndo}><RotateCcw size={15} /> 실행 취소</button>
      <button className={buttonClass} type="button" onClick={onDelete} disabled={!selectedArray}><Trash2 size={15} /> 삭제</button>
      <button className={buttonClass} type="button" onClick={onReload} disabled={status.busy}><Redo2 size={15} /> 다시 불러오기</button>
      <button className={`${buttonClass} border-[var(--colors-primary)] bg-[var(--colors-primary)] text-white hover:bg-[var(--colors-primary-hover)]`} type="button" aria-label="배치 저장" onClick={onSave} disabled={!canSave || status.busy}><Save size={15} /> {status.busy ? "처리 중" : "배치 저장"}</button>
    </div>
  </aside>;
}
