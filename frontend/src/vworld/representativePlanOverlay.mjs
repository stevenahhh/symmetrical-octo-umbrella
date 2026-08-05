import { projectArrayFootprint } from "../features/energy/domain/roofGeometry.mjs";
import { InstallationPlanContractError } from "../features/energy/installations/installationPlanApi.mjs";

// Mirrors the campus energy boundary. Only D4 currently has a separately verified
// roof-local-to-VWorld placement; the other buildings must remain renderer-neutral.
export const CAMPUS_REPRESENTATIVE_BUILDING_IDS = Object.freeze(["C1", "D1", "D2", "D3", "D4"]);
export const VERIFIED_VWORLD_ROOF_BUILDING_IDS = Object.freeze(["D4"]);

export function hasVerifiedVWorldRoofTransform(buildingId) {
  return VERIFIED_VWORLD_ROOF_BUILDING_IDS.includes(buildingId);
}

/**
 * Converts one representative installation plan into renderer-neutral geometry.
 * Output deliberately remains roof-local meters. No longitude/latitude or elevation
 * is invented here; the integrating renderer must supply a verified roof placement.
 */
export function toRoofLocalOverlay(plan) {
  if (!plan?.id || !plan?.buildingId || !Array.isArray(plan.arrays)) {
    throw new InstallationPlanContractError("plan", "parsed installation plan required");
  }
  return {
    buildingId: plan.buildingId,
    installationPlanId: plan.id,
    name: plan.name,
    installedCapacityKwp: plan.arrays.reduce(
      (totalWp, array) => totalWp + array.rows * array.columns * array.moduleNominalPowerWp,
      0,
    ) / 1000,
    coordinateSystem: "roof-local-meters",
    readOnly: true,
    hasVerifiedWorldGeometry: hasVerifiedVWorldRoofTransform(plan.buildingId),
    arrays: plan.arrays.map((array) => ({
      id: array.id,
      roofId: array.roofId,
      roofZoneId: array.roofZoneId,
      azimuthDeg: array.azimuthDeg,
      tiltDeg: array.tiltDeg,
      footprintMeters: projectArrayFootprint(
        {
          originMeters: array.originMeters,
          rows: array.rows,
          columns: array.columns,
          azimuthDeg: array.azimuthDeg,
          tiltDeg: array.tiltDeg,
          orientation: array.orientation,
        },
        { widthMeters: array.moduleWidthMeters, lengthMeters: array.moduleLengthMeters },
        { interPanelGapMeters: array.interPanelGapMeters },
      ),
    })),
  };
}

/** Loads no fallback plan: buildings without an explicit representative are omitted. */
export async function loadRepresentativePlanOverlays({ buildingIds, client, signal }) {
  if (!Array.isArray(buildingIds)) throw new TypeError("buildingIds must be an array");
  const uniqueBuildingIds = [...new Set(buildingIds.filter((value) => typeof value === "string" && value.trim()))];
  const results = await Promise.all(uniqueBuildingIds.map(async (buildingId) => {
    const representative = await client.getRepresentative(buildingId, { signal });
    if (!representative) return null;
    if (representative.buildingId !== buildingId) {
      throw new InstallationPlanContractError("representativePlan.building_id", "requested building must match");
    }
    const plan = await client.get(representative.installationPlanId, { signal });
    if (plan.id !== representative.installationPlanId || plan.buildingId !== buildingId) {
      throw new InstallationPlanContractError("plan", "representative plan identity must match");
    }
    return toRoofLocalOverlay(plan);
  }));
  return results.filter(Boolean);
}
