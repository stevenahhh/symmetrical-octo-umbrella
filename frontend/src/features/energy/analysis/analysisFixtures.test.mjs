function interval(index, generationScale = 1) {
  const hour = String(Math.floor(index / 4)).padStart(2, "0");
  const minute = String((index % 4) * 15).padStart(2, "0");
  const demand = index >= 36 && index < 72 ? 4 : 2;
  const generation = index >= 28 && index < 72 ? 1.5 * generationScale : 0;
  return {
    timestamp: `2026-05-18T${hour}:${minute}:00+09:00`,
    predicted_demand_energy_kwh: demand,
    global_irradiance_w_m2: generation ? 650 : 0,
    baseline_generation_energy_kwh: 0,
    proposed_generation_energy_kwh: generation,
    alternative_generation_energy_kwh: generationScale === null ? null : generation * 2 / 3,
  };
}

function totals(intervals, generationField) {
  return intervals.reduce((value, slot) => {
    const demand = slot.predicted_demand_energy_kwh;
    const generation = slot[generationField] ?? 0;
    const used = Math.min(demand, generation);
    value.demand_energy_kwh += demand;
    value.generation_energy_kwh += generation;
    value.self_consumption_energy_kwh += used;
    value.grid_draw_energy_kwh += demand - used;
    value.surplus_energy_kwh += generation - used;
    return value;
  }, { demand_energy_kwh: 0, generation_energy_kwh: 0, self_consumption_energy_kwh: 0, grid_draw_energy_kwh: 0, surplus_energy_kwh: 0 });
}

export function analysisScenarioFixture(overrides = {}) {
  return {
    id: "analysis-scenario-D4",
    building_id: "D4",
    name: "D4 comparison",
    representative_plan_id: "plan-representative",
    alternative_plan_id: "plan-alternative",
    baseline: "no_solar",
    conditions: {
      demand_source: "predicted",
      weather_preset: "clear",
      electricity_price_krw_per_kwh: 160,
      carbon_intensity_kg_co2e_per_kwh: 0.45,
    },
    created_at: "2026-05-18T09:00:00+09:00",
    updated_at: "2026-05-18T09:00:00+09:00",
    ...overrides,
  };
}

function plan(id, name, buildingId) {
  return { id, building_id: buildingId, name, created_at: "2026-05-17T09:00:00+09:00", updated_at: "2026-05-17T09:00:00+09:00", arrays: [] };
}

export function analysisRunFixture({ withAlternative = true, id = "analysis-run-D4", scenarioOverrides = {}, ...overrides } = {}) {
  const buildingId = overrides.building_id ?? scenarioOverrides.building_id ?? "D4";
  const intervals = Array.from({ length: 96 }, (_, index) => interval(index, withAlternative ? 1 : null));
  const proposed = totals(intervals, "proposed_generation_energy_kwh");
  const baseline = { demand_energy_kwh: proposed.demand_energy_kwh, generation_energy_kwh: 0, self_consumption_energy_kwh: 0, grid_draw_energy_kwh: proposed.demand_energy_kwh, surplus_energy_kwh: 0 };
  const scenario = analysisScenarioFixture({ building_id: buildingId, alternative_plan_id: withAlternative ? "plan-alternative" : null, ...scenarioOverrides });
  return {
    run_type: "scenario",
    id,
    analysis_scenario_id: scenario.id,
    building_id: buildingId,
    created_at: "2026-05-18T09:01:00+09:00",
    date: "2026-05-18",
    scenario_snapshot: scenario,
    plan_snapshots: {
      representative: plan("plan-representative", "Representative south roof", buildingId),
      alternative: withAlternative ? plan("plan-alternative", "Alternative compact roof", buildingId) : null,
    },
    intervals,
    totals: {
      baseline,
      proposed,
      alternative: withAlternative ? totals(intervals, "alternative_generation_energy_kwh") : null,
    },
    campus_representatives: [],
    ...overrides,
  };
}

export function directAnalysisRunFixture({ id = "direct-analysis-run-D4", ...overrides } = {}) {
  const scenarioRun = analysisRunFixture({ withAlternative: false });
  const installationPlan = scenarioRun.plan_snapshots.representative;
  return {
    run_type: "direct",
    id,
    building_id: scenarioRun.building_id,
    installation_plan_id: installationPlan.id,
    created_at: "2026-05-17T09:01:00+09:00",
    installation_plan: installationPlan,
    conditions: {
      date: scenarioRun.date,
      weather_preset: "clear",
      timezone: "Asia/Seoul",
      interval_minutes: 15,
      generation_model: "deterministic-python-v1",
    },
    result: {
      scenario_id: installationPlan.id,
      date: scenarioRun.date,
      interval_minutes: 15,
      demand_quality: "predicted",
      weather_source: "scenario",
      generation_assumption: {
        type: "simulation-assumption",
        calibration: "not-engineering-calibrated",
        model: "deterministic-python-v1",
        system_loss_fraction: 0.1,
      },
      intervals: scenarioRun.intervals.map((slot) => ({
        timestamp: slot.timestamp,
        predicted_demand_energy_kwh: slot.predicted_demand_energy_kwh,
        generation_energy_kwh: slot.proposed_generation_energy_kwh,
        global_irradiance_w_m2: slot.global_irradiance_w_m2,
        self_consumption_energy_kwh: Math.min(slot.predicted_demand_energy_kwh, slot.proposed_generation_energy_kwh),
        grid_draw_energy_kwh: Math.max(slot.predicted_demand_energy_kwh - slot.proposed_generation_energy_kwh, 0),
        surplus_energy_kwh: Math.max(slot.proposed_generation_energy_kwh - slot.predicted_demand_energy_kwh, 0),
      })),
      arrays: [],
      totals: scenarioRun.totals.proposed,
    },
    ...overrides,
  };
}

export function alternativeRunFixture(overrides = {}) {
  return analysisRunFixture(overrides);
}
