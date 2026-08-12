const KIND_DEFAULTS = {
  vehicle_lane: ["car"],
  sidewalk: ["person"],
  scooter_lane: ["scooter"],
  shared_path: ["person", "scooter"],
  crosswalk: ["person", "scooter"],
  building_entrance: ["person"],
  parking_connection: ["car"],
  scooter_parking_connection: ["scooter"],
};

function initialState() {
  return {
    enabled: false,
    showNetwork: false,
    mode: "idle",
    kind: "sidewalk",
    geometryMode: "centerline",
    width: 3,
    direction: "bidirectional",
    speedLimit: null,
    source: "GLB-digitized",
    confidence: 0.8,
    points: [],
    selectedPoint: null,
    loadedFeatures: [],
  };
}

export function createRouteEditorStore() {
  let state = initialState();
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener());
  const update = (change) => { state = { ...state, ...change }; emit(); };
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setEnabled(enabled) { update({ enabled: Boolean(enabled), mode: enabled ? state.mode : "idle", selectedPoint: null }); },
    setShowNetwork(showNetwork) { update({ showNetwork: Boolean(showNetwork) }); },
    setMetadata(change) {
      const next = { ...change };
      if (change.kind && KIND_DEFAULTS[change.kind]) next.allowedTypes = KIND_DEFAULTS[change.kind];
      update(next);
    },
    create() { update({ mode: "creating", points: [], selectedPoint: null }); },
    addPoint(point) {
      if (state.mode === "moving" && state.selectedPoint != null) {
        const points = state.points.map((value, index) => index === state.selectedPoint ? point : value);
        update({ points, mode: "editing", selectedPoint: null });
      } else if (state.mode === "creating" || state.mode === "editing") {
        update({ points: [...state.points, point] });
      }
    },
    selectPoint(index) { update({ selectedPoint: index }); },
    moveSelected() { if (state.selectedPoint != null) update({ mode: "moving" }); },
    deleteSelected() {
      if (state.selectedPoint == null) return;
      update({ points: state.points.filter((_, index) => index !== state.selectedPoint), selectedPoint: null });
    },
    finish() { if (state.points.length >= 2) update({ mode: "finished", selectedPoint: null }); },
    edit() { if (state.points.length) update({ mode: "editing" }); },
    cancel() { update({ mode: "idle", points: [], selectedPoint: null }); },
    loadFeatures(features) { update({ loadedFeatures: Array.isArray(features) ? features : [] }); },
    loadFeature(feature) {
      if (!feature?.geometry || !["LineString", "Polygon"].includes(feature.geometry.type)) return false;
      const coordinates = feature.geometry.type === "Polygon" ? feature.geometry.coordinates[0].slice(0, -1) : feature.geometry.coordinates;
      const props = feature.properties || {};
      update({
        mode: "editing", kind: props.kind || "sidewalk",
        geometryMode: feature.geometry.type === "Polygon" ? "polygon" : "centerline",
        width: props.width ?? 3, direction: props.direction || (props.bidirectional === false ? "forward" : "bidirectional"),
        speedLimit: props.speed_limit ?? null, source: props.source || "GLB-digitized",
        confidence: props.confidence ?? 0.8,
        allowedTypes: props.allowed_types || KIND_DEFAULTS[props.kind] || ["person"],
        points: coordinates.map((point) => ({ x: Number(point[0]), y: 0, z: Number(point[1]) })),
        selectedPoint: null,
      });
      return true;
    },
    toFeature() {
      if (state.points.length < 2) throw new Error("경로에는 최소 2개 Point가 필요합니다.");
      const id = `${state.kind.toUpperCase()}_${Date.now()}`;
      let coordinates = state.points.map((point) => [point.x, point.z]);
      let geometryType = "LineString";
      if (state.kind === "crosswalk" && state.geometryMode === "polygon") {
        if (coordinates.length < 3) throw new Error("횡단보도 Polygon에는 최소 3개 Point가 필요합니다.");
        coordinates = [[...coordinates, coordinates[0]]];
        geometryType = "Polygon";
      }
      return {
        type: "Feature", id,
        properties: {
          id, feature_type: "edge", kind: state.kind,
          allowed_types: state.allowedTypes || KIND_DEFAULTS[state.kind],
          bidirectional: state.direction === "bidirectional",
          direction: state.direction, speed_limit: state.speedLimit,
          width: state.kind === "crosswalk" ? Number(state.width) : null,
          source_id: id, source: state.source, confidence: Number(state.confidence),
          derived: false, authoritative: false,
          review_status: "draft_requires_topology_and_coordinate_validation",
        },
        geometry: { type: geometryType, coordinates },
      };
    },
  };
}

export { KIND_DEFAULTS };
