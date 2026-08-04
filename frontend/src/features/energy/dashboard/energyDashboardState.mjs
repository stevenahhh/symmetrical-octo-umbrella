export const initialEnergyDashboardState = Object.freeze({ requestId: 0, status: "idle", data: null, error: null });

export function energyDashboardReducer(state, action) {
  if (action.type === "load") return { requestId: action.requestId, status: "loading", data: null, error: null };
  if (action.requestId !== state.requestId) return state;
  if (action.type === "success") return { ...state, status: action.data ? "success" : "empty", data: action.data, error: null };
  if (action.type === "error") return { ...state, status: "error", data: null, error: action.error };
  return state;
}
