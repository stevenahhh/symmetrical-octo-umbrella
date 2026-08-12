import { useSyncExternalStore } from "react";
import { createSimulationStore, parseSimulationMessage } from "./simulationStoreCore.mjs";

export const simulationStore = createSimulationStore();
export { parseSimulationMessage };

export function useSimulationStore(selector = (state) => state) {
  const state = useSyncExternalStore(simulationStore.subscribe, simulationStore.getState, simulationStore.getState);
  return selector(state);
}
