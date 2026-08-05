/* @vitest-environment jsdom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createdIds: [],
  receivedBuildingIds: [],
  vw: null,
}));

vi.mock("./webglSdkLoader.mjs", () => ({ loadVWorldWebGlSdk: vi.fn(async () => mocks.vw) }));
vi.mock("./sunSimulation.mjs", () => ({ applyVWorldSunSimulation: vi.fn() }));
vi.mock("./VWorldCampusStatus", () => ({ VWorldCampusStatus: () => null }));
vi.mock("./RepresentativePlanOverlayController", () => ({
  RepresentativePlanOverlayController: ({ buildingIds, onOverlayDataChange }) => {
    useEffect(() => {
      mocks.receivedBuildingIds.push(...buildingIds);
      onOverlayDataChange([{
        buildingId: "D4",
        installationPlanId: "strict-plan",
        name: "StrictMode plan",
        arrays: [{
          id: "array-1",
          roofId: "D4-roof-west",
          roofZoneId: "D4-roof-west-main",
          footprintMeters: [
            { xMeters: 10, yMeters: 10 },
            { xMeters: 12, yMeters: 10 },
            { xMeters: 12, yMeters: 14 },
            { xMeters: 10, yMeters: 14 },
          ],
        }],
      }]);
      return () => onOverlayDataChange([]);
    }, [onOverlayDataChange]);
    return null;
  },
}));

import VWorldRenderer from "./VWorldRenderer.jsx";

class Geometry {
  setId(value) { this.id = value; }
  setName() {}
  setFillColor() {}
  setOutLineColor() {}
  setDistanceFromTerrain() {}
  setExtrudeHeight() {}
  setFont() {}
  setFontSize() {}
  setImage() {}
  create() { mocks.createdIds.push(this.id); }
}

function createVw() {
  class Collection { constructor(values) { this.values = values; } }
  class Coord { constructor(longitude, latitude) { this.longitude = longitude; this.latitude = latitude; } }
  class CoordZ extends Coord { constructor(longitude, latitude, height) { super(longitude, latitude); this.height = height; } }
  return {
    Collection,
    Coord,
    CoordZ,
    Color: class Color {},
    Direction: class Direction {},
    CameraPosition: class CameraPosition {},
    Map: vi.fn(() => { throw new Error("the retained map should be reused"); }),
    geom: {
      PolygonZ: class PolygonZ extends Geometry { constructor(collection) { super(); this.collection = collection; } },
      PointZ: class PointZ extends Geometry {},
    },
  };
}

function retainedMap() {
  return {
    getLayerElement: () => ({ hide: vi.fn() }),
    onClick: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    removeObjectById: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  delete window.__scnuVWorldMapInstance;
  mocks.createdIds.length = 0;
  mocks.receivedBuildingIds.length = 0;
});

describe("VWorldRenderer retained map integration", () => {
  it("rebinds a reused global map under StrictMode and renders the D4 representative polygon", async () => {
    mocks.vw = createVw();
    window.__scnuVWorldMapInstance = retainedMap();
    render(<StrictMode><VWorldRenderer onSelection={vi.fn()} simulationDate={new Date("2026-05-18T12:00:00+09:00")} /></StrictMode>);

    await waitFor(() => expect(mocks.createdIds).toContain("SCNU_REPRESENTATIVE_PANEL_strict-plan_array-1"));
    expect(mocks.vw.Map).not.toHaveBeenCalled();
    expect(new Set(mocks.receivedBuildingIds)).toEqual(new Set(["C1", "D1", "D2", "D3", "D4"]));
  });
});
