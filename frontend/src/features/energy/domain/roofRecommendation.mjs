import { GeometryInputError, projectArrayFootprint, validateRoofArrays } from "./roofGeometry.mjs";

export const RECOMMENDATION_AZIMUTHS_DEG = Object.freeze([90, 135, 180, 225, 270]);
export const RECOMMENDATION_TILTS_DEG = Object.freeze([0, 15, 25, 35, 45]);
export const RECOMMENDATION_ORIENTATIONS = Object.freeze(["portrait", "landscape"]);

function positive(value, field, integer = false) {
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new GeometryInputError(field, `must be a positive ${integer ? "integer" : "number"}`);
  }
  return value;
}
function bounds(polygonMeters) {
  if (!Array.isArray(polygonMeters) || polygonMeters.length < 3) throw new GeometryInputError("zone.polygonMeters", "must be a polygon");
  const xs = polygonMeters.map((point) => point.xMeters); const ys = polygonMeters.map((point) => point.yMeters);
  if (![...xs, ...ys].every(Number.isFinite)) throw new GeometryInputError("zone.polygonMeters", "coordinates must be finite");
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function gridValues(minimum, maximum, step) {
  if (minimum > maximum + 1e-9) return [];
  const values = [];
  for (let value = minimum; value <= maximum + 1e-9; value += step) values.push(Math.round(value * 1e9) / 1e9);
  return values;
}
function dimensionPairs(maxRows, maxColumns) {
  const pairs = [];
  for (let rows = 1; rows <= maxRows; rows += 1) {
    for (let columns = 1; columns <= maxColumns; columns += 1) pairs.push([rows, columns]);
  }
  return pairs.sort(([ra, ca], [rb, cb]) => rb * cb - ra * ca || rb - ra || cb - ca);
}
export function* generateArrayCandidates({
  scenarioId, roof, zone, module, layoutRules, gridStepMeters = 0.5, maxRows = 12, maxColumns = 24,
}) {
  if (!scenarioId || !roof?.id || !zone?.id || !module?.id) throw new GeometryInputError("candidate", "scenario, roof, zone, and module IDs are required");
  const step = positive(gridStepMeters, "gridStepMeters");
  const rowsLimit = positive(maxRows, "maxRows", true); const columnsLimit = positive(maxColumns, "maxColumns", true);
  const area = bounds(zone.polygonMeters);
  const margin = layoutRules?.roofEdgeMarginMeters;
  if (!Number.isFinite(margin) || margin < 0) throw new GeometryInputError("layoutRules.roofEdgeMarginMeters", "must be nonnegative and finite");
  for (const [rows, columns] of dimensionPairs(rowsLimit, columnsLimit)) {
    for (const azimuthDeg of RECOMMENDATION_AZIMUTHS_DEG) {
      for (const tiltDeg of RECOMMENDATION_TILTS_DEG) {
        for (const orientation of RECOMMENDATION_ORIENTATIONS) {
          const base = { id: `${scenarioId}-array-1`, scenarioId, roofId: roof.id, roofZoneId: zone.id, moduleId: module.id,
            originMeters: { xMeters: 0, yMeters: 0 }, rows, columns, azimuthDeg, tiltDeg, orientation };
          const footprint = projectArrayFootprint(base, module, layoutRules);
          const halfX = (Math.max(...footprint.map((p) => p.xMeters)) - Math.min(...footprint.map((p) => p.xMeters))) / 2;
          const halfY = (Math.max(...footprint.map((p) => p.yMeters)) - Math.min(...footprint.map((p) => p.yMeters))) / 2;
          const xs = gridValues(area.minX + margin + halfX, area.maxX - margin - halfX, step);
          const ys = gridValues(area.minY + margin + halfY, area.maxY - margin - halfY, step);
          for (const yMeters of ys) for (const xMeters of xs) yield { ...base, originMeters: { xMeters, yMeters } };
        }
      }
    }
  }
}
function preference(candidate) {
  return [candidate.rows * candidate.columns, -Math.abs(candidate.azimuthDeg - 180), -Math.abs(candidate.tiltDeg - 25),
    candidate.orientation === "portrait" ? 1 : 0, -candidate.originMeters.yMeters, -candidate.originMeters.xMeters];
}
function better(candidate, incumbent) {
  if (!incumbent) return true;
  const left = preference(candidate); const right = preference(incumbent);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}
export function recommendRoofScenario({ scenario, suggestedScenarioId, roof, zone, module, layoutRules, ...searchOptions }) {
  if (!scenario || typeof scenario !== "object" || typeof scenario.buildingId !== "string" || !suggestedScenarioId || suggestedScenarioId === scenario.id) {
    throw new GeometryInputError("suggestedScenarioId", "must identify a separate suggested scenario with a building ID");
  }
  let best = null;
  let bestModuleCount = 0;
  const options = { ...searchOptions, scenarioId: suggestedScenarioId, roof, zone, module, layoutRules };
  for (const candidate of generateArrayCandidates(options)) {
    const moduleCount = candidate.rows * candidate.columns;
    if (best && moduleCount < bestModuleCount) break;
    if (validateRoofArrays({ roof, arrays: [candidate], modules: [module], layoutRules }).length === 0 && better(candidate, best)) {
      best = candidate;
      bestModuleCount = moduleCount;
    }
  }
  return { id: suggestedScenarioId, buildingId: scenario.buildingId, arrays: best ? [best] : [] };
}
