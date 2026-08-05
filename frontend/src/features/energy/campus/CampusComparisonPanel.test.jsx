/* @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampusComparison, createCampusComparisonClient } from "./CampusComparisonPanel.jsx";
import { CampusComparisonContractError, parseCampusComparison } from "./campusComparison.mjs";

const parsed = parseCampusComparison({
  date: "2026-05-18", weather_preset: "clear",
  assumptions: { annualization_days: 365, weights: { annualized_yield: .3 }, demand_quality: "predicted", weather_source: "scenario", comparability: "same date and deterministic weather preset only" },
  rankings: [
    { scenario_id: "D4-s", building_id: "D4", building_name: "D4 / 공대 3호관", building_status: "simulated", status: "ranked", rank: 1, score: .71, total_generation_energy_kwh: 40, capacity_kwp: 7.056, exclusion_reason: null, component_scores: { annualized_yield: .8, roof_utilization: .3, self_sufficiency: .2, grid_reduction: .2, constraints: 1 }, metrics: { annualized_kwh_per_kwp: 2070, roof_utilization_ratio: .022, self_sufficiency_ratio: .04, grid_reduction_ratio: .04, constraint_violation_count: 0 } },
    { scenario_id: "D1-s", building_id: "D1", building_name: "D1 / 창업보육센터", building_status: "simulated", status: "ranked", rank: 2, score: .61, total_generation_energy_kwh: 30, capacity_kwp: 5.292, exclusion_reason: null, component_scores: { annualized_yield: .7, roof_utilization: .2, self_sufficiency: .2, grid_reduction: .2, constraints: 1 }, metrics: { annualized_kwh_per_kwp: 1900, roof_utilization_ratio: .02, self_sufficiency_ratio: .03, grid_reduction_ratio: .03, constraint_violation_count: 0 } },
    { scenario_id: null, building_id: "C1", building_name: "C1 / 도서관", building_status: "incomplete", status: "excluded", rank: null, score: null, total_generation_energy_kwh: null, capacity_kwp: null, exclusion_reason: "missing_roof_metadata", component_scores: null, metrics: null },
  ],
});

afterEach(cleanup);
describe("CampusComparison", () => {
  it("creates recommendation copies through the canonical /energy namespace", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ source_scenario_id: "source/s", scenario: { id: "copy-s", building_id: "D3" } }) });
    const result = await createCampusComparisonClient("http://api.test", fetchImpl).recommend({ sourceScenarioId: "source/s", date: "2026-05-18" });
    expect(fetchImpl).toHaveBeenCalledWith("http://api.test/energy/scenarios/source%2Fs/recommend", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual({ id: "copy-s", buildingId: "D3" });
  });

  it("rejects ranking responses outside the requested date and weather context", async () => {
    for (const mismatch of [
      { date: "2026-05-17", weather_preset: "clear", field: "date" },
      { date: "2026-05-18", weather_preset: "overcast", field: "weather_preset" },
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({
        date: mismatch.date,
        weather_preset: mismatch.weather_preset,
        assumptions: { annualization_days: 365, weights: {}, demand_quality: "predicted", weather_source: "scenario" },
        rankings: [],
      }) });
      await expect(createCampusComparisonClient("http://api.test", fetchImpl).load({ date: "2026-05-18", weatherPreset: "clear" }))
        .rejects.toMatchObject({ name: "CampusComparisonContractError", field: mismatch.field });
    }
  });

  it("rejects a recommendation copied from a source other than the selected scenario", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({
      source_scenario_id: "other-source", scenario: { id: "copy-s", building_id: "D3" },
    }) });
    await expect(createCampusComparisonClient("http://api.test", fetchImpl).recommend({ sourceScenarioId: "source-s", date: "2026-05-18" }))
      .rejects.toBeInstanceOf(CampusComparisonContractError);
  });

  it("shows statuses, assumptions and every component, then opens a new recommendation", async () => {
    const user = userEvent.setup();
    const client = { load: vi.fn().mockResolvedValue(parsed), recommend: vi.fn().mockResolvedValue({ id: "new-s", buildingId: "D4" }) };
    const open = vi.fn();
    render(<CampusComparison client={client} initialDate="2026-05-18" onOpenRecommendation={open} />);
    expect(await screen.findByText("D4 / 공대 3호관")).toBeTruthy();
    expect(screen.getAllByText(/연환산 발전량/)).toHaveLength(2);
    expect(screen.getAllByText(/옥상 활용/)).toHaveLength(2);
    expect(screen.getAllByText(/제약 위반/)).toHaveLength(2);
    expect(screen.getByText(/옥상 메타데이터/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "D1 / 창업보육센터 배치 편집" }));
    expect(open).toHaveBeenCalledWith({ scenarioId: "D1-s", buildingId: "D1" });
    await user.click(screen.getByRole("button", { name: "1위 추천을 새 편집 시나리오로 열기" }));
    expect(client.recommend).toHaveBeenCalledWith({ sourceScenarioId: "D4-s", date: "2026-05-18" });
    expect(open).toHaveBeenCalledWith({ scenarioId: "new-s", buildingId: "D4" });
  });
});
