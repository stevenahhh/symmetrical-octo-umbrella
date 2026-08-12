export const D4_ROOF_SOURCE_BASELINE = Object.freeze({
  sectionWingWidthSceneUnits: 3.25,
  sectionWingDepthSceneUnits: 4.3,
  vworldWingLongitudeSpanDegrees: 0.00034,
  vworldWingLatitudeSpanDegrees: 0.00046,
});

// Satellite-photo traced D4 footprint and north-roof equipment. Coordinates are
// roof-local metres: south is y=0 and the marked installable roof is at the north end.
export const D4_BUILDING_FOOTPRINT = Object.freeze([
  { xMeters: 0, yMeters: 0 },
  { xMeters: 31, yMeters: 0 },
  { xMeters: 31, yMeters: 84 }, { xMeters: 27, yMeters: 84 },
  { xMeters: 27, yMeters: 88 }, { xMeters: 10, yMeters: 88 },
  { xMeters: 10, yMeters: 84 }, { xMeters: 0, yMeters: 84 },
]);

export const D4_ROOF_EQUIPMENT = Object.freeze([
  { id: "D4-roof-north-platform", polygonMeters: [
    { xMeters: 2, yMeters: 57 }, { xMeters: 29, yMeters: 57 },
    { xMeters: 29, yMeters: 84 }, { xMeters: 2, yMeters: 84 },
  ], heightMeters: 0.28, color: "#8b8172" },
  { id: "D4-roof-north-skylight", polygonMeters: [
    { xMeters: 11, yMeters: 64 }, { xMeters: 20.5, yMeters: 64 },
    { xMeters: 20.5, yMeters: 81 }, { xMeters: 11, yMeters: 81 },
  ], heightMeters: 1.15, color: "#617d85" },
  { id: "D4-roof-north-plant-upper", polygonMeters: Array.from({ length: 16 }, (_, index) => {
    const angle = index * Math.PI * 2 / 16;
    return { xMeters: 8 + Math.cos(angle) * 2, yMeters: 70.5 + Math.sin(angle) * 2 };
  }), heightMeters: 1.15, color: "#29323b" },
  { id: "D4-roof-north-plant-lower", polygonMeters: Array.from({ length: 16 }, (_, index) => {
    const angle = index * Math.PI * 2 / 16;
    return { xMeters: 8 + Math.cos(angle) * 1.8, yMeters: 65.5 + Math.sin(angle) * 1.8 };
  }), heightMeters: 1, color: "#252f38" },
  { id: "D4-roof-north-south-block", polygonMeters: [
    { xMeters: 3.2, yMeters: 57.8 }, { xMeters: 20.7, yMeters: 57.8 },
    { xMeters: 20.7, yMeters: 64 }, { xMeters: 3.2, yMeters: 64 },
  ], heightMeters: 0.82, color: "#968f82" },
  { id: "D4-roof-north-existing-array", polygonMeters: [
    { xMeters: 22.4, yMeters: 77 }, { xMeters: 27, yMeters: 77 },
    { xMeters: 27, yMeters: 81.2 }, { xMeters: 22.4, yMeters: 81.2 },
  ], heightMeters: 0.7, color: "#34495e" },
  { id: "D4-roof-center-dome", polygonMeters: Array.from({ length: 20 }, (_, index) => {
    const angle = index * Math.PI * 2 / 20;
    return { xMeters: 15.5 + Math.cos(angle) * 3.2, yMeters: 49 + Math.sin(angle) * 3.2 };
  }), heightMeters: 1.55, color: "#b7653b" },
  { id: "D4-roof-south-skylight", polygonMeters: [
    { xMeters: 9.2, yMeters: 13 }, { xMeters: 20.5, yMeters: 13 },
    { xMeters: 20.5, yMeters: 38 }, { xMeters: 9.2, yMeters: 38 },
  ], heightMeters: 1.05, color: "#58737d" },
  { id: "D4-roof-south-left-frame", polygonMeters: [
    { xMeters: 3.8, yMeters: 12 }, { xMeters: 8.5, yMeters: 12 },
    { xMeters: 8.5, yMeters: 38 }, { xMeters: 3.8, yMeters: 38 },
  ], heightMeters: 0.48, color: "#283440" },
  { id: "D4-roof-south-right-frame", polygonMeters: [
    { xMeters: 21.2, yMeters: 12 }, { xMeters: 26.8, yMeters: 12 },
    { xMeters: 26.8, yMeters: 38 }, { xMeters: 21.2, yMeters: 38 },
  ], heightMeters: 0.48, color: "#382f2d" },
  { id: "D4-roof-south-head", polygonMeters: [
    { xMeters: 8, yMeters: 36 }, { xMeters: 21.7, yMeters: 36 },
    { xMeters: 21.7, yMeters: 42 }, { xMeters: 8, yMeters: 42 },
  ], heightMeters: 0.72, color: "#8f8a80" },
  { id: "D4-roof-north-cap", polygonMeters: [
    { xMeters: 10, yMeters: 84 }, { xMeters: 27, yMeters: 84 },
    { xMeters: 27, yMeters: 88 }, { xMeters: 10, yMeters: 88 },
  ], heightMeters: 0.65, color: "#928a7d" },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `D4-roof-south-skylight-rib-${index}`,
    polygonMeters: [
      { xMeters: 9.25, yMeters: 15 + index * 2.75 }, { xMeters: 20.45, yMeters: 15 + index * 2.75 },
      { xMeters: 20.45, yMeters: 15.22 + index * 2.75 }, { xMeters: 9.25, yMeters: 15.22 + index * 2.75 },
    ],
    heightMeters: 1.12,
    color: "#9fb3b7",
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `D4-roof-north-skylight-rib-${index}`,
    polygonMeters: [
      { xMeters: 11.05, yMeters: 66 + index * 2.35 }, { xMeters: 20.45, yMeters: 66 + index * 2.35 },
      { xMeters: 20.45, yMeters: 66.2 + index * 2.35 }, { xMeters: 11.05, yMeters: 66.2 + index * 2.35 },
    ],
    heightMeters: 1.22,
    color: "#a6b6b8",
  })),
]);

