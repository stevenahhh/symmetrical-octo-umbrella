import React, { useEffect } from "react";
import { simulationStore, useSimulationStore } from "../stores/simulationStore";
import { SIMULATION_API_URL } from "../utils/apiConfig";
import { AgentTrajectory } from "./AgentTrajectory";
import { RiskEventLayer } from "./RiskEventLayer";
import { TrafficEntity } from "./TrafficEntity";
import { TrafficSignal } from "./TrafficSignal";

export function TrafficSimulationLayer({
  coordinateConfig,
  renderEntity,
  resolveHeight,
  showRiskEvents = true,
  showTrafficLights = false,
}) {
  const entities = useSimulationStore((state) => Array.from(state.entities.values()));
  const trafficLights = useSimulationStore((state) => state.trafficLights);
  const selectedAgentId = useSimulationStore((state) => state.selectedAgentId);
  const selectedAgentDetails = useSimulationStore((state) => state.selectedAgentDetails);

  useEffect(() => {
    if (!selectedAgentId) return undefined;
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch(`${SIMULATION_API_URL}/api/simulation/agents/${encodeURIComponent(selectedAgentId)}`);
        if (!response.ok) throw new Error(response.status === 404 ? "Agent가 시뮬레이션을 종료했습니다." : `HTTP ${response.status}`);
        const details = await response.json();
        if (!disposed && details.id === selectedAgentId) simulationStore.setSelectedAgentDetails(details);
      } catch (error) {
        if (!disposed) simulationStore.setSelectedAgentDetails(null, error.message);
      }
    };
    load();
    const timer = setInterval(load, 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, [selectedAgentId]);

  return (
    <group name="campus-traffic-simulation" onPointerMissed={() => simulationStore.selectAgent(null)}>
      {showTrafficLights && trafficLights.map((signal) => (
        <TrafficSignal key={signal.signal_id} signal={signal} coordinateConfig={coordinateConfig} />
      ))}
      {entities.map((entity) => (
        <TrafficEntity
          key={entity.id}
          entity={entity}
          coordinateConfig={coordinateConfig}
          renderEntity={renderEntity}
          resolveHeight={resolveHeight}
          selected={entity.id === selectedAgentId}
          onSelect={(id) => simulationStore.selectAgent(id)}
        />
      ))}
      <AgentTrajectory details={selectedAgentDetails} coordinateConfig={coordinateConfig} resolveHeight={resolveHeight} />
      {showRiskEvents && <RiskEventLayer coordinateConfig={coordinateConfig} resolveHeight={resolveHeight} />}
    </group>
  );
}
