import { useCallback, useEffect, useReducer, useRef } from "react";
import { parseEnergyDashboardPayload } from "./energyDashboardApi.mjs";
import { energyDashboardReducer, initialEnergyDashboardState } from "./energyDashboardState.mjs";

export function useEnergyDashboard({ buildingId, date, scenarioId, client }) {
  const [state, dispatch] = useReducer(energyDashboardReducer, initialEnergyDashboardState);
  const requestId = useRef(0);
  const activeController = useRef(null);
  const load = useCallback(() => {
    activeController.current?.abort();
    const id = ++requestId.current;
    const controller = new AbortController();
    activeController.current = controller;
    dispatch({ type: "load", requestId: id });
    client.load({ buildingId, date, scenarioId, signal: controller.signal }).then((payload) => {
      dispatch({ type: "success", requestId: id, data: payload ? parseEnergyDashboardPayload(payload) : null });
    }).catch((error) => {
      if (error?.name !== "AbortError") dispatch({ type: "error", requestId: id, error: error?.message || "에너지 데이터를 불러오지 못했습니다." });
    });
  }, [buildingId, client, date, scenarioId]);
  useEffect(() => {
    load();
    return () => {
      activeController.current?.abort();
      activeController.current = null;
    };
  }, [load]);
  return { ...state, retry: load };
}
