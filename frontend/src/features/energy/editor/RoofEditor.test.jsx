/* @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoofEditor } from "./RoofEditor.jsx";

vi.mock("./RoofEditorScene", () => ({
  RoofEditorScene: ({ state }) => <div data-testid="loaded-scenario">{state.scenarioId}</div>,
}));
vi.mock("./RoofEditorControls", () => ({
  RoofEditorControls: ({ onSave }) => <button type="button" onClick={onSave}>테스트 저장</button>,
}));

const arrayFor = (planId) => ({
  id: `${planId}-array`, planId, roofId: "roof-1", roofZoneId: "zone-1", moduleId: "module-1",
  originMeters: { xMeters: 10, yMeters: 12 }, rows: 2, columns: 2, azimuthDeg: 180, tiltDeg: 25,
  orientation: "portrait", moduleWidthMeters: 1.05, moduleLengthMeters: 2.1,
  moduleEfficiencyPercent: 20, moduleNominalPowerWp: 441, interPanelGapMeters: 0.02,
});
const planFor = (id) => ({ id, buildingId: "D4", name: id, arrays: [arrayFor(id)] });
const buildingResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    id: "D4",
    roofs: [{
      id: "roof-1",
      zones: [{ id: "zone-1", polygon_meters: [{ x_meters: 0, y_meters: 0 }, { x_meters: 50, y_meters: 0 }, { x_meters: 50, y_meters: 50 }, { x_meters: 0, y_meters: 50 }] }],
      obstacles: [],
    }],
  }),
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RoofEditor lifecycle", () => {
  it("aborts and ignores a stale load after the installation plan changes", async () => {
    let resolvePlan1;
    const plan1 = new Promise((resolve) => { resolvePlan1 = resolve; });
    const signals = new Map();
    const client = {
      get: vi.fn((id, options) => {
        signals.set(id, options.signal);
        return id === "plan-1" ? plan1 : Promise.resolve(planFor(id));
      }),
    };
    vi.stubGlobal("fetch", vi.fn(async () => buildingResponse()));
    const view = render(<RoofEditor buildingId="D4" installationPlanId="plan-1" installationPlanClient={client} />);
    await act(async () => {});

    view.rerender(<RoofEditor buildingId="D4" installationPlanId="plan-2" installationPlanClient={client} />);
    expect((await screen.findByTestId("loaded-scenario")).textContent).toBe("plan-2");
    expect(signals.get("plan-1").aborted).toBe(true);
    await act(async () => { resolvePlan1(planFor("plan-1")); });
    expect(screen.getByTestId("loaded-scenario").textContent).toBe("plan-2");
  });

  it("aborts and ignores a stale save after the installation plan changes", async () => {
    const user = userEvent.setup();
    let resolveSave;
    const pendingSave = new Promise((resolve) => { resolveSave = resolve; });
    let saveSignal;
    const client = {
      get: vi.fn(async (id) => planFor(id)),
      update: vi.fn((id, _input, options) => {
        if (id === "plan-1") {
          saveSignal = options.signal;
          return pendingSave;
        }
        return Promise.resolve(planFor(id));
      }),
    };
    vi.stubGlobal("fetch", vi.fn(async () => buildingResponse()));
    const onPlanSaved = vi.fn();
    const view = render(<RoofEditor buildingId="D4" installationPlanId="plan-1" installationPlanClient={client} onPlanSaved={onPlanSaved} />);
    expect((await screen.findByTestId("loaded-scenario")).textContent).toBe("plan-1");
    await user.click(screen.getByRole("button", { name: "테스트 저장" }));

    view.rerender(<RoofEditor buildingId="D4" installationPlanId="plan-2" installationPlanClient={client} onPlanSaved={onPlanSaved} />);
    expect((await screen.findByTestId("loaded-scenario")).textContent).toBe("plan-2");
    expect(saveSignal.aborted).toBe(true);
    await act(async () => { resolveSave(planFor("plan-1")); });
    expect(screen.getByTestId("loaded-scenario").textContent).toBe("plan-2");
    expect(onPlanSaved).not.toHaveBeenCalled();
  });

  it("aborts a load request on teardown", async () => {
    let loadSignal;
    const client = {
      get: vi.fn((_id, options) => {
        loadSignal = options.signal;
        return new Promise(() => {});
      }),
    };
    vi.stubGlobal("fetch", vi.fn(async () => buildingResponse()));
    const view = render(<RoofEditor buildingId="D4" installationPlanId="plan-1" installationPlanClient={client} />);
    await act(async () => {});
    view.unmount();
    expect(loadSignal.aborted).toBe(true);
  });

  it("aborts and ignores a save request on teardown", async () => {
    const user = userEvent.setup();
    let saveSignal;
    let resolveSave;
    const pendingSave = new Promise((resolve) => { resolveSave = resolve; });
    const client = {
      get: vi.fn(async (id) => planFor(id)),
      update: vi.fn((_id, _input, options) => {
        saveSignal = options.signal;
        return pendingSave;
      }),
    };
    vi.stubGlobal("fetch", vi.fn(async () => buildingResponse()));
    const onPlanSaved = vi.fn();
    const view = render(<RoofEditor buildingId="D4" installationPlanId="plan-1" installationPlanClient={client} onPlanSaved={onPlanSaved} />);
    await screen.findByTestId("loaded-scenario");
    await user.click(screen.getByRole("button", { name: "테스트 저장" }));
    view.unmount();
    expect(saveSignal.aborted).toBe(true);
    await act(async () => { resolveSave(planFor("plan-1")); });
    expect(onPlanSaved).not.toHaveBeenCalled();
  });
});
