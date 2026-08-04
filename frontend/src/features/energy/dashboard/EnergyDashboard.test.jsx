/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnergyDashboard } from "./EnergyDashboard.jsx";
import { dashboardPayload } from "./energyDashboardApi.test.mjs";

afterEach(cleanup);
const nextTick = () => new Promise((resolve) => queueMicrotask(resolve));
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function readyClient(payload = dashboardPayload()) {
  return { load: vi.fn().mockResolvedValue(payload) };
}

describe("EnergyDashboard", () => {
  it("renders loading, then exact KPI labels, units, provenance, aligned chart and breakdowns", async () => {
    const request = deferred();
    const client = { load: vi.fn(() => request.promise) };
    render(<EnergyDashboard client={client} initialDate="2026-05-18" />);
    expect(screen.getByRole("status").textContent).toContain("불러오는 중");
    request.resolve(dashboardPayload());
    expect(await screen.findByRole("heading", { name: "D4 / 공대 3호관" })).toBeTruthy();
    expect(screen.getAllByText("가상 예측").length).toBeGreaterThan(0);
    expect(screen.getAllByText("시나리오/추정").length).toBeGreaterThan(0);
    expect(screen.getByText("921.7 kWh")).toBeTruthy();
    expect(screen.getByText("44.0 kWh")).toBeTruthy();
    expect(screen.getByText("4.8%")).toBeTruthy();
    expect(screen.getByRole("img", { name: /96개 15분 구간/ })).toBeTruthy();
    expect(screen.getByText("시스템 손실 10.0%")).toBeTruthy();
    expect(screen.getByText("강의실")).toBeTruthy();
  });

  it("renders seeded D3 KPIs and an explicit unavailable room breakdown", async () => {
    const value = dashboardPayload();
    const total = 24;
    value.building = { ...value.building, id: "D3", display_name: "D3 / 공대 2호관", room_count: 1 };
    value.scenario = { ...value.scenario, id: "D3-scenario-campus-baseline", building_id: "D3", name: "D3 campus baseline" };
    value.demand = { ...value.demand, building_id: "D3", total_energy_kwh: total, intervals: value.demand.intervals.map((item) => ({ ...item, predicted_demand_kw: 1, predicted_demand_energy_kwh: .25 })) };
    value.simulation = { ...value.simulation, scenario_id: value.scenario.id, intervals: value.simulation.intervals.map((item) => ({ ...item, predicted_demand_energy_kwh: .25 })), totals: { ...value.simulation.totals, demand_energy_kwh: total } };
    render(<EnergyDashboard buildingId="D3" client={readyClient(value)} initialDate="2026-05-18" scenarios={[{ id: value.scenario.id, label: value.scenario.name }]} />);
    expect(await screen.findByRole("heading", { name: "D3 / 공대 2호관" })).toBeTruthy();
    expect(screen.getByText("24.0 kWh")).toBeTruthy();
    expect(screen.getAllByText("가상 예측").length).toBeGreaterThan(0);
    expect(screen.getByText("이 비교 건물의 공간 유형별 상세 수요는 제공되지 않습니다.")).toBeTruthy();
  });

  it("renders a truthful empty state", async () => {
    const client = readyClient(null);
    render(<EnergyDashboard client={client} initialDate="2026-05-18" />);
    expect(await screen.findByText("표시할 에너지 시나리오가 없습니다.")).toBeTruthy();
  });

  it("renders recoverable error without zero metrics and retries", async () => {
    const client = { load: vi.fn().mockRejectedValueOnce(new Error("API offline")).mockResolvedValueOnce(dashboardPayload()) };
    render(<EnergyDashboard client={client} initialDate="2026-05-18" />);
    expect((await screen.findByRole("alert")).textContent).toContain("API offline");
    expect(screen.queryByText("0.0 kWh")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "에너지 데이터 다시 시도" }));
    expect(await screen.findByRole("heading", { name: "D4 / 공대 3호관" })).toBeTruthy();
  });

  it("ignores stale date and scenario responses", async () => {
    const first = deferred(); const second = deferred(); const third = deferred();
    const client = { load: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise) };
    render(<EnergyDashboard client={client} initialDate="2026-05-18" scenarios={[{ id: "scenario-a", label: "A" }, { id: "scenario-b", label: "B" }]} />);
    fireEvent.change(screen.getByLabelText("시뮬레이션 날짜"), { target: { value: "2026-05-19" } });
    second.resolve(dashboardPayload());
    await nextTick(); await nextTick();
    fireEvent.change(screen.getByLabelText("설치 시나리오"), { target: { value: "scenario-b" } });
    third.resolve(dashboardPayload({ scenario: { ...dashboardPayload().scenario, id: "scenario-b", name: "선택 B" }, simulation: { ...dashboardPayload().simulation, scenario_id: "scenario-b" } }));
    expect(await screen.findByText(/선택 B/)).toBeTruthy();
    first.resolve(dashboardPayload({ scenario: { ...dashboardPayload().scenario, name: "오래된 A" } }));
    await nextTick(); await nextTick();
    expect(screen.queryByText(/오래된 A/)).toBeNull();
    expect(screen.getByText(/선택 B/)).toBeTruthy();
  });
});
