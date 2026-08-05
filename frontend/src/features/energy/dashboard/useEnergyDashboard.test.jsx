/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEnergyDashboard } from "./useEnergyDashboard.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function DashboardHarness({ client }) {
  const { retry } = useEnergyDashboard({
    buildingId: "D4",
    date: "2026-05-18",
    scenarioId: "scenario-a",
    client,
  });
  return <button onClick={retry}>Retry</button>;
}

afterEach(cleanup);

describe("useEnergyDashboard request cancellation", () => {
  it("aborts the active retry request when a later retry supersedes it", () => {
    const requests = [deferred(), deferred(), deferred()];
    const signals = [];
    const client = {
      load: vi.fn(({ signal }) => {
        signals.push(signal);
        return requests[signals.length - 1].promise;
      }),
    };

    render(<DashboardHarness client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(signals).toHaveLength(3);
    expect(signals[1].aborted).toBe(true);
    expect(signals[2].aborted).toBe(false);
  });

  it("aborts the active retry request on unmount", () => {
    const initial = deferred();
    const retry = deferred();
    const signals = [];
    const client = {
      load: vi.fn(({ signal }) => {
        signals.push(signal);
        return signals.length === 1 ? initial.promise : retry.promise;
      }),
    };

    const view = render(<DashboardHarness client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(signals[1].aborted).toBe(false);

    view.unmount();

    expect(signals[1].aborted).toBe(true);
  });
});
