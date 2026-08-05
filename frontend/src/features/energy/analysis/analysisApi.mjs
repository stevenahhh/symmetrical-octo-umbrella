import { analysisScenarioInput, parseAnalysisRun, parseAnalysisScenario } from "./analysisContracts.mjs";

export class AnalysisApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "AnalysisApiError";
    this.code = code;
    this.status = status;
  }
}

async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.detail;
    throw new AnalysisApiError(detail?.code ?? "analysis_api_error", detail?.message_ko ?? detail?.message_en ?? `분석 API 요청 실패 (HTTP ${response.status})`, response.status);
  }
  return body;
}

export function createBuildingAnalysisClient(apiBase = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000", fetchImpl = fetch) {
  const request = (path, options = {}) => fetchImpl(`${apiBase}${path}`, { headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) }, ...options }).then(json);
  return {
    createScenario(input, signal) {
      const requestBody = analysisScenarioInput(input);
      return request("/energy/analysis-scenarios", { method: "POST", body: JSON.stringify(requestBody), signal })
        .then((value) => parseAnalysisScenario(value, { buildingId: requestBody.building_id }));
    },
    updateScenario(scenarioId, input, signal) {
      const requestBody = analysisScenarioInput(input);
      return request(`/energy/analysis-scenarios/${encodeURIComponent(scenarioId)}`, { method: "PUT", body: JSON.stringify(requestBody), signal })
        .then((value) => parseAnalysisScenario(value, { buildingId: requestBody.building_id, scenarioId }));
    },
    async listScenarios(buildingId, signal) {
      const values = await request(`/energy/buildings/${encodeURIComponent(buildingId)}/analysis-scenarios`, { signal });
      if (!Array.isArray(values)) throw new AnalysisApiError("invalid_analysis_payload", "분석 정의 목록 형식이 올바르지 않습니다.", 200);
      return values.map((value) => parseAnalysisScenario(value, { buildingId }));
    },
    runScenario(scenarioId, date, signal, expectedConditions) {
      return request(`/energy/analysis-scenarios/${encodeURIComponent(scenarioId)}/runs`, { method: "POST", body: JSON.stringify({ date }), signal })
        .then((value) => parseAnalysisRun(value, { scenarioId, date, conditions: expectedConditions }));
    },
    getRun(runId, signal) {
      return request(`/energy/analysis-runs/${encodeURIComponent(runId)}`, { signal })
        .then((value) => parseAnalysisRun(value, { runId }));
    },
    async listRuns(buildingId, signal) {
      const values = await request(`/energy/buildings/${encodeURIComponent(buildingId)}/analysis-runs`, { signal });
      if (!Array.isArray(values)) throw new AnalysisApiError("invalid_analysis_payload", "분석 실행 목록 형식이 올바르지 않습니다.", 200);
      return values.map((value) => parseAnalysisRun(value, { buildingId }));
    },
  };
}
