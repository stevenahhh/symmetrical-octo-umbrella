import { useSyncExternalStore } from "react";
import { createRouteEditorStore } from "./routeEditorStoreCore.mjs";

export const routeEditorStore = createRouteEditorStore();

export function useRouteEditorStore(selector = (state) => state) {
  const state = useSyncExternalStore(routeEditorStore.subscribe, routeEditorStore.getState, routeEditorStore.getState);
  return selector(state);
}
