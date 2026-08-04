export const D4_ROOF_SOURCE_BASELINE = Object.freeze({
  sectionWingWidthSceneUnits: 3.25,
  sectionWingDepthSceneUnits: 4.3,
  vworldWingLongitudeSpanDegrees: 0.00034,
  vworldWingLatitudeSpanDegrees: 0.00046,
});

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
            { xMeters: 0, yMeters: 0 },
            { xMeters: 31, yMeters: 0 },
            { xMeters: 31, yMeters: 51.2 },
            { xMeters: 0, yMeters: 51.2 },
          ],
        },
      ],
      obstacles: [
        {
          id: "D4-roof-west-stairwell",
          roofZoneId: "D4-roof-west-main",
          polygonMeters: [
            { xMeters: 2, yMeters: 20 },
            { xMeters: 6, yMeters: 20 },
            { xMeters: 6, yMeters: 26 },
            { xMeters: 2, yMeters: 26 },
          ],
        },
      ],
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
          originMeters: { xMeters: 10, yMeters: 10 },
          rows: 2,
          columns: 8,
          azimuthDeg: 180,
          tiltDeg: 25,
          orientation: "portrait",
        },
      ],
    },
  ],
});
