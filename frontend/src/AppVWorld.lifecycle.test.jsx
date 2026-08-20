/* @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let resolveRepresentative;
const representativeLoad = new Promise((resolve) => { resolveRepresentative = resolve; });
const installationClient = {
  listDetails: vi.fn().mockResolvedValue([]),
  getRepresentative: vi.fn().mockReturnValue(representativeLoad),
};

vi.mock("./features/energy/installations/installationPlanApi.mjs", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createInstallationPlanClient: () => installationClient };
});
vi.mock("./vworld/VWorldRenderer", () => ({
  default: ({ onSelection, onRepresentativeInstallationPlanChange }) => <div>
    <button type="button" onClick={() => onSelection({ elementId: "BLD_D4", buildingId: "D4", displayName: "D4" })}>D4 선택</button>
    <button type="button" onClick={() => onRepresentativeInstallationPlanChange({ buildingId: "D4", installationPlanId: "plan-new" })}>새 대표 선택</button>
  </div>,
}));
vi.mock("./features/energy/analysis", () => ({ BuildingAnalysis: ({ representativePlanId }) => <div data-testid="app-representative">{representativePlanId ?? "none"}</div> }));
vi.mock("./features/energy/dashboard/EnergyDashboard", () => ({
  EnergyDashboard: ({ buildingId }) => <div data-testid="building-energy-dashboard">{buildingId} 전력 현황</div>,
}));
vi.mock("./features/energy/campus/CampusComparisonPanel", () => ({
  CampusComparison: () => <div data-testid="campus-comparison">캠퍼스 비교</div>,
}));

import App from "./AppVWorld.jsx";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url) => String(url).includes("/popup")
    ? { ok: false, status: 404, json: async () => null }
    : { ok: true, status: 200, json: async () => ({ base_weather: { temperature: 20 }, weather_timeline: [] }) }));
  window.matchMedia = vi.fn(() => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppVWorld installation selection lifecycle", () => {
  it("reopens a wider panel and shows the selected building energy before analysis", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "대시보드 패널 닫기" }));
    expect(screen.getByRole("button", { name: "대시보드 패널 열기" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "D4 선택" }));

    expect(screen.getByRole("button", { name: "대시보드 패널 닫기" })).toBeTruthy();
    expect(document.querySelector(".dashboard-root")?.classList.contains("dashboard-root--building-focus")).toBe(true);
    const region = screen.getByRole("region", { name: "D4 건물 전력 현황" });
    const dashboard = screen.getByTestId("building-energy-dashboard");
    const analysis = screen.getByTestId("app-representative");
    const comparison = screen.getByTestId("campus-comparison");
    expect(region.contains(dashboard)).toBe(true);
    expect(region.compareDocumentPosition(analysis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(analysis.compareDocumentPosition(comparison) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "건물 정보 닫기" }));
    expect(document.querySelector(".dashboard-root")?.classList.contains("dashboard-root--building-focus")).toBe(true);
  });

  it("does not let an older same-building representative load overwrite a newer selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "D4 선택" }));
    await user.click(screen.getByRole("button", { name: "새 대표 선택" }));
    expect((await screen.findByTestId("app-representative")).textContent).toBe("plan-new");

    await act(async () => { resolveRepresentative({ buildingId: "D4", installationPlanId: "plan-old" }); });
    expect(screen.getByTestId("app-representative").textContent).toBe("plan-new");
  });
});
