const EMPTY_STATS = {
  car_count: 0,
  person_count: 0,
  scooter_count: 0,
  normal_count: 0,
  caution_count: 0,
  warning_count: 0,
  danger_count: 0,
  active_agents: { car: 0, person: 0, scooter: 0 },
  completed_trips: { car: 0, person: 0, scooter: 0 },
  average_travel_time: { car: 0, person: 0, scooter: 0 },
  risk_events: { car_person: 0, car_scooter: 0, person_scooter: 0 },
  near_miss_count: 0,
  current_risks: 0,
};

function validEntity(entity) {
  return Boolean(
    entity &&
      typeof entity.id === "string" &&
      ["car", "person", "scooter"].includes(entity.type) &&
      [entity.x, entity.y ?? 0, entity.z, entity.speed ?? 0, entity.heading ?? 0].every((value) =>
        Number.isFinite(Number(value)),
      ),
  );
}

export function parseSimulationMessage(raw) {
  let payload;
  try {
    payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!payload || payload.type !== "simulation_update" || !Array.isArray(payload.entities)) return null;
  const entities = new Map();
  for (const entity of payload.entities) {
    if (validEntity(entity)) entities.set(entity.id, { ...entity });
  }
  return {
    simulationTime: Number.isFinite(Number(payload.simulation_time)) ? Number(payload.simulation_time) : 0,
    status: ["running", "paused", "stopped"].includes(payload.status) ? payload.status : "stopped",
    entities,
    riskEvents: Array.isArray(payload.risk_events) ? payload.risk_events.filter((event) => event?.event_id) : [],
    statistics: { ...EMPTY_STATS, ...(payload.statistics || {}) },
    trafficLights: Array.isArray(payload.traffic_lights) ? payload.traffic_lights : [],
    weather: payload.weather || {},
    demandProfile: payload.demand_profile || "daytime",
    timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
  };
}

export function createSimulationStore() {
  let state = {
    connectionStatus: "연결 끊김",
    lastError: null,
    simulationTime: 0,
    status: "stopped",
    entities: new Map(),
    riskEvents: [],
    statistics: { ...EMPTY_STATS },
    trafficLights: [],
    weather: {},
    demandProfile: "daytime",
    timeline: [],
    selectedAgentId: null,
    selectedAgentDetails: null,
    selectionError: null,
  };
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setConnectionStatus(connectionStatus, lastError = null) {
      state = { ...state, connectionStatus, lastError };
      emit();
    },
    applyMessage(raw) {
      const parsed = parseSimulationMessage(raw);
      if (!parsed) return false;
      const timelineRestarted =
        parsed.simulationTime < state.simulationTime ||
        (parsed.status === "stopped" && parsed.simulationTime === 0);
      const byId = new Map(
        (timelineRestarted ? [] : state.riskEvents).map((event) => [event.event_id, event]),
      );
      parsed.riskEvents.forEach((event) => byId.set(event.event_id, event));
      state = { ...state, ...parsed, riskEvents: Array.from(byId.values()).slice(-100).reverse() };
      emit();
      return true;
    },
    selectAgent(selectedAgentId) {
      state = {
        ...state,
        selectedAgentId: selectedAgentId || null,
        selectedAgentDetails: selectedAgentId === state.selectedAgentId ? state.selectedAgentDetails : null,
        selectionError: null,
      };
      emit();
    },
    setSelectedAgentDetails(selectedAgentDetails, selectionError = null) {
      state = { ...state, selectedAgentDetails, selectionError };
      emit();
    },
    reset() {
      state = { ...state, simulationTime: 0, status: "stopped", entities: new Map(), riskEvents: [], timeline: [], statistics: { ...EMPTY_STATS }, selectedAgentId: null, selectedAgentDetails: null, selectionError: null };
      emit();
    },
  };
}
