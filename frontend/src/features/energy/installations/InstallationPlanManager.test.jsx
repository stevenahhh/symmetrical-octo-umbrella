/* @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallationPlanManager } from "./InstallationPlanManager.jsx";

const arrays = [{ id: "array-1", planId: "plan-1", roofId: "roof-1", roofZoneId: "zone-1", moduleId: "module-1", originMeters: { xMeters: 10, yMeters: 12 }, rows: 2, columns: 8, azimuthDeg: 180, tiltDeg: 25, orientation: "portrait", moduleWidthMeters: 1.05, moduleLengthMeters: 2.1, moduleEfficiencyPercent: 20, moduleNominalPowerWp: 441, interPanelGapMeters: 0.02 }];
const plans = [
  { id: "plan-1", buildingId: "D4", name: "기준안", createdAt: "2026-08-04T10:00:00+09:00", updatedAt: "2026-08-04T10:00:00+09:00", arrays },
  { id: "plan-2", buildingId: "D4", name: "대안", createdAt: "2026-08-04T11:00:00+09:00", updatedAt: "2026-08-04T11:00:00+09:00", arrays: arrays.map((item) => ({ ...item, id: "array-2", planId: "plan-2" })) },
];
function client() {
  return {
    list: vi.fn().mockResolvedValue(plans),
    getRepresentative: vi.fn().mockResolvedValue({ buildingId: "D4", installationPlanId: "plan-1", selectedAt: "2026-08-04T10:00:00+09:00" }),
    create: vi.fn().mockImplementation(async (input) => ({ ...plans[0], id: "plan-3", name: input.name })),
    copy: vi.fn().mockImplementation(async (_plan, name) => ({ ...plans[0], id: "plan-copy", name })),
    update: vi.fn().mockImplementation(async (id, input) => ({ ...plans.find((item) => item.id === id), name: input.name })),
    remove: vi.fn().mockResolvedValue(undefined),
    setRepresentative: vi.fn().mockImplementation(async (_buildingId, installationPlanId) => ({ buildingId: "D4", installationPlanId, selectedAt: "2026-08-04T12:00:00+09:00" })),
    unsetRepresentative: vi.fn().mockResolvedValue(undefined),
  };
}
afterEach(cleanup);

describe("InstallationPlanManager", () => {
  it("lists, selects for editing, renames, copies, marks representative, and deletes non-representative plans", async () => {
    const user = userEvent.setup();
    const api = client();
    const onEditPlan = vi.fn();
    const onPlansChange = vi.fn();
    render(<InstallationPlanManager buildingId="D4" client={api} onEditPlan={onEditPlan} onPlansChange={onPlansChange} createPlanDraft={() => ({ name: "신규안", arrays })} />);

    expect(await screen.findByRole("heading", { name: "설치 계획" })).toBeTruthy();
    expect(screen.getByText("대표 계획")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "대안 편집" }));
    expect(onEditPlan).toHaveBeenCalledWith(expect.objectContaining({ id: "plan-2" }));

    await user.clear(screen.getByLabelText("대안 계획 이름"));
    await user.type(screen.getByLabelText("대안 계획 이름"), "동측 대안");
    await user.click(screen.getByRole("button", { name: "대안 이름 저장" }));
    expect(api.update).toHaveBeenCalledWith("plan-2", expect.objectContaining({ name: "동측 대안" }), expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await user.click(screen.getByRole("button", { name: "동측 대안 복사" }));
    expect(api.copy).toHaveBeenCalledWith(expect.objectContaining({ id: "plan-2" }), "동측 대안 복사본", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await user.click(screen.getByRole("button", { name: "동측 대안 대표로 지정" }));
    expect(api.setRepresentative).toHaveBeenCalledWith("D4", "plan-2", expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await user.click(screen.getByRole("button", { name: "기준안 삭제" }));
    expect(api.remove).toHaveBeenCalledWith("plan-1", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(onPlansChange).toHaveBeenCalled();
  }, 15_000);

  it("creates through the API from a valid roof-local draft and immediately opens the created plan", async () => {
    const user = userEvent.setup();
    const api = client();
    const onEditPlan = vi.fn();
    render(<InstallationPlanManager buildingId="D4" client={api} createPlanDraft={({ plans: loadedPlans }) => ({ name: "신규안", arrays: loadedPlans[0].arrays })} onEditPlan={onEditPlan} />);
    await screen.findByLabelText("기준안 계획 이름");
    await user.click(screen.getByRole("button", { name: "새 설치 계획" }));
    expect(api.create).toHaveBeenCalledWith({ buildingId: "D4", name: "신규안", arrays }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(onEditPlan).toHaveBeenCalledWith(expect.objectContaining({ id: "plan-3", buildingId: "D4" }));
  });

  it("rejects update and copy responses outside the requested plan context", async () => {
    const user = userEvent.setup();
    const api = client();
    api.update.mockResolvedValueOnce({ ...plans[1], id: "plan-other", name: "동측 대안" });
    const onPlansChange = vi.fn();
    render(<InstallationPlanManager buildingId="D4" client={api} onPlansChange={onPlansChange} />);
    await screen.findByLabelText("대안 계획 이름");

    await user.clear(screen.getByLabelText("대안 계획 이름"));
    await user.type(screen.getByLabelText("대안 계획 이름"), "동측 대안");
    await user.click(screen.getByRole("button", { name: "대안 이름 저장" }));
    expect((await screen.findByRole("alert")).textContent).toContain("updated plan identity must match");
    expect(onPlansChange).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "plan-other" })]));

    api.copy.mockResolvedValueOnce({ ...plans[0], id: "plan-copy", buildingId: "D5", name: "기준안 복사본" });
    await user.click(screen.getByRole("button", { name: "기준안 복사" }));
    expect((await screen.findByRole("alert")).textContent).toContain("copied plan must match");
    expect(onPlansChange).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "plan-copy" })]));
  });

  it("reports recoverable action failures", async () => {
    const user = userEvent.setup();
    const api = client();
    api.remove.mockRejectedValueOnce(new Error("삭제 실패"));
    render(<InstallationPlanManager buildingId="D4" client={api} createPlanDraft={() => ({ name: "신규안", arrays })} />);
    await screen.findByLabelText("기준안 계획 이름");
    await user.click(screen.getByRole("button", { name: "대안 삭제" }));
    expect((await screen.findByRole("alert")).textContent).toContain("삭제 실패");
  });

  it("publishes a non-first loaded representative and replaces it using installationPlanId", async () => {
    const user = userEvent.setup();
    const api = client();
    api.getRepresentative.mockResolvedValue({ buildingId: "D4", installationPlanId: "plan-2", selectedAt: "2026-08-04T11:00:00+09:00" });
    const onRepresentativeChange = vi.fn();
    render(<InstallationPlanManager buildingId="D4" client={api} onRepresentativeChange={onRepresentativeChange} />);

    expect(await screen.findByText("대표 계획")).toBeTruthy();
    expect(screen.getByRole("button", { name: "대안 대표 해제" })).toBeTruthy();
    expect(onRepresentativeChange).toHaveBeenCalledWith(expect.objectContaining({ installationPlanId: "plan-2" }));

    await user.click(screen.getByRole("button", { name: "기준안 대표로 지정" }));
    expect(onRepresentativeChange).toHaveBeenLastCalledWith(expect.objectContaining({ installationPlanId: "plan-1" }));
    expect(screen.getByRole("button", { name: "기준안 대표 해제" })).toBeTruthy();
  });

  it("explicitly clears a representative so its plan can be deleted", async () => {
    const user = userEvent.setup();
    const api = client();
    const onRepresentativeChange = vi.fn();
    render(<InstallationPlanManager buildingId="D4" client={api} onRepresentativeChange={onRepresentativeChange} />);
    await user.click(await screen.findByRole("button", { name: "기준안 대표 해제" }));
    expect(api.unsetRepresentative).toHaveBeenCalledWith("D4", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(onRepresentativeChange).toHaveBeenCalledWith(null);
    expect(screen.getByRole("button", { name: "기준안 삭제" }).disabled).toBe(false);
  });

  it("does not reload plans when integration callbacks change identity", async () => {
    const api = client();
    const view = render(<InstallationPlanManager buildingId="D4" client={api} onPlansChange={() => {}} />);
    await screen.findByLabelText("기준안 계획 이름");
    view.rerender(<InstallationPlanManager buildingId="D4" client={api} onPlansChange={() => {}} />);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
  });

  it("reloads plan details after an editor save revision", async () => {
    const api = client();
    const view = render(<InstallationPlanManager buildingId="D4" client={api} refreshKey={0} />);
    await screen.findByLabelText("기준안 계획 이름");
    view.rerender(<InstallationPlanManager buildingId="D4" client={api} refreshKey={1} />);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it("clears parent state on a building switch and isolates a late prior load from the new failure", async () => {
    let resolveD4;
    const d4Plans = new Promise((resolve) => { resolveD4 = resolve; });
    const api = {
      list: vi.fn((buildingId) => buildingId === "D4" ? d4Plans : Promise.reject(new Error("D5 조회 실패"))),
      getRepresentative: vi.fn().mockResolvedValue(null),
    };
    const onPlansChange = vi.fn();
    const onRepresentativeChange = vi.fn();
    const view = render(<InstallationPlanManager buildingId="D4" client={api} onPlansChange={onPlansChange} onRepresentativeChange={onRepresentativeChange} />);
    await waitFor(() => expect(api.list).toHaveBeenCalledWith("D4", expect.anything()));

    view.rerender(<InstallationPlanManager buildingId="D5" client={api} onPlansChange={onPlansChange} onRepresentativeChange={onRepresentativeChange} />);
    expect((await screen.findByRole("alert")).textContent).toContain("D5 조회 실패");
    await act(async () => { resolveD4(plans); });

    expect(onPlansChange).not.toHaveBeenCalledWith(plans);
    expect(onPlansChange).toHaveBeenLastCalledWith([]);
    expect(onRepresentativeChange).toHaveBeenLastCalledWith(null);
  });

  it("rejects mismatched representative identity before publishing any loaded context", async () => {
    const api = client();
    api.getRepresentative.mockResolvedValue({ buildingId: "D5", installationPlanId: "plan-1", selectedAt: null });
    const onPlansChange = vi.fn();
    const onRepresentativeChange = vi.fn();
    render(<InstallationPlanManager buildingId="D4" client={api} onPlansChange={onPlansChange} onRepresentativeChange={onRepresentativeChange} />);

    expect((await screen.findByRole("alert")).textContent).toContain("requested building must match");
    expect(onPlansChange).not.toHaveBeenCalledWith(plans);
    expect(onPlansChange).toHaveBeenLastCalledWith([]);
    expect(onRepresentativeChange).toHaveBeenLastCalledWith(null);
  });

  it.each([
    ["create", "새 설치 계획", "create"],
    ["rename", "대안 이름 저장", "update"],
    ["copy", "대안 복사", "copy"],
    ["representative", "대안 대표로 지정", "setRepresentative"],
    ["clear representative", "기준안 대표 해제", "unsetRepresentative"],
    ["delete", "대안 삭제", "remove"],
  ])("aborts and ignores a stale %s mutation after a building change", async (label, buttonName, method) => {
    const user = userEvent.setup();
    let resolveMutation;
    const mutation = new Promise((resolve) => { resolveMutation = resolve; });
    const api = client();
    api.list.mockImplementation(async (buildingId) => plans.map((plan) => ({ ...plan, buildingId })));
    api.getRepresentative.mockImplementation(async (buildingId) => buildingId === "D4"
      ? { buildingId, installationPlanId: "plan-1", selectedAt: null }
      : null);
    api[method].mockReturnValueOnce(mutation);
    const onEditPlan = vi.fn();
    const onPlansChange = vi.fn();
    const onRepresentativeChange = vi.fn();
    const view = render(<InstallationPlanManager buildingId="D4" client={api} createPlanDraft={() => ({ name: "신규안", arrays })} onEditPlan={onEditPlan} onPlansChange={onPlansChange} onRepresentativeChange={onRepresentativeChange} />);
    await screen.findByLabelText("대안 계획 이름");
    if (method === "update") {
      await user.clear(screen.getByLabelText("대안 계획 이름"));
      await user.type(screen.getByLabelText("대안 계획 이름"), "변경안");
    }
    await user.click(screen.getByRole("button", { name: buttonName }));
    const options = api[method].mock.calls[0].at(-1);
    expect(options.signal.aborted).toBe(false);

    view.rerender(<InstallationPlanManager buildingId="D5" client={api} createPlanDraft={() => ({ name: "신규안", arrays })} onEditPlan={onEditPlan} onPlansChange={onPlansChange} onRepresentativeChange={onRepresentativeChange} />);
    expect(options.signal.aborted).toBe(true);
    const staleResult = method === "setRepresentative"
      ? { buildingId: "D4", installationPlanId: "plan-2", selectedAt: null }
      : method === "create" || method === "copy"
        ? { ...plans[0], id: "plan-3" }
        : method === "update" ? { ...plans[1], name: "변경안" } : undefined;
    await act(async () => { resolveMutation(staleResult); });
    await waitFor(() => expect(onPlansChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ buildingId: "D5" })])));

    expect(onEditPlan).not.toHaveBeenCalled();
    expect(onPlansChange).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ buildingId: "D4", id: "plan-3" })]));
    expect(onRepresentativeChange).not.toHaveBeenLastCalledWith(expect.objectContaining({ buildingId: "D4" }));
  });

  it("aborts an in-flight mutation on unmount", async () => {
    const user = userEvent.setup();
    const api = client();
    api.remove.mockReturnValue(new Promise(() => {}));
    const view = render(<InstallationPlanManager buildingId="D4" client={api} />);
    await user.click(await screen.findByRole("button", { name: "대안 삭제" }));
    const options = api.remove.mock.calls[0][1];
    view.unmount();
    expect(options.signal.aborted).toBe(true);
  });

  it("disables creation without an explicit draft provider", async () => {
    render(<InstallationPlanManager buildingId="D4" client={client()} />);
    await screen.findByLabelText("기준안 계획 이름");
    expect(screen.getByRole("button", { name: "새 설치 계획" }).disabled).toBe(true);
  });
});
