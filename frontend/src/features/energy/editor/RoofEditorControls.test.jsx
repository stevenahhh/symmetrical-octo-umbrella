/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoofEditorControls } from "./RoofEditorControls.jsx";

expect.extend({});
afterEach(cleanup);
const selectedArray = { id: "D4-array-1", originMeters: { xMeters: 10, yMeters: 12 }, rows: 2, columns: 8, azimuthDeg: 180, tiltDeg: 25, orientation: "portrait" };
const summary = { arrayCount: 1, moduleCount: 16, areaSquareMeters: 35.28, capacityKwp: 7.056 };

describe("RoofEditorControls", () => {
  it("keeps every editor action keyboard-focusable and emits field edits", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<RoofEditorControls selectedArray={selectedArray} summary={summary} canSave status="idle" violations={[]} onAdd={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onUndo={vi.fn()} onSave={vi.fn()} canUndo />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "태양광 배열 추가" }));
    fireEvent.change(screen.getByLabelText("열 수"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("가로 위치"), { target: { value: "14.5" } });
    fireEvent.change(screen.getByLabelText("세로 위치"), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText("방위각"), { target: { value: "135" } });
    await user.click(screen.getByRole("button", { name: "가로형" }));
    expect(onUpdate).toHaveBeenCalledWith({ columns: 6 });
    expect(onUpdate).toHaveBeenCalledWith({ originMeters: { xMeters: 14.5, yMeters: 12 } });
    expect(onUpdate).toHaveBeenCalledWith({ originMeters: { xMeters: 10, yMeters: 18 } });
    expect(onUpdate).toHaveBeenCalledWith({ azimuthDeg: 135 });
    expect(onUpdate).toHaveBeenCalledWith({ orientation: "landscape" });
    expect(screen.getByText("16장")).toBeTruthy();
  });

  it("exposes the selected array through a visible and semantic pressed state", () => {
    const arrays = [selectedArray, { ...selectedArray, id: "D4-array-2" }];
    render(<RoofEditorControls arrays={arrays} selectedArray={selectedArray} summary={summary} canSave status={{ kind: "idle", message: "" }} violations={[]} onAdd={vi.fn()} onSelect={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onUndo={vi.fn()} onSave={vi.fn()} canUndo />);
    expect(screen.getByRole("button", { name: "배열 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "배열 2" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("labels a seeded recommendation editor with its matching building", () => {
    render(<RoofEditorControls buildingId="D3" selectedArray={selectedArray} summary={summary} canSave status="idle" violations={[]} onAdd={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onUndo={vi.fn()} onSave={vi.fn()} canUndo />);
    expect(screen.getByRole("heading", { name: "D3 옥상 태양광" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "D4 옥상 태양광" })).toBeNull();
  });

  it("announces Korean invalid feedback and disables save", () => {
    render(<RoofEditorControls selectedArray={selectedArray} summary={summary} canSave={false} status="idle" violations={[{ messageKo: "옥상 가장자리에서 0.50m 이상 떨어져야 합니다." }]} onAdd={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onUndo={vi.fn()} onSave={vi.fn()} canUndo />);
    expect(screen.getByRole("alert").textContent).toContain("옥상 가장자리");
    expect(screen.getByRole("button", { name: "배치 저장" }).disabled).toBe(true);
  });
});
