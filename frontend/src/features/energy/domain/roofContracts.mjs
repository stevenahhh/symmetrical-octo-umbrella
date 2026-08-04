export const DEFAULT_PANEL_MODULE = Object.freeze({
  id: "module-default-441wp",
  widthMeters: 1.05,
  lengthMeters: 2.1,
  efficiencyPercent: 20,
  nominalPowerWp: 441,
});

export const DEFAULT_LAYOUT_RULES = Object.freeze({
  interPanelGapMeters: 0.02,
  roofEdgeMarginMeters: 0.5,
  obstacleClearanceMeters: 1,
});

export const ROOF_LAYOUT_SCHEMA = Object.freeze({
  coordinateSystem: {
    value: "roof-local-meters",
    description: "Cartesian x/y coordinates in meters relative to a roof-local origin.",
  },
  roofZone: { polygonMeters: "Ordered polygon vertices in roof-local meters." },
  roofObstacle: { polygonMeters: "Ordered polygon vertices in roof-local meters." },
  panelModule: {
    widthMeters: "Module width in meters.",
    lengthMeters: "Module length in meters.",
    efficiencyPercent: "Conversion efficiency in percent.",
    nominalPowerWp: "Derived nominal power in watts-peak.",
  },
  panelArray: {
    originMeters: "Array origin in roof-local meters.",
    azimuthDeg: "Clockwise azimuth in degrees, in [0, 360).",
    tiltDeg: "Tilt in degrees, in [0, 45].",
  },
});

export class ContractParseError extends TypeError {
  constructor(field, code, message) {
    super(`${field}: ${message}`);
    this.name = "ContractParseError";
    this.errors = [{ field, code, message }];
  }
}

const fail = (field, code, message) => {
  throw new ContractParseError(field, code, message);
};

function object(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(field, "object", "must be an object");
  }
  return value;
}

