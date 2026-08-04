export function computeFeelsLike(tempC, humidityPct, windSpeedMs) {
  if (!Number.isFinite(tempC)) return null;

  if (tempC >= 27 && Number.isFinite(humidityPct)) {
    const tempF = tempC * 9 / 5 + 32;
    const heatIndexF =
      -42.379 +
      2.04901523 * tempF +
      10.14333127 * humidityPct -
      0.22475541 * tempF * humidityPct -
      0.00683783 * tempF * tempF -
      0.05481717 * humidityPct * humidityPct +
      0.00122874 * tempF * tempF * humidityPct +
      0.00085282 * tempF * humidityPct * humidityPct -
      0.00000199 * tempF * tempF * humidityPct * humidityPct;
    return Math.round(((heatIndexF - 32) * 5 / 9) * 10) / 10;
  }

  if (tempC <= 10 && Number.isFinite(windSpeedMs) && windSpeedMs > 1.3) {
    const windKmh = windSpeedMs * 3.6;
    const windChill =
      13.12 + 0.6215 * tempC - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * tempC * Math.pow(windKmh, 0.16);
    return Math.round(windChill * 10) / 10;
  }

  return Math.round(tempC * 10) / 10;
}
