/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", async () => {
  const React = await import("react");
  return { Canvas: ({ children }) => <div data-testid="room-canvas">{React.Children.toArray(children).filter((child) => child.props?.onSelectRoom)}</div> };
});
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null, Html: ({ children }) => <>{children}</> }));
vi.mock("../components/BuildingSectionView", () => ({ BuildingSectionView: ({ onSelectRoom }) => <button onClick={() => onSelectRoom("d4-204")}>204호 선택</button> }));
vi.mock("../features/energy/editor/RoofEditor", () => ({ RoofEditor: () => <div>옥상 설치 편집기</div> }));
import { D4SectionExperience } from "./D4SectionExperience";

afterEach(cleanup);

describe("D4SectionExperience modes", () => {
  it("preserves room selection while installation mode remains separate", async () => {
    const user = userEvent.setup();
    render(<D4SectionExperience onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "204호 선택" }));
    expect(screen.getByRole("heading", { name: "D4 204" })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "태양광 설치" }));
    expect(screen.getByText("옥상 설치 편집기")).toBeTruthy();
    expect(screen.queryByTestId("room-canvas")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "공간 탐색" }));
    expect(screen.getByRole("heading", { name: "D4 204" })).toBeTruthy();
  });
});
