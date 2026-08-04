const ASSUMPTION = Object.freeze({
  type: "simulation-assumption",
  quality: "predicted",
  calibration: "not-engineering-calibrated",
});

function profile(type, standbyKw, occupiedPlugKw) {
  return Object.freeze({
    id: `load-profile-${type}-v1`,
    standbyKw,
    occupiedPlugKw,
    assumption: ASSUMPTION,
  });
}

export const LOAD_PROFILE_ASSUMPTIONS = Object.freeze({
  classroom: profile("classroom", 0.2, 0.4),
  computer_lab: profile("computer_lab", 0.8, 0.8),
  lab: profile("lab", 1, 2),
  faculty: profile("faculty", 0.4, 0.8),
  server: profile("server", 6, 0),
  shared: Object.freeze({
    lightingKwBySize: Object.freeze({ small: 0.6, medium: 1, large: 1.5 }),
    computerKwEach: 0.15,
    largeScreenKw: 0.3,
    occupiedHvacKwEach: 2.5,
    serverHvacKwEach: 1.25,
    assumption: ASSUMPTION,
  }),
});

export const DEMAND_ASSUMPTION = ASSUMPTION;
