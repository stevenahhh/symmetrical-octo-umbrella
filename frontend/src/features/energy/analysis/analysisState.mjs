export const DEFAULT_ANALYSIS_CONDITIONS = Object.freeze({
  weatherPreset: "clear",
  electricityPriceKrwPerKwh: 160,
  carbonIntensityKgCo2ePerKwh: 0.45,
});

export function createDraft({ buildingId, plans = [], representativePlanId, date }) {
  const markedRepresentative = plans.find((item) => item.isRepresentative || item.is_representative)?.id;
  const preferred = representativePlanId ?? markedRepresentative;
  const representative = plans.some((item) => item.id === preferred) ? preferred : plans[0]?.id ?? "";
  return {
    buildingId,
    representativePlanId: representative,
    alternativePlanId: plans.find((item) => item.id !== representative)?.id ?? null,
    baseline: "no_solar",
    date,
    conditions: { ...DEFAULT_ANALYSIS_CONDITIONS },
  };
}

export function createAnalysisState(options) {
  return { status: "idle", requestId: 0, report: null, runs: [], scenarioId: null, error: null, dirty: false, draft: createDraft(options) };
}

export function analysisReducer(state, action) {
  if (action.type === "context") {
    const buildingChanged = action.buildingId !== state.draft.buildingId;
    const draft = createDraft({
      buildingId: action.buildingId,
      plans: action.plans,
      representativePlanId: action.representativePlanId,
      date: state.draft.date,
    });
    return {
      ...state,
      requestId: action.requestId,
      status: buildingChanged ? "idle" : state.status === "loading" ? "idle" : state.status,
      report: buildingChanged ? null : state.report,
      runs: buildingChanged ? [] : state.runs,
      scenarioId: buildingChanged ? null : state.scenarioId,
      error: null,
      draft: { ...draft, conditions: buildingChanged ? { ...DEFAULT_ANALYSIS_CONDITIONS } : state.draft.conditions },
      dirty: buildingChanged ? false : Boolean(state.report) || state.dirty,
    };
  }
  if (action.type === "request") return { ...state, requestId: action.requestId, status: "loading", error: null };
  if (action.type === "draft") {
    let draft = action.condition
      ? { ...state.draft, conditions: { ...state.draft.conditions, [action.field]: action.value } }
      : { ...state.draft, [action.field]: action.value };
    if (action.field === "representativePlanId" && draft.alternativePlanId === action.value) {
      draft = { ...draft, alternativePlanId: state.draft.representativePlanId || null };
    }
    return { ...state, draft, dirty: Boolean(state.report) || state.dirty };
  }
  if (action.requestId !== undefined && action.requestId !== state.requestId) return state;
  if (action.type === "loaded") {
    const runs = [...action.runs].sort((first, second) =>
      Date.parse(second.createdAt) - Date.parse(first.createdAt) || second.id.localeCompare(first.id));
    const latest = state.report ?? runs[0] ?? null;
    const stored = action.scenarios[0]?.conditions;
    const savedConditions = stored ? {
      weatherPreset: stored.weatherPreset ?? stored.weather_preset,
      electricityPriceKrwPerKwh: stored.electricityPriceKrwPerKwh
        ?? stored.electricity_price_krw_per_kwh,
      carbonIntensityKgCo2ePerKwh: stored.carbonIntensityKgCo2ePerKwh
        ?? stored.carbon_intensity_kg_co2e_per_kwh,
    } : null;
    return {
      ...state,
      status: latest ? "success" : "idle",
      report: latest,
      runs,
      scenarioId: action.scenarios[0]?.id ?? null,
      draft: savedConditions
        ? { ...state.draft, conditions: { ...state.draft.conditions, ...savedConditions } }
        : state.draft,
      error: action.error ?? null,
      dirty: false,
    };
  }
  if (action.type === "report") {
    const createdIds = new Set([action.report.id]);
    return { ...state, status: "success", report: action.report, scenarioId: action.scenarioId, runs: [action.report, ...state.runs.filter((item) => !createdIds.has(item.id))], error: null, dirty: false };
  }
  if (action.type === "failure") return { ...state, status: "error", error: action.error };
  return state;
}
