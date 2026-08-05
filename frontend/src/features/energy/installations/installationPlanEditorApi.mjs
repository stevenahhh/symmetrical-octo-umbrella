import { D4_ROOF_SCENARIO_FIXTURE } from "../domain/fixtures/d4RoofScenarioFixture.mjs";
import { InstallationPlanApiError, InstallationPlanContractError } from "./installationPlanApi.mjs";

const editorArray = (array) => ({
  id: array.id,
  scenarioId: array.planId,
  roofId: array.roofId,
  roofZoneId: array.roofZoneId,
  moduleId: array.moduleId,
  originMeters: { ...array.originMeters },
  rows: array.rows,
  columns: array.columns,
  azimuthDeg: array.azimuthDeg,
  tiltDeg: array.tiltDeg,
  orientation: array.orientation,
});

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

function modulesFromPlan(plan) {
  const modules = new Map();
  for (const array of plan.arrays) {
    if (!modules.has(array.moduleId)) modules.set(array.moduleId, {
      id: array.moduleId,
      widthMeters: array.moduleWidthMeters,
      lengthMeters: array.moduleLengthMeters,
      efficiencyPercent: array.moduleEfficiencyPercent,
      nominalPowerWp: array.moduleNominalPowerWp,
    });
  }
  return [...modules.values()];
}

export async function loadInstallationPlanEditorDocument({ apiBase, buildingId, installationPlanId, client, fetchImpl = fetch, signal }) {
  const [buildingResponse, plan] = await Promise.all([
    fetchImpl(`${apiBase}/energy/buildings/${encodeURIComponent(buildingId)}`, { headers: { Accept: "application/json" }, signal }),
    client.get(installationPlanId, { signal }),
  ]);
  const building = await buildingResponse.json().catch(() => null);
  if (!buildingResponse.ok) {
    const detail = building?.detail;
    throw new InstallationPlanApiError(detail?.code ?? "INSTALLATION_PLAN_BUILDING_ERROR", detail?.message_ko ?? "건물 옥상 데이터를 불러올 수 없습니다.", buildingResponse.status);
  }
  if (building?.id !== buildingId || plan.buildingId !== buildingId || plan.id !== installationPlanId || !building.roofs?.length) {
    throw new InstallationPlanContractError("editor", "building, roof, and installation plan identities must match");
  }
  const modules = modulesFromPlan(plan);
  if (!modules.length) throw new InstallationPlanContractError("plan.arrays", "at least one array is required for editing");
  return {
    plan,
    document: {
      schemaVersion: 1,
      coordinateSystem: "roof-local-meters",
      layoutRules: {
        ...structuredClone(D4_ROOF_SCENARIO_FIXTURE.layoutRules),
        interPanelGapMeters: plan.arrays[0].interPanelGapMeters,
      },
      modules,
      roofs: building.roofs.map((roof) => editorRoof(roof, buildingId)),
      scenarios: [{ id: plan.id, buildingId: plan.buildingId, arrays: plan.arrays.map(editorArray) }],
    },
  };
}

export async function saveInstallationPlanEditor({ client, installationPlanId, buildingId, name, arrays, modules, interPanelGapMeters, signal }) {
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const planArrays = arrays.map((array) => {
    const module = moduleById.get(array.moduleId);
    if (!module) throw new InstallationPlanContractError("array.moduleId", "known editor module required");
    return {
      id: array.id,
      planId: installationPlanId,
      roofId: array.roofId,
      roofZoneId: array.roofZoneId,
      moduleId: array.moduleId,
      originMeters: { ...array.originMeters },
      rows: array.rows,
      columns: array.columns,
      azimuthDeg: array.azimuthDeg,
      tiltDeg: array.tiltDeg,
      orientation: array.orientation,
      moduleWidthMeters: module.widthMeters,
      moduleLengthMeters: module.lengthMeters,
      moduleEfficiencyPercent: module.efficiencyPercent,
      moduleNominalPowerWp: module.nominalPowerWp,
      interPanelGapMeters,
    };
  });
  const plan = await client.update(installationPlanId, { buildingId, name, arrays: planArrays }, { signal });
  return { id: plan.id, buildingId: plan.buildingId, arrays: plan.arrays.map(editorArray) };
}