function keys(value, allowed, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${field}.${key}`, "unknown_field", "is not part of this contract");
  }
}

function id(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(field, "non_empty_string", "must be a non-empty string");
  }
  return value;
}

function finite(value, field) {
  if (!Number.isFinite(value)) fail(field, "finite_number", "must be a finite number");
  return value;
}

function nonnegative(value, field) {
  const number = finite(value, field);
  if (number < 0) fail(field, "nonnegative_number", "must be zero or greater");
  return number;
}

function positive(value, field) {
  const number = finite(value, field);
  if (number <= 0) fail(field, "positive_number", "must be greater than zero");
  return number;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    fail(field, "positive_integer", "must be an integer of at least 1");
  }
  return value;
}

function list(value, field, parser) {
  if (!Array.isArray(value)) fail(field, "array", "must be an array");
  return value.map((item, index) => parser(item, `${field}[${index}]`));
}

function point(value, field) {
  const input = object(value, field);
  keys(input, ["xMeters", "yMeters"], field);
  return {
    xMeters: finite(input.xMeters, `${field}.xMeters`),
    yMeters: finite(input.yMeters, `${field}.yMeters`),
  };
}

function polygon(value, field) {
  const parsed = list(value, field, point);
  if (parsed.length < 3) fail(field, "polygon", "must contain at least three vertices");
  return parsed;
}

function unique(items, field) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (seen.has(item.id)) fail(`${field}[${index}].id`, "duplicate_id", `duplicates ${item.id}`);
    seen.add(item.id);
  });
}

function panelModule(value, field) {
  const input = object(value, field);
  keys(input, ["id", "widthMeters", "lengthMeters", "efficiencyPercent", "nominalPowerWp"], field);
  const parsed = {
    id: id(input.id, `${field}.id`),
    widthMeters: positive(input.widthMeters, `${field}.widthMeters`),
    lengthMeters: positive(input.lengthMeters, `${field}.lengthMeters`),
    efficiencyPercent: finite(input.efficiencyPercent, `${field}.efficiencyPercent`),
    nominalPowerWp: positive(input.nominalPowerWp, `${field}.nominalPowerWp`),
  };
  if (parsed.efficiencyPercent <= 0 || parsed.efficiencyPercent > 100) {
    fail(`${field}.efficiencyPercent`, "range", "must be greater than 0 and at most 100");
  }
  const derived = parsed.widthMeters * parsed.lengthMeters * parsed.efficiencyPercent * 10;
  if (Math.abs(parsed.nominalPowerWp - derived) > 1e-9) {
    fail(`${field}.nominalPowerWp`, "derived_value_mismatch", `must equal derived power ${derived} Wp`);
  }
  return parsed;
}

function zone(value, field) {
  const input = object(value, field);
  keys(input, ["id", "polygonMeters"], field);
  return { id: id(input.id, `${field}.id`), polygonMeters: polygon(input.polygonMeters, `${field}.polygonMeters`) };
}

function obstacle(value, field) {
  const input = object(value, field);
  keys(input, ["id", "roofZoneId", "polygonMeters"], field);
  return {
    id: id(input.id, `${field}.id`),
    roofZoneId: id(input.roofZoneId, `${field}.roofZoneId`),
    polygonMeters: polygon(input.polygonMeters, `${field}.polygonMeters`),
  };
}

function roof(value, field) {
  const input = object(value, field);
  keys(input, ["id", "buildingId", "zones", "obstacles"], field);
  const parsed = {
    id: id(input.id, `${field}.id`),
    buildingId: id(input.buildingId, `${field}.buildingId`),
    zones: list(input.zones, `${field}.zones`, zone),
    obstacles: list(input.obstacles, `${field}.obstacles`, obstacle),
  };
  unique(parsed.zones, `${field}.zones`);
  unique(parsed.obstacles, `${field}.obstacles`);
  const zoneIds = new Set(parsed.zones.map((item) => item.id));
  parsed.obstacles.forEach((item, index) => {
    if (!zoneIds.has(item.roofZoneId)) {
      fail(`${field}.obstacles[${index}].roofZoneId`, "unknown_reference", "must identify a zone on this roof");
    }
  });
  return parsed;
}

function panelArray(value, field) {
  const input = object(value, field);
  keys(input, ["id", "scenarioId", "roofId", "roofZoneId", "moduleId", "originMeters", "rows", "columns", "azimuthDeg", "tiltDeg", "orientation"], field);
  const azimuthDeg = finite(input.azimuthDeg, `${field}.azimuthDeg`);
  const tiltDeg = finite(input.tiltDeg, `${field}.tiltDeg`);
  if (azimuthDeg < 0 || azimuthDeg >= 360) fail(`${field}.azimuthDeg`, "range", "must be in [0, 360)");
  if (tiltDeg < 0 || tiltDeg > 45) fail(`${field}.tiltDeg`, "range", "must be in [0, 45]");
  if (!['portrait', 'landscape'].includes(input.orientation)) {
    fail(`${field}.orientation`, "enum", "must be portrait or landscape");
  }
  return {
    id: id(input.id, `${field}.id`),
    scenarioId: id(input.scenarioId, `${field}.scenarioId`),
    roofId: id(input.roofId, `${field}.roofId`),
    roofZoneId: id(input.roofZoneId, `${field}.roofZoneId`),
    moduleId: id(input.moduleId, `${field}.moduleId`),
    originMeters: point(input.originMeters, `${field}.originMeters`),
    rows: positiveInteger(input.rows, `${field}.rows`),
    columns: positiveInteger(input.columns, `${field}.columns`),
    azimuthDeg,
    tiltDeg,
    orientation: input.orientation,
  };
}

function scenario(value, field) {
  const input = object(value, field);
  keys(input, ["id", "buildingId", "arrays"], field);
  const parsed = {
    id: id(input.id, `${field}.id`),
    buildingId: id(input.buildingId, `${field}.buildingId`),
    arrays: list(input.arrays, `${field}.arrays`, panelArray),
  };
  unique(parsed.arrays, `${field}.arrays`);
  return parsed;
}

export function parseRoofLayoutDocument(value) {
  const input = object(value, "document");
  keys(input, ["schemaVersion", "coordinateSystem", "layoutRules", "modules", "roofs", "scenarios"], "document");
  if (input.schemaVersion !== 1) fail("schemaVersion", "literal", "must equal 1");
  if (input.coordinateSystem !== "roof-local-meters") {
    fail("coordinateSystem", "literal", "must equal roof-local-meters");
  }
  const rules = object(input.layoutRules, "layoutRules");
  keys(rules, ["interPanelGapMeters", "roofEdgeMarginMeters", "obstacleClearanceMeters"], "layoutRules");
  const parsed = {
    schemaVersion: 1,
    coordinateSystem: "roof-local-meters",
    layoutRules: {
      interPanelGapMeters: nonnegative(rules.interPanelGapMeters, "layoutRules.interPanelGapMeters"),
      roofEdgeMarginMeters: nonnegative(rules.roofEdgeMarginMeters, "layoutRules.roofEdgeMarginMeters"),
      obstacleClearanceMeters: nonnegative(rules.obstacleClearanceMeters, "layoutRules.obstacleClearanceMeters"),
    },
    modules: list(input.modules, "modules", panelModule),
    roofs: list(input.roofs, "roofs", roof),
    scenarios: list(input.scenarios, "scenarios", scenario),
  };
  unique(parsed.modules, "modules");
  unique(parsed.roofs, "roofs");
  unique(parsed.scenarios, "scenarios");
  const moduleIds = new Set(parsed.modules.map((item) => item.id));
  const roofById = new Map(parsed.roofs.map((item) => [item.id, item]));
  parsed.scenarios.forEach((scenarioItem, scenarioIndex) => {
    scenarioItem.arrays.forEach((array, arrayIndex) => {
      const field = `scenarios[${scenarioIndex}].arrays[${arrayIndex}]`;
      const roofItem = roofById.get(array.roofId);
      if (!roofItem) fail(`${field}.roofId`, "unknown_reference", "must identify a known roof");
      if (!roofItem.zones.some((item) => item.id === array.roofZoneId)) {
        fail(`${field}.roofZoneId`, "unknown_reference", "must identify a zone on the selected roof");
      }
      if (!moduleIds.has(array.moduleId)) {
        fail(`${field}.moduleId`, "unknown_reference", "must identify a known module");
      }
      if (array.scenarioId !== scenarioItem.id) {
        fail(`${field}.scenarioId`, "reference_mismatch", "must match its containing scenario ID");
      }
      if (roofItem.buildingId !== scenarioItem.buildingId) {
        fail(`${field}.roofId`, "reference_mismatch", "roof and scenario building IDs must match");
      }
    });
  });
  return parsed;
}

export function summarizePanelArray(array, modules) {
  const module = modules.find((item) => item.id === array.moduleId);
  if (!module) fail("array.moduleId", "unknown_reference", "must identify a known module");
  const moduleCount = array.rows * array.columns;
  return { moduleCount, capacityKwp: (moduleCount * module.nominalPowerWp) / 1000 };
}
