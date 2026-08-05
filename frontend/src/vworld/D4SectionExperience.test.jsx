/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", async () => {
  const React = await import("react");
  return { Canvas: ({ children }) => <div data-testid="room-canvas">{React.Children.toArray(children).filter((child) => child.props?.onSelectRoom)}</div> };
});
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null, Html: ({ children }) => <>{children}</> }));
vi.mock("../components/BuildingSectionView", () => ({ BuildingSectionView: ({ onSelectRoom }) => <button onClick={() => onSelectRoom("d4-left-21-204")}>204호 선택</button> }));
vi.mock("../features/energy/editor/RoofEditor", () => ({ RoofEditor: ({ installationPlanId, onPlanSaved }) => <div>옥상 설치 편집기 {installationPlanId}<button onClick={() => onPlanSaved?.({ id: installationPlanId })}>편집 저장</button></div> }));
vi.mock("../features/energy/installations/InstallationPlanManager", () => ({ InstallationPlanManager: ({ onEditPlan, onPlansChange, onRepresentativeChange }) => <div>설치 계획 관리자<button onClick={() => onEditPlan({ id: "plan-2" })}>대안 편집</button><button onClick={() => onPlansChange(["plan-2"])}>목록 발행</button><button onClick={() => onRepresentativeChange({ installationPlanId: "plan-2" })}>대표 발행</button></div> }));
import { D4SectionExperience } from "./D4SectionExperience";

afterEach(cleanup);

describe("D4SectionExperience modes", () => {
  it("preserves room selection while installation mode remains separate", async () => {
    const user = userEvent.setup();
    render(<D4SectionExperience onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "204호 선택" }));
    expect(screen.getByRole("heading", { name: "D4 21-204" })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "태양광 설치" }));
    expect(screen.getByText("설치 계획 관리자")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "대안 편집" }));
    expect(screen.getByText(/옥상 설치 편집기 plan-2/)).toBeTruthy();
    expect(screen.queryByTestId("room-canvas")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "공간 탐색" }));
    expect(screen.getByRole("heading", { name: "D4 21-204" })).toBeTruthy();
  });

  it("publishes plan list, representative, and editor save changes from building detail", async () => {
    const user = userEvent.setup();
    const onPlansChange = vi.fn();
    const onRepresentativeChange = vi.fn();
    const onPlanSaved = vi.fn();
    render(<D4SectionExperience onClose={vi.fn()} onPlansChange={onPlansChange} onRepresentativeChange={onRepresentativeChange} onPlanSaved={onPlanSaved} startInstallation />);
    await user.click(screen.getByRole("button", { name: "목록 발행" }));
    await user.click(screen.getByRole("button", { name: "대표 발행" }));
    await user.click(screen.getByRole("button", { name: "대안 편집" }));
    await user.click(screen.getByRole("button", { name: "편집 저장" }));
    expect(onPlansChange).toHaveBeenCalledWith(["plan-2"]);
    expect(onRepresentativeChange).toHaveBeenCalledWith({ installationPlanId: "plan-2" });
    expect(onPlanSaved).toHaveBeenCalledWith({ id: "plan-2" });
  });
});
