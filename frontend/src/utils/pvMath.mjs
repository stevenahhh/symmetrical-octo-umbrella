export const DEFAULT_ROOF_RATIO = 20;
export const DEFAULT_SYSTEM_LOSS = 10;
export const DEFAULT_MODULE_EFFICIENCY = 20;
export const DEFAULT_MAY_SPECIFIC_YIELD = 171.59;

export function calculateMayPvOutput({
  roofArea = 0,
  roofRatio = DEFAULT_ROOF_RATIO,
  moduleEfficiency = DEFAULT_MODULE_EFFICIENCY,
  systemLoss = DEFAULT_SYSTEM_LOSS,
  maySpecificYield = DEFAULT_MAY_SPECIFIC_YIELD,
}) {
  const safeRoofArea = Number.isFinite(roofArea) ? Math.max(0, roofArea) : 0;
  const usableRoofRatio = Number.isFinite(roofRatio)
    ? Math.min(Math.max(roofRatio, 0), 100) / 100
    : DEFAULT_ROOF_RATIO / 100;
  const efficiencyRatio = Number.isFinite(moduleEfficiency)
    ? Math.min(Math.max(moduleEfficiency, 0), 100) / 100
    : DEFAULT_MODULE_EFFICIENCY / 100;
  const systemLossRatio = Number.isFinite(systemLoss)
    ? Math.min(Math.max(systemLoss, 0), 100) / 100
    : DEFAULT_SYSTEM_LOSS / 100;
  const specificYield = Number.isFinite(maySpecificYield)
    ? Math.max(0, maySpecificYield)
    : DEFAULT_MAY_SPECIFIC_YIELD;

  const moduleArea = safeRoofArea * usableRoofRatio;
  const nominalPowerKw = moduleArea * efficiencyRatio;
  const monthlyOutput = nominalPowerKw * specificYield * (1 - systemLossRatio);

  return {
    moduleArea,
    nominalPowerKw,
    monthlyOutput,
  };
}
