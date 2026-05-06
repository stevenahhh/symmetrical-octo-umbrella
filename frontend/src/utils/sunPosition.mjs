import SunCalc from "suncalc";

export const CAMPUS_LOCATION = {
  latitude: 34.97,
  longitude: 127.476,
};

export function clampDateParts({ month, day, hour, minute }) {
  const safeMonth = Math.min(Math.max(month, 1), 12);
  const daysInMonth = new Date(2026, safeMonth, 0).getDate();

  return {
    month: safeMonth,
    day: Math.min(Math.max(day, 1), daysInMonth),
    hour: Math.min(Math.max(hour, 0), 23),
    minute: Math.min(Math.max(minute, 0), 59),
  };
}

export function createSimulationDate(parts, year = new Date().getFullYear()) {
  const { month, day, hour, minute } = clampDateParts(parts);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function getSunState({ date, latitude, longitude }) {
  const { altitude, azimuth } = SunCalc.getPosition(date, latitude, longitude);
  const visible = altitude > 0;

  return {
    altitude,
    azimuth,
    visible,
  };
}

export function getSunVector({ altitude, azimuth, distance = 220 }) {
  const x = Math.sin(azimuth) * Math.cos(altitude) * distance;
  const y = Math.sin(altitude) * distance;
  const z = Math.cos(azimuth) * Math.cos(altitude) * distance;

  return [x, y, z];
}
