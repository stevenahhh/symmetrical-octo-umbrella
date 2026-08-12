/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", () => ({ Canvas: ({ children }) => <div>{children}</div> }));
vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  Sky: () => null,
}));
vi.mock("./CityModel", () => ({ CityModel: () => null }));
vi.mock("./simulation", () => ({
  CampusTrafficSimulation: () => null,
  TrafficSafetyPanel: () => null,
  useSimulationSocket: vi.fn(),
}));
vi.mock("./vworld/D4SectionExperience", () => ({ D4SectionExperience: () => null }));
vi.mock("./features/energy/analysis", () => ({
  BuildingAnalysis: () => <div>건물 에너지 분석</div>,
}));
vi.mock("./features/energy/campus/CampusComparisonPanel", () => ({
  CampusComparison: () => <div>캠퍼스 태양광 비교</div>,
}));
vi.mock("./features/energy/dashboard/EnergyDashboard", () => ({
  EnergyDashboard: () => <div>건물 에너지 시뮬레이션</div>,
}));
vi.mock("./vworld/VWorldCampusStatus", () => ({
  VWorldCampusStatus: () => <div>캠퍼스 설치 현황</div>,
}));

import App from "./AppLegacy.jsx";

window.matchMedia = vi.fn(() => ({ matches: false }));
globalThis.fetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({ base_weather: null }),
}));

afterEach(() => cleanup());

describe("Legacy and VWorld feature parity", () => {
  it("renders the VWorld campus status and full energy surfaces", () => {
    render(<App />);

    expect(screen.getByText("캠퍼스 설치 현황")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "에너지" }));
    expect(screen.getByText("건물 에너지 분석")).toBeTruthy();
    expect(screen.getByText("캠퍼스 태양광 비교")).toBeTruthy();
    expect(screen.getByText("건물 에너지 시뮬레이션")).toBeTruthy();
  });
});
