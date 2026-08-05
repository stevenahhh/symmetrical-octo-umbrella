export class InstallationPlanContractError extends TypeError {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.name = "InstallationPlanContractError";
    this.code = "INVALID_INSTALLATION_PLAN_CONTRACT";
    this.field = field;
  }
}

export class InstallationPlanApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "InstallationPlanApiError";
    this.code = code;
    this.status = status;
  }
}

const fail = (field, message) => { throw new InstallationPlanContractError(field, message); };
const record = (value, field) => value && typeof value === "object" && !Array.isArray(value) ? value : fail(field, "object required");
const text = (value, field) => typeof value === "string" && value.trim() ? value : fail(field, "non-empty text required");
const finite = (value, field) => typeof value === "number" && Number.isFinite(value) ? value : fail(field, "finite number required");
const integer = (value, field) => Number.isInteger(value) && value > 0 ? value : fail(field, "positive integer required");

function parseArray(value, field) {
  const input = record(value, field);
  const orientation = text(input.orientation, `${field}.orientation`);
  if (!new Set(["portrait", "landscape"]).has(orientation)) fail(`${field}.orientation`, "portrait or landscape required");
  return {
    id: text(input.id, `${field}.id`),
    planId: text(input.installation_plan_id, `${field}.installation_plan_id`),
    roofId: text(input.roof_id, `${field}.roof_id`),
    roofZoneId: text(input.roof_zone_id, `${field}.roof_zone_id`),
    moduleId: text(input.module_id, `${field}.module_id`),
    originMeters: {
      xMeters: finite(input.origin_x_m, `${field}.origin_x_m`),
      yMeters: finite(input.origin_y_m, `${field}.origin_y_m`),
    },
    rows: integer(input.rows, `${field}.rows`),
    columns: integer(input.columns, `${field}.columns`),
    azimuthDeg: finite(input.azimuth_deg, `${field}.azimuth_deg`),
    tiltDeg: finite(input.tilt_deg, `${field}.tilt_deg`),
    orientation,
    moduleWidthMeters: finite(input.module_width_m, `${field}.module_width_m`),
    moduleLengthMeters: finite(input.module_length_m, `${field}.module_length_m`),
    moduleEfficiencyPercent: finite(input.module_efficiency_percent, `${field}.module_efficiency_percent`),
    moduleNominalPowerWp: finite(input.module_nominal_power_wp, `${field}.module_nominal_power_wp`),
    interPanelGapMeters: finite(input.inter_panel_gap_m, `${field}.inter_panel_gap_m`),
  };
}

export function parseInstallationPlan(value, field = "plan") {
  const input = record(value, field);
  if (!Array.isArray(input.arrays)) fail(`${field}.arrays`, "array required");
  const plan = {
    id: text(input.id, `${field}.id`),
    buildingId: text(input.building_id, `${field}.building_id`),
    name: text(input.name, `${field}.name`),
    createdAt: text(input.created_at, `${field}.created_at`),
    updatedAt: text(input.updated_at, `${field}.updated_at`),
    arrays: input.arrays.map((item, index) => parseArray(item, `${field}.arrays[${index}]`)),
  };
  if (plan.arrays.some((item) => item.planId !== plan.id)) fail(`${field}.arrays`, "every array must reference the plan ID");
  return plan;
}

export function parseInstallationPlanSummary(value, field = "planSummary") {
  const input = record(value, field);
  if (typeof input.is_representative !== "boolean") fail(`${field}.is_representative`, "boolean required");
  return {
    id: text(input.id, `${field}.id`),
    buildingId: text(input.building_id, `${field}.building_id`),
    name: text(input.name, `${field}.name`),
    arrayCount: integer(input.array_count, `${field}.array_count`),
    updatedAt: text(input.updated_at, `${field}.updated_at`),
    isRepresentative: input.is_representative,
  };
}

export function parseRepresentativePlan(value, field = "representativePlan") {
  const input = record(value, field);
  return {
    buildingId: text(input.building_id, `${field}.building_id`),
    installationPlanId: text(input.installation_plan_id, `${field}.installation_plan_id`),
    selectedAt: input.selected_at == null ? null : text(input.selected_at, `${field}.selected_at`),
  };
}

function apiArray(array) {
  const input = record(array, "array");
  return {
    id: text(input.id, "array.id"),
    roof_id: text(input.roofId, "array.roofId"),
    roof_zone_id: text(input.roofZoneId, "array.roofZoneId"),
    module_id: text(input.moduleId, "array.moduleId"),
    origin_x_m: finite(input.originMeters?.xMeters, "array.originMeters.xMeters"),
    origin_y_m: finite(input.originMeters?.yMeters, "array.originMeters.yMeters"),
    rows: integer(input.rows, "array.rows"), columns: integer(input.columns, "array.columns"),
    azimuth_deg: finite(input.azimuthDeg, "array.azimuthDeg"), tilt_deg: finite(input.tiltDeg, "array.tiltDeg"),
    orientation: text(input.orientation, "array.orientation"),
    module_width_m: finite(input.moduleWidthMeters, "array.moduleWidthMeters"),
    module_length_m: finite(input.moduleLengthMeters, "array.moduleLengthMeters"),
    module_efficiency_percent: finite(input.moduleEfficiencyPercent, "array.moduleEfficiencyPercent"),
    module_nominal_power_wp: finite(input.moduleNominalPowerWp, "array.moduleNominalPowerWp"),
    inter_panel_gap_m: finite(input.interPanelGapMeters, "array.interPanelGapMeters"),
  };
}

