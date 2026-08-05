import assert from "node:assert/strict";
import test from "node:test";
import { formatEnergy, formatPercent, formatPower, formatIrradiance } from "./dashboardFormatting.mjs";

test("formats exact dashboard units and never turns unavailable data into zero", () => {
  assert.equal(formatEnergy(12.345), "12.3 kWh");
  assert.equal(formatPower(8), "8.0 kW");
  assert.equal(formatIrradiance(812), "812 W/m²");
  assert.equal(formatPercent(0.229), "22.9%");
  assert.equal(formatEnergy(null), "데이터 없음");
  assert.equal(formatEnergy(Number.NaN), "데이터 없음");
});
