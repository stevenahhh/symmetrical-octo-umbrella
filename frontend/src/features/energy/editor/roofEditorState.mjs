import { validateRoofArrays } from "../domain/roofGeometry.mjs";

const clone = (value) => structuredClone(value);

function checkedState(state, previewArrays, previousCommitted = state.committedArrays) {
  const violations = validateRoofArrays({
    roof: state.roof,
    arrays: previewArrays,
    modules: state.modules,
    layoutRules: state.layoutRules,
  });
  if (violations.length) {
    return { ...state, previewArrays, violations, canSave: false };
  }
  return {
    ...state,
    committedArrays: clone(previewArrays),
    previewArrays: clone(previewArrays),
    undoArrays: clone(previousCommitted),
    violations: [],
    canSave: previewArrays.length > 0,
  };
}

export function createRoofEditorState(document) {
  const roof = document?.roofs?.[0];
  const scenario = document?.scenarios?.[0];
  if (!roof || !scenario || !document?.modules?.length || !document?.layoutRules) {
    throw new TypeError("옥상 편집기 데이터가 올바르지 않습니다.");
  }
  const arrays = clone(scenario.arrays);
  return {
    roof: clone(roof), modules: clone(document.modules), layoutRules: clone(document.layoutRules),
    scenarioId: scenario.id, committedArrays: arrays, previewArrays: clone(arrays),
    selectedArrayId: arrays[0]?.id ?? null, undoArrays: null, violations: [], canSave: arrays.length > 0,
  };
}

export function replaceScenarioArrays(state, scenario) {
  const arrays = clone(scenario.arrays);
  return { ...state, scenarioId: scenario.id, committedArrays: arrays, previewArrays: clone(arrays), selectedArrayId: arrays[0]?.id ?? null, undoArrays: null, violations: [], canSave: arrays.length > 0 };
}

export function selectArray(state, arrayId) {
  return state.previewArrays.some((item) => item.id === arrayId) ? { ...state, selectedArrayId: arrayId } : state;
}

function nextOrigin(state) {
  const candidates = [
    { xMeters: 20, yMeters: 17 }, { xMeters: 10, yMeters: 17 },
    { xMeters: 20, yMeters: 10 }, { xMeters: 10, yMeters: 34 },
  ];
  return candidates.find((origin) => {
    const candidate = makeArray(state, "candidate", origin);
    return validateRoofArrays({ roof: state.roof, arrays: [...state.committedArrays, candidate], modules: state.modules, layoutRules: state.layoutRules }).length === 0;
  }) ?? { xMeters: 15.5, yMeters: 42 };
}

function makeArray(state, id, originMeters) {
  return {
    id, scenarioId: state.scenarioId, roofId: state.roof.id, roofZoneId: state.roof.zones[0].id,
    moduleId: state.modules[0].id, originMeters, rows: 2, columns: 8,
    azimuthDeg: 180, tiltDeg: 25, orientation: "portrait",
  };
}

export function addArray(state) {
  const usedIds = new Set(state.committedArrays.map((item) => item.id));
  const prefix = `${state.roof.buildingId}-array-`;
  let suffix = 2;
  while (usedIds.has(`${prefix}${suffix}`)) suffix += 1;
  const id = `${prefix}${suffix}`;
  const arrays = [...state.committedArrays, makeArray(state, id, nextOrigin(state))];
  return { ...checkedState(state, arrays), selectedArrayId: id };
}

export function updateSelectedArray(state, changes) {
  if (!state.selectedArrayId) return state;
  const arrays = state.committedArrays.map((item) => item.id === state.selectedArrayId ? { ...item, ...changes } : item);
  return checkedState(state, arrays);
}

export function moveSelectedArray(state, originMeters) {
  return updateSelectedArray(state, { originMeters });
}

export function deleteSelectedArray(state) {
  if (!state.selectedArrayId) return state;
  const previous = state.committedArrays;
  const arrays = previous.filter((item) => item.id !== state.selectedArrayId);
  return { ...state, committedArrays: arrays, previewArrays: clone(arrays), selectedArrayId: arrays[0]?.id ?? null, undoArrays: clone(previous), violations: [], canSave: arrays.length > 0 };
}

export function undoLatestEdit(state) {
  if (!state.undoArrays) return state;
  const arrays = clone(state.undoArrays);
  return { ...state, committedArrays: arrays, previewArrays: clone(arrays), selectedArrayId: arrays[0]?.id ?? null, undoArrays: null, violations: [], canSave: arrays.length > 0 };
}

export function dismissInvalidPreview(state) {
  return { ...state, previewArrays: clone(state.committedArrays), violations: [], canSave: state.committedArrays.length > 0 };
}

export function summarizeLayout(state) {
  const moduleById = new Map(state.modules.map((item) => [item.id, item]));
  const summary = state.previewArrays.reduce((result, array) => {
    const module = moduleById.get(array.moduleId);
    const count = array.rows * array.columns;
    result.moduleCount += count;
    result.areaSquareMeters += count * module.widthMeters * module.lengthMeters;
    result.capacityKwp += count * module.nominalPowerWp / 1000;
    return result;
  }, { arrayCount: state.previewArrays.length, moduleCount: 0, areaSquareMeters: 0, capacityKwp: 0 });
  return { ...summary, areaSquareMeters: Number(summary.areaSquareMeters.toFixed(3)), capacityKwp: Number(summary.capacityKwp.toFixed(3)) };
}
