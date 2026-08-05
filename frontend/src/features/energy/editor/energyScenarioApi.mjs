import { D4_ROOF_SCENARIO_FIXTURE } from "../domain/fixtures/d4RoofScenarioFixture.mjs";

export class EnergyScenarioApiError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = "EnergyScenarioApiError";
    this.code = code;
    this.status = status;
  }
}

function fromApiArray(array) {
  return {
    id: array.id, scenarioId: array.scenario_id, roofId: array.roof_id, roofZoneId: array.roof_zone_id,
    moduleId: array.module_id, originMeters: { xMeters: array.origin_x_m, yMeters: array.origin_y_m },
    rows: array.rows, columns: array.columns, azimuthDeg: array.azimuth_deg,
    tiltDeg: array.tilt_deg, orientation: array.orientation,
  };
}

function fromApiScenario(value) {
  return { id: value.id, buildingId: value.building_id, arrays: value.arrays.map(fromApiArray) };
}

function apiArray(array, module) {
  return {
    id: array.id, scenario_id: array.scenarioId, roof_id: array.roofId, roof_zone_id: array.roofZoneId,
    module_id: array.moduleId, origin_x_m: array.originMeters.xMeters, origin_y_m: array.originMeters.yMeters,
    rows: array.rows, columns: array.columns, azimuth_deg: array.azimuthDeg, tilt_deg: array.tiltDeg,
    orientation: array.orientation, module_width_m: module.widthMeters, module_length_m: module.lengthMeters,
    module_efficiency_percent: module.efficiencyPercent, module_nominal_power_wp: module.nominalPowerWp,
    inter_panel_gap_m: 0.02,
  };
}

export function toScenarioPayload(arrays, module) {
  return { valid: true, arrays: arrays.map((array) => apiArray(array, module)) };
}

async function responseJson(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.detail?.message_ko ?? "에너지 시나리오 API 요청에 실패했습니다.";
    throw new EnergyScenarioApiError("ENERGY_API_ERROR", message, response.status);
  }
  return body;
}

function assertScenarioIdentity(scenario, scenarioId, buildingId, code = "INVALID_SCENARIO_CONTRACT") {
  if (scenario.id !== scenarioId || (buildingId !== undefined && scenario.buildingId !== buildingId)) {
    throw new EnergyScenarioApiError(code, "요청한 에너지 시나리오와 응답의 식별자가 일치하지 않습니다.");
  }
  return scenario;
}

export async function loadEnergyScenario(apiBase, scenarioId, fetchImpl = fetch, { signal, buildingId } = {}) {
  const response = await fetchImpl(`${apiBase}/energy/scenarios/${encodeURIComponent(scenarioId)}`, { signal });
  return assertScenarioIdentity(fromApiScenario(await responseJson(response)), scenarioId, buildingId);
}

function editorRoof(roof, buildingId) {
  return {
    id: roof.id,
    buildingId,
    zones: roof.zones.map((zone) => ({
      id: zone.id,
      polygonMeters: zone.polygon_meters.map((point) => ({ xMeters: point.x_meters, yMeters: point.y_meters })),
    })),
    obstacles: roof.obstacles.map((obstacle) => ({
      id: obstacle.id,
      roofZoneId: obstacle.roof_zone_id,
      polygonMeters: obstacle.polygon_meters.map((point) => ({ xMeters: point.x_meters, yMeters: point.y_meters })),
    })),
  };
}

export async function loadEnergyEditorDocument(apiBase, buildingId, scenarioId, fetchImpl = fetch, { signal } = {}) {
  const [buildingResponse, scenarioResponse] = await Promise.all([
    fetchImpl(`${apiBase}/energy/buildings/${encodeURIComponent(buildingId)}`, { signal }),
    fetchImpl(`${apiBase}/energy/scenarios/${encodeURIComponent(scenarioId)}`, { signal }),
  ]);
  const building = await responseJson(buildingResponse);
  const scenario = fromApiScenario(await responseJson(scenarioResponse));
  if (building.id !== buildingId || !building.roofs?.length) {
    throw new EnergyScenarioApiError("INVALID_EDITOR_CONTRACT", "건물 옥상 데이터를 불러올 수 없습니다.");
  }
  assertScenarioIdentity(scenario, scenarioId, buildingId, "INVALID_EDITOR_CONTRACT");
  return {
    schemaVersion: D4_ROOF_SCENARIO_FIXTURE.schemaVersion,
    coordinateSystem: D4_ROOF_SCENARIO_FIXTURE.coordinateSystem,
    layoutRules: structuredClone(D4_ROOF_SCENARIO_FIXTURE.layoutRules),
    modules: structuredClone(D4_ROOF_SCENARIO_FIXTURE.modules),
    roofs: building.roofs.map((roof) => editorRoof(roof, buildingId)),
    scenarios: [scenario],
  };
}

export async function saveEnergyScenario(apiBase, scenarioId, payload, fetchImpl = fetch, options = {}) {
  if (!payload?.valid || !payload.arrays?.length) {
    throw new EnergyScenarioApiError("INVALID_LAYOUT", "유효한 배열만 저장할 수 있습니다.");
  }
  const body = {
    building_id: options.buildingId ?? "D4", name: options.name ?? `${options.buildingId ?? "D4"} roof installation`, weather_preset: options.weatherPreset ?? "clear",
    arrays: payload.arrays.map(({ scenario_id: _scenarioId, ...array }) => array),
  };
  const response = await fetchImpl(`${apiBase}/energy/scenarios/${encodeURIComponent(scenarioId)}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: options.signal,
  });
  return assertScenarioIdentity(fromApiScenario(await responseJson(response)), scenarioId, body.building_id);
}
