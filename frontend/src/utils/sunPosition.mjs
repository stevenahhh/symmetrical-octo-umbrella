import SunCalc from "suncalc";

export const CAMPUS_LOCATION = {
  latitude: 34.97,
  longitude: 127.476,
};

export const SIMULATION_TIME_ZONE = "Asia/Seoul";

const DEFAULT_SIMULATION_YEAR = 2026;
const SEOUL_UTC_OFFSET_HOURS = 9;

function clampFinite(value, minimum, maximum, fallback = minimum) {
  return Number.isFinite(value)
    ? Math.min(Math.max(value, minimum), maximum)
    : fallback;
}

export function clampDateParts(
  { month, day, hour, minute },
  year = DEFAULT_SIMULATION_YEAR,
) {
  const safeYear = Number.isInteger(year) ? year : DEFAULT_SIMULATION_YEAR;
  const safeMonth = clampFinite(month, 1, 12);
  const daysInMonth = new Date(Date.UTC(safeYear, safeMonth, 0)).getUTCDate();

  return {
    month: safeMonth,
    day: clampFinite(day, 1, daysInMonth),
    hour: clampFinite(hour, 0, 23),
    minute: clampFinite(minute, 0, 59),
  };
}

export function createSimulationDate(parts, year = new Date().getFullYear()) {
  const safeYear = Number.isInteger(year) ? year : DEFAULT_SIMULATION_YEAR;
  const { month, day, hour, minute } = clampDateParts(parts, safeYear);
  const utcMilliseconds = Date.UTC(
    safeYear,
    month - 1,
    day,
    hour - SEOUL_UTC_OFFSET_HOURS,
    minute,
    0,
    0,
  );

  return new Date(utcMilliseconds);
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