export function createPlanDraftFromExisting({ buildingId, plans, representativePlanId }) {
  if (!Array.isArray(plans)) fail("plans", "array required");
  const source = plans.find((plan) => plan.id === representativePlanId) ?? plans[0];
  if (!source) fail("plans", "an existing installation plan is required as a template");
  if (source.buildingId !== buildingId) fail("plans", "template building must match");
  if (!Array.isArray(source.arrays) || !source.arrays.length) fail("plans", "template must contain at least one roof-local array");
  return { name: `${buildingId} 새 설치안`, arrays: source.arrays };
}

export function toInstallationPlanInput({ buildingId, name, arrays }) {
  if (!Array.isArray(arrays) || !arrays.length) fail("plan.arrays", "at least one roof-local array required");
  return {
    building_id: text(buildingId, "plan.buildingId"),
    name: text(name, "plan.name"),
    arrays: arrays.map(apiArray),
  };
}

async function body(response) {
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function checked(response, options = {}) {
  const value = await body(response);
  if (!response.ok) {
    const detail = value?.detail;
    if (response.status === 404 && detail?.code === options.nullOn404Code) return null;
    throw new InstallationPlanApiError(
      detail?.code ?? "INSTALLATION_PLAN_API_ERROR",
      detail?.message_ko ?? detail?.message_en ?? `설치 계획 API 요청에 실패했습니다. (HTTP ${response.status})`,
      response.status,
    );
  }
  return options.parse ? options.parse(value) : value;
}

export function createInstallationPlanClient(apiBase = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000", fetchImpl = fetch) {
  const jsonHeaders = { Accept: "application/json", "Content-Type": "application/json" };
  const planPath = (id) => `${apiBase}/energy/installation-plans/${encodeURIComponent(id)}`;
  const representativePath = (buildingId) => `${apiBase}/energy/buildings/${encodeURIComponent(buildingId)}/representative-installation-plan`;
  return {
    async list(buildingId, { signal } = {}) {
      const response = await fetchImpl(`${apiBase}/energy/buildings/${encodeURIComponent(buildingId)}/installation-plans`, { headers: { Accept: "application/json" }, signal });
      return checked(response, { parse: (value) => {
        if (!Array.isArray(value)) fail("plans", "array required");
        return value.map((item, index) => parseInstallationPlanSummary(item, `plans[${index}]`));
      } });
    },
    async listDetails(buildingId, options = {}) {
      const summaries = await this.list(buildingId, options);
      if (summaries.some((summary) => summary.buildingId !== buildingId)) {
        fail("plans", "every listed plan must match the requested building");
      }
      const details = await Promise.all(summaries.map((summary) => this.get(summary.id, options)));
      details.forEach((detail, index) => {
        if (detail.id !== summaries[index].id || detail.buildingId !== buildingId) {
          fail(`plans[${index}]`, "listed and detailed plan identities must match the requested building");
        }
      });
      return details;
    },
    async get(installationPlanId, { signal } = {}) {
      return checked(await fetchImpl(planPath(installationPlanId), { headers: { Accept: "application/json" }, signal }), { parse: (value) => {
        const plan = parseInstallationPlan(value);
        if (plan.id !== installationPlanId) fail("plan.id", "loaded plan must match the requested plan ID");
        return plan;
      } });
    },
    async create(input, { signal } = {}) {
      const requestBody = toInstallationPlanInput(input);
      return checked(await fetchImpl(`${apiBase}/energy/installation-plans`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(requestBody), signal }), { parse: (value) => {
        const plan = parseInstallationPlan(value);
        if (plan.buildingId !== requestBody.building_id) fail("plan.building_id", "created plan must match the requested building");
        return plan;
      } });
    },
    async update(installationPlanId, input, { signal } = {}) {
      const requestBody = toInstallationPlanInput(input);
      return checked(await fetchImpl(planPath(installationPlanId), { method: "PUT", headers: jsonHeaders, body: JSON.stringify(requestBody), signal }), { parse: (value) => {
        const plan = parseInstallationPlan(value);
        if (plan.buildingId !== requestBody.building_id) fail("plan.building_id", "updated plan must match the requested building");
        if (plan.id !== installationPlanId) fail("plan.id", "updated plan must match the requested plan ID");
        return plan;
      } });
    },
    async copy(plan, name = `${plan.name} 복사본`, options = {}) {
      return this.create({ buildingId: plan.buildingId, name, arrays: plan.arrays }, options);
    },
    async remove(installationPlanId, { signal } = {}) {
      await checked(await fetchImpl(planPath(installationPlanId), { method: "DELETE", headers: { Accept: "application/json" }, signal }));
    },
    async getRepresentative(buildingId, { signal } = {}) {
      return checked(
        await fetchImpl(representativePath(buildingId), { headers: { Accept: "application/json" }, signal }),
        { parse: (value) => {
          const representative = parseRepresentativePlan(value);
          if (representative.buildingId !== buildingId) fail("representativePlan.building_id", "loaded representative must match the requested building");
          return representative;
        }, nullOn404Code: "representative_installation_plan_not_found" },
      );
    },
    async setRepresentative(buildingId, installationPlanId, { signal } = {}) {
      const requestedPlanId = text(installationPlanId, "installationPlanId");
      return checked(await fetchImpl(representativePath(buildingId), { method: "PUT", headers: jsonHeaders, body: JSON.stringify({ installation_plan_id: requestedPlanId }), signal }), { parse: (value) => {
        const representative = parseRepresentativePlan(value);
        if (representative.buildingId !== buildingId) fail("representativePlan.building_id", "updated representative must match the requested building");
        if (representative.installationPlanId !== requestedPlanId) fail("representativePlan.installation_plan_id", "updated representative must match the requested plan");
        return representative;
      } });
    },
    async unsetRepresentative(buildingId, { signal } = {}) {
      await checked(await fetchImpl(representativePath(buildingId), { method: "DELETE", headers: { Accept: "application/json" }, signal }));
    },
  };
}
