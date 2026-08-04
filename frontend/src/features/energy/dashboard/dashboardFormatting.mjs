function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function valueWithUnit(value, unit, digits) {
  return finite(value) ? `${value.toFixed(digits)} ${unit}` : "데이터 없음";
}
export const formatEnergy = (value) => valueWithUnit(value, "kWh", 1);
export const formatPower = (value) => valueWithUnit(value, "kW", 1);
export const formatIrradiance = (value) => finite(value) ? `${value.toFixed(0)} W/m²` : "데이터 없음";
export const formatPercent = (value) => finite(value) ? `${(value * 100).toFixed(1)}%` : "데이터 없음";
export const formatKrw = (value) => finite(value) ? `${Math.round(value).toLocaleString("ko-KR")}원` : "데이터 없음";
export const formatCarbon = (value) => valueWithUnit(value, "kgCO₂e", 1);
