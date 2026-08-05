import { Copy, Edit3, Plus, Save, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createInstallationPlanClient, InstallationPlanContractError } from "./installationPlanApi.mjs";

const buttonClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[var(--colors-hairline-strong)] px-3 text-xs font-extrabold transition-colors hover:bg-[var(--colors-surface-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)] disabled:cursor-not-allowed disabled:opacity-40";
const NOOP = () => {};

function validateLoadedContext(buildingId, plans, representative) {
  if (!Array.isArray(plans)) throw new InstallationPlanContractError("plans", "array required");
  if (plans.some((plan) => plan.buildingId !== buildingId)) {
    throw new InstallationPlanContractError("plans", "every detailed plan must match the requested building");
  }
  if (representative && representative.buildingId !== buildingId) {
    throw new InstallationPlanContractError("representativePlan.buildingId", "requested building must match");
  }
  if (representative && !plans.some((plan) => plan.id === representative.installationPlanId)) {
    throw new InstallationPlanContractError("representativePlan.installationPlanId", "representative must be one of the loaded plans");
  }
}

/**
 * Building-detail plan management leaf.
 * createPlanDraft must return { name, arrays } where arrays remain in roof-local meters.
 */
export function InstallationPlanManager({
  buildingId,
  client,
  createPlanDraft,
  onEditPlan = NOOP,
  onPlansChange = NOOP,
  onRepresentativeChange = NOOP,
  refreshKey,
  className = "",
}) {
  const api = useMemo(() => client ?? createInstallationPlanClient(), [client]);
  const [plans, setPlans] = useState([]);
  const [representativeId, setRepresentativeId] = useState(null);
  const [names, setNames] = useState({});
  const [state, setState] = useState({ status: "loading", message: "설치 계획을 불러오는 중입니다." });
  const [busyAction, setBusyAction] = useState("");
  const callbacksRef = useRef({ onEditPlan, onPlansChange, onRepresentativeChange });
  const mutationRef = useRef({ generation: 0, controller: null });

  useEffect(() => {
    callbacksRef.current = { onEditPlan, onPlansChange, onRepresentativeChange };
  }, [onEditPlan, onPlansChange, onRepresentativeChange]);

  useEffect(() => () => {
    mutationRef.current.generation += 1;
    mutationRef.current.controller?.abort();
    mutationRef.current.controller = null;
  }, []);

  const publishPlans = useCallback((nextPlans) => {
    if (nextPlans.some((plan) => plan.buildingId !== buildingId)) {
      throw new InstallationPlanContractError("plans", "every published plan must match the requested building");
    }
    setPlans(nextPlans);
    setNames(Object.fromEntries(nextPlans.map((plan) => [plan.id, plan.name])));
    callbacksRef.current.onPlansChange(nextPlans);
  }, [buildingId]);

  const load = useCallback(() => {
    mutationRef.current.generation += 1;
    mutationRef.current.controller?.abort();
    mutationRef.current.controller = null;
    const controller = new AbortController();
    let active = true;
    publishPlans([]);
    setRepresentativeId(null);
    callbacksRef.current.onRepresentativeChange(null);
    setBusyAction("");
    setState({ status: "loading", message: "설치 계획을 불러오는 중입니다." });
    Promise.all([
      (api.listDetails ?? api.list).call(api, buildingId, { signal: controller.signal }),
      api.getRepresentative(buildingId, { signal: controller.signal }),
    ]).then(([nextPlans, representative]) => {
      if (!active) return;
      validateLoadedContext(buildingId, nextPlans, representative);
      publishPlans(nextPlans);
      setRepresentativeId(representative?.installationPlanId ?? null);
      callbacksRef.current.onRepresentativeChange(representative);
      setState({ status: "ready", message: "" });
    }).catch((error) => {
      if (active && error?.name !== "AbortError") {
        publishPlans([]);
        setRepresentativeId(null);
        callbacksRef.current.onRepresentativeChange(null);
        setState({ status: "error", message: error?.message || "설치 계획을 불러오지 못했습니다." });
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, buildingId, publishPlans, refreshKey]);

  useEffect(load, [load]);

  const run = async (key, operation) => {
    if (busyAction) return;
    mutationRef.current.controller?.abort();
    const controller = new AbortController();
    const generation = mutationRef.current.generation + 1;
    mutationRef.current = { generation, controller };
    const isFresh = () => mutationRef.current.generation === generation && mutationRef.current.controller === controller && !controller.signal.aborted;
    setBusyAction(key);
    setState({ status: "ready", message: "" });
    try {
      await operation({ signal: controller.signal, isFresh });
    } catch (error) {
      if (isFresh() && error?.name !== "AbortError") {
        setState({ status: "error", message: error?.message || "설치 계획 작업에 실패했습니다." });
      }
    } finally {
      if (isFresh()) {
        mutationRef.current.controller = null;
        setBusyAction("");
      }
    }
  };

  const create = () => run("create", async ({ signal, isFresh }) => {
    const draft = await createPlanDraft({ buildingId, plans, representativePlanId: representativeId });
    if (!isFresh()) return;
    const created = await api.create({ buildingId, name: draft.name, arrays: draft.arrays }, { signal });
    if (!isFresh()) return;
    if (created.buildingId !== buildingId) throw new InstallationPlanContractError("plan.buildingId", "created plan must match the requested building");
    publishPlans([...plans, created]);
    callbacksRef.current.onEditPlan(created);
  });

  const rename = (plan) => run(`rename-${plan.id}`, async ({ signal, isFresh }) => {
    const updated = await api.update(plan.id, { buildingId, name: names[plan.id], arrays: plan.arrays }, { signal });
    if (!isFresh()) return;
    if (updated.id !== plan.id || updated.buildingId !== buildingId) {
      throw new InstallationPlanContractError("plan", "updated plan identity must match the request");
    }
    publishPlans(plans.map((item) => item.id === plan.id ? updated : item));
  });

  const copy = (plan) => run(`copy-${plan.id}`, async ({ signal, isFresh }) => {
    const created = await api.copy(plan, `${names[plan.id] || plan.name} 복사본`, { signal });
    if (!isFresh()) return;
    if (created.buildingId !== buildingId) throw new InstallationPlanContractError("plan.buildingId", "copied plan must match the requested building");
    publishPlans([...plans, created]);
  });

  const makeRepresentative = (plan) => run(`representative-${plan.id}`, async ({ signal, isFresh }) => {
    const representative = await api.setRepresentative(buildingId, plan.id, { signal });
    if (!isFresh()) return;
    if (representative.buildingId !== buildingId || representative.installationPlanId !== plan.id) {
      throw new InstallationPlanContractError("representativePlan", "updated representative identity must match the request");
    }
    setRepresentativeId(representative.installationPlanId);
    callbacksRef.current.onRepresentativeChange(representative);
  });

  const clearRepresentative = (plan) => run(`representative-${plan.id}`, async ({ signal, isFresh }) => {
    await api.unsetRepresentative(buildingId, { signal });
    if (!isFresh()) return;
    setRepresentativeId(null);
    callbacksRef.current.onRepresentativeChange(null);
  });

  const remove = (plan) => run(`delete-${plan.id}`, async ({ signal, isFresh }) => {
    await api.remove(plan.id, { signal });
    if (!isFresh()) return;
    publishPlans(plans.filter((item) => item.id !== plan.id));
  });

  return <section className={`rounded-xl border border-[var(--colors-hairline-strong)] bg-[var(--colors-surface-1)] p-4 ${className}`} aria-labelledby="installation-plan-title">
    <header className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[var(--colors-primary)]">Installation plans</p>
        <h2 id="installation-plan-title" className="mt-1 text-lg font-bold">설치 계획</h2>
        <p className="mt-1 text-xs text-[var(--colors-ink-subtle)]">옥상 로컬 좌표를 유지하며 건물별 대안을 관리합니다.</p>
      </div>
      <button type="button" className={`${buttonClass} bg-[var(--colors-primary)] text-white`} onClick={create} disabled={!createPlanDraft || Boolean(busyAction)} aria-label="새 설치 계획" title={!createPlanDraft ? "createPlanDraft 연결이 필요합니다." : undefined}><Plus size={15} /> 새 계획</button>
    </header>

    {state.status === "loading" && <p role="status" className="mt-4 text-xs text-[var(--colors-ink-muted)]">{state.message}</p>}
    {state.status === "error" && <div role="alert" className="mt-4 rounded-md border border-red-400/50 bg-red-950/40 p-3 text-xs text-red-100"><p>{state.message}</p><button type="button" onClick={load} className={`${buttonClass} mt-2`}>다시 시도</button></div>}
    {state.status === "ready" && plans.length === 0 && <p className="mt-4 rounded-md border border-dashed border-[var(--colors-hairline-strong)] p-4 text-center text-xs text-[var(--colors-ink-muted)]">저장된 설치 계획이 없습니다.</p>}

    <div className="mt-4 space-y-3">
      {plans.map((plan) => {
        const representative = representativeId === plan.id;
        const displayName = names[plan.id] || plan.name;
        return <article key={plan.id} className="rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-3">
          <div className="flex items-center justify-between gap-2">
            <label className="min-w-0 flex-1 text-[11px] font-bold text-[var(--colors-ink-subtle)]">
              <span className="sr-only">{plan.name} 계획 이름</span>
              <input aria-label={`${plan.name} 계획 이름`} value={names[plan.id] ?? plan.name} onChange={(event) => setNames((current) => ({ ...current, [plan.id]: event.target.value }))} className="h-10 w-full rounded-md border border-[var(--colors-hairline-strong)] bg-[var(--colors-surface-1)] px-3 text-sm font-bold text-[var(--colors-ink)]" />
            </label>
            {representative && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--colors-primary)_18%,transparent)] px-2 py-1 text-[10px] font-extrabold text-[var(--colors-primary-hover)]"><Star size={12} fill="currentColor" /> 대표 계획</span>}
          </div>
          <p className="mt-2 text-[11px] text-[var(--colors-ink-subtle)]">배열 {plan.arrays.length}개 · {plan.id}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <button type="button" className={buttonClass} onClick={() => onEditPlan(plan)} aria-label={`${displayName} 편집`}><Edit3 size={14} /> 편집</button>
            <button type="button" className={buttonClass} onClick={() => rename(plan)} disabled={!displayName.trim() || displayName === plan.name || Boolean(busyAction)} aria-label={`${plan.name} 이름 저장`}><Save size={14} /> 이름 저장</button>
            <button type="button" className={buttonClass} onClick={() => copy(plan)} disabled={Boolean(busyAction)} aria-label={`${displayName} 복사`}><Copy size={14} /> 복사</button>
            <button type="button" className={buttonClass} onClick={() => representative ? clearRepresentative(plan) : makeRepresentative(plan)} disabled={Boolean(busyAction)} aria-label={`${displayName} ${representative ? "대표 해제" : "대표로 지정"}`}><Star size={14} fill={representative ? "currentColor" : "none"} /> {representative ? "대표 해제" : "대표 지정"}</button>
            <button type="button" className={buttonClass} onClick={() => remove(plan)} disabled={representative || Boolean(busyAction)} aria-label={`${displayName} 삭제`} title={representative ? "대표 계획은 다른 계획을 대표로 지정한 뒤 삭제할 수 있습니다." : undefined}><Trash2 size={14} /> 삭제</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