export const D4_ROOF_SCENARIO_FIXTURE = Object.freeze({
  schemaVersion: 1,
  coordinateSystem: "roof-local-meters",
  layoutRules: {
    interPanelGapMeters: 0.02,
    roofEdgeMarginMeters: 0.5,
    obstacleClearanceMeters: 1,
  },
  modules: [
    {
      id: "module-default-441wp",
      widthMeters: 1.05,
      lengthMeters: 2.1,
      efficiencyPercent: 20,
      nominalPowerWp: 441,
    },
  ],
  roofs: [
    {
      id: "D4-roof-west",
      buildingId: "D4",
      zones: [
        {
          id: "D4-roof-west-main",
          polygonMeters: [
            { xMeters: 21, yMeters: 59 }, { xMeters: 28, yMeters: 59 },
            { xMeters: 28, yMeters: 76.5 }, { xMeters: 21, yMeters: 76.5 },
          ],
        },
        {
          id: "D4-roof-north-top-cement",
          polygonMeters: [
            { xMeters: 2.5, yMeters: 75 }, { xMeters: 10.5, yMeters: 75 },
            { xMeters: 10.5, yMeters: 83.5 }, { xMeters: 2.5, yMeters: 83.5 },
          ],
        },
        {
          id: "D4-roof-north-left-cement",
          polygonMeters: [
            { xMeters: 2.5, yMeters: 63.5 }, { xMeters: 5.8, yMeters: 63.5 },
            { xMeters: 5.8, yMeters: 75 }, { xMeters: 2.5, yMeters: 75 },
          ],
        },
        {
          id: "D4-roof-north-bottom-cement",
          polygonMeters: [
            { xMeters: 3.2, yMeters: 57.8 }, { xMeters: 20.7, yMeters: 57.8 },
            { xMeters: 20.7, yMeters: 63.5 }, { xMeters: 3.2, yMeters: 63.5 },
          ],
        },
      ],
      obstacles: [],
    },
  ],
  scenarios: [
    {
      id: "D4-scenario-south-2x8",
      buildingId: "D4",
      arrays: [
        {
          id: "D4-array-south-2x8",
          scenarioId: "D4-scenario-south-2x8",
          roofId: "D4-roof-west",
          roofZoneId: "D4-roof-west-main",
          moduleId: "module-default-441wp",
          originMeters: { xMeters: 24.5, yMeters: 67 },
          rows: 1,
          columns: 4,
          azimuthDeg: 90,
          tiltDeg: 25,
          orientation: "portrait",
        },
      ],
    },
  ],
});
