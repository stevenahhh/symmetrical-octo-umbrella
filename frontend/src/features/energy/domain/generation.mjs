import { CAMPUS_LOCATION, getSunState } from "../../../utils/sunPosition.mjs";

export const GENERATION_INTERVAL_MINUTES = 15;
export const MODULE_CAPACITY_KWP = 0.441;
export const DEFAULT_SYSTEM_LOSS_FRACTION = 0.1;
export const DEFAULT_SHADING_FACTOR = 1;
export const TEMPERATURE_COEFFICIENT_PER_C = -0.004;

const CELL_TEMPERATURE_REFERENCE_C = 25;
const NOMINAL_OPERATING_CELL_TEMPERATURE_C = 45;
const NOMINAL_AMBIENT_TEMPERATURE_C = 20;
const NOMINAL_IRRADIANCE_W_M2 = 800;
const INTERVAL_MILLISECONDS = GENERATION_INTERVAL_MINUTES * 60 * 1000;
const ISO_TIMESTAMP = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?<offset>Z|(?<offsetSign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/;
const SOURCES = new Set(["scenario", "estimated"]);

export class GenerationInputError extends TypeError {
  constructor(field, code, message) {
    super(`${field}: ${message}`);
    this.name = "GenerationInputError";
    this.field = field;
    this.code = code;
    this.errors = [{ field, code, message }];
  }
}

const fail = (field, code, message) => {
  throw new GenerationInputError(field, code, message);
};

function object(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(field, "object", "must be an object");
  }
  return value;
}

function knownKeys(value, allowed, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${field}.${key}`, "unknown_field", "is not part of this input contract");
  }
}

function nonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(field, "non_empty_string", "must be a non-empty string");
  }
  return value;
}

function finite(value, field) {
  if (!Number.isFinite(value)) fail(field, "finite_number", "must be a finite number");
  return value;
}

function parseTimestamp(value, field) {
  const match = typeof value === "string" ? ISO_TIMESTAMP.exec(value) : null;
  if (!match) fail(field, "iso_timestamp", "must include seconds and a UTC offset");
  const names = ["year", "month", "day", "hour", "minute", "second", "offsetHour", "offsetMinute"];
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = names.map((name) => Number(match.groups[name] ?? 0));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const inRange = (number, minimum, maximum) => number >= minimum && number <= maximum;
  const validOffset = match.groups.offset === "Z"
    || (inRange(offsetHour, 0, 23) && inRange(offsetMinute, 0, 59));
  if (!inRange(year, 0, 9999) || !inRange(month, 1, 12) || !inRange(day, 1, daysInMonth)
    || !inRange(hour, 0, 23) || !inRange(minute, 0, 59) || !inRange(second, 0, 59) || !validOffset) {
    fail(field, "iso_timestamp", "must contain valid calendar, time, and offset components");
  }
  const timestampMilliseconds = Date.parse(value);
  if (!Number.isFinite(timestampMilliseconds)) fail(field, "iso_timestamp", "must be a valid timestamp");
  return timestampMilliseconds;
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(field, "positive_integer", "must be a safe integer of at least 1");
  }
  return value;
}

const clampFactor = (value) => Math.min(Math.max(value, 0), 1);

function parseArrays(scenario) {
  const input = object(scenario, "scenario");
  const scenarioId = nonEmptyString(input.id, "scenario.id");
  if (!Array.isArray(input.arrays)) fail("scenario.arrays", "array", "must be an array");
  const seen = new Set();
  const arrays = input.arrays.map((value, index) => {
    const field = `scenario.arrays[${index}]`;
    const array = object(value, field);
    const id = nonEmptyString(array.id, `${field}.id`);
    if (seen.has(id)) fail(`${field}.id`, "duplicate_id", `duplicates ${id}`);
    seen.add(id);
    const rows = positiveInteger(array.rows, `${field}.rows`);
    const columns = positiveInteger(array.columns, `${field}.columns`);
    const moduleCount = rows * columns;
    if (!Number.isSafeInteger(moduleCount)) fail(field, "module_count_overflow", "rows times columns is too large");
    const azimuthDeg = finite(array.azimuthDeg, `${field}.azimuthDeg`);
    const tiltDeg = finite(array.tiltDeg, `${field}.tiltDeg`);
    if (azimuthDeg < 0 || azimuthDeg >= 360) fail(`${field}.azimuthDeg`, "range", "must be in [0, 360)");
    if (tiltDeg < 0 || tiltDeg > 45) fail(`${field}.tiltDeg`, "range", "must be in [0, 45]");
    return { id, moduleCount, azimuthDeg, tiltDeg };
  });
  return { scenarioId, arrays };
}

function parseProvenance(slot, field) {
  if (!SOURCES.has(slot.source)) fail(`${field}.source`, "source", "must be scenario or estimated");
  const fieldSources = object(slot.field_sources, `${field}.field_sources`);
  return {
    source: slot.source,
    qualityText: nonEmptyString(slot.quality_text, `${field}.quality_text`),
    fieldSources: { ...fieldSources },
  };
}

function parseWeatherSeries(weatherSeries) {
  const input = object(weatherSeries, "weatherSeries");
  if (input.status !== "available") fail("weatherSeries.status", "weather_unavailable", "must be available");
  if (!SOURCES.has(input.source)) fail("weatherSeries.source", "source", "must be scenario or estimated");
  if (input.scenario_id !== null) nonEmptyString(input.scenario_id, "weatherSeries.scenario_id");
  if (!Array.isArray(input.intervals) || input.intervals.length === 0) {
    fail("weatherSeries.intervals", "non_empty_array", "must contain at least one interval");
  }

  let previousTimestamp = null;
  const slots = input.intervals.map((value, index) => {
    const field = `weatherSeries.intervals[${index}]`;
    const slot = object(value, field);
    const timestampMilliseconds = parseTimestamp(slot.timestamp, `${field}.timestamp`);
    if (previousTimestamp !== null && timestampMilliseconds - previousTimestamp !== INTERVAL_MILLISECONDS) {
      fail(`${field}.timestamp`, "invalid_interval_spacing", "must follow the prior timestamp by exactly 15 minutes");
    }
    previousTimestamp = timestampMilliseconds;
    const irradianceWm2 = finite(slot.global_irradiance_w_m2, `${field}.global_irradiance_w_m2`);
    if (irradianceWm2 < 0) fail(`${field}.global_irradiance_w_m2`, "negative_irradiance", "must be zero or greater");
    const cloudFactor = finite(slot.cloud_factor, `${field}.cloud_factor`);
    if (cloudFactor < 0 || cloudFactor > 1) fail(`${field}.cloud_factor`, "range", "must be in [0, 1]");
    const solarAltitudeDeg = finite(slot.solar_altitude_deg, `${field}.solar_altitude_deg`);
    if (solarAltitudeDeg < -90 || solarAltitudeDeg > 90) fail(`${field}.solar_altitude_deg`, "range", "must be in [-90, 90]");
    const sunState = getSunState({ date: new Date(timestampMilliseconds), ...CAMPUS_LOCATION });
    const sunAzimuthDeg = (sunState.azimuth * 180 / Math.PI + 540) % 360;
    return {
      timestamp: slot.timestamp,
      ambientTemperatureC: finite(slot.ambient_temperature_c, `${field}.ambient_temperature_c`),
      irradianceWm2,
      solarAltitudeDeg,
      sunAzimuthDeg,
      provenance: parseProvenance(slot, field),
    };
  });

  return {
    slots,
    provenance: {
      source: input.source,
      weatherScenarioId: input.scenario_id,
      locationId: nonEmptyString(input.location_id, "weatherSeries.location_id"),
      timeZone: nonEmptyString(input.timezone, "weatherSeries.timezone"),
      qualityText: nonEmptyString(input.quality_text, "weatherSeries.quality_text"),
    },
  };
}

function incidenceFactor(slot, array) {
  if (slot.solarAltitudeDeg <= 0) return 0;
  const altitude = slot.solarAltitudeDeg * Math.PI / 180;
  const tilt = array.tiltDeg * Math.PI / 180;
  const azimuthDifference = (slot.sunAzimuthDeg - array.azimuthDeg) * Math.PI / 180;
  const incidence = Math.sin(altitude) * Math.cos(tilt)
    + Math.cos(altitude) * Math.sin(tilt) * Math.cos(azimuthDifference);
  return clampFactor(incidence);
}

function copyProvenance(provenance) {
  return {
    source: provenance.source,
    qualityText: provenance.qualityText,
    fieldSources: { ...provenance.fieldSources },
  };
}

function sumEnergy(values, field) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total)) fail(field, "numeric_overflow", "calculated energy is too large");
  return total;
}

function shadingFactors(value, arrays) {
  const input = value === undefined ? {} : object(value, "shadingFactorsByArrayId");
  const arrayIds = new Set(arrays.map(({ id }) => id));
  for (const id of Object.keys(input)) {
    if (!arrayIds.has(id)) fail(`shadingFactorsByArrayId.${id}`, "unknown_array", "must identify a scenario array");
  }
  return new Map(arrays.map(({ id }) => [
    id,
    clampFactor(input[id] === undefined ? DEFAULT_SHADING_FACTOR : finite(input[id], `shadingFactorsByArrayId.${id}`)),
  ]));
}

export function calculateLayoutGeneration(value) {
  const input = object(value, "input");
  knownKeys(input, ["scenario", "weatherSeries", "systemLossFraction", "shadingFactorsByArrayId"], "input");
  const { scenarioId, arrays } = parseArrays(input.scenario);
  const weather = parseWeatherSeries(input.weatherSeries);
  const loss = input.systemLossFraction === undefined
    ? DEFAULT_SYSTEM_LOSS_FRACTION
    : finite(input.systemLossFraction, "systemLossFraction");
  const systemLossFactor = clampFactor(1 - loss);
  const shadingByArrayId = shadingFactors(input.shadingFactorsByArrayId, arrays);

  const arrayResults = arrays.map((array, arrayIndex) => {
    const capacityKwp = array.moduleCount * MODULE_CAPACITY_KWP;
    const slots = weather.slots.map((weatherSlot, slotIndex) => {
      const incidence = incidenceFactor(weatherSlot, array);
      const poaIrradianceWm2 = weatherSlot.irradianceWm2 * incidence;
      const poaIrradianceKwhM2 = poaIrradianceWm2 * GENERATION_INTERVAL_MINUTES / 60 / 1000;
      const cellTemperatureC = weatherSlot.ambientTemperatureC
        + poaIrradianceWm2 * (NOMINAL_OPERATING_CELL_TEMPERATURE_C - NOMINAL_AMBIENT_TEMPERATURE_C)
          / NOMINAL_IRRADIANCE_W_M2;
      const temperatureFactor = clampFactor(
        1 + TEMPERATURE_COEFFICIENT_PER_C * Math.max(cellTemperatureC - CELL_TEMPERATURE_REFERENCE_C, 0),
      );
      const shadingFactor = shadingByArrayId.get(array.id);
      const energyKwh = capacityKwp * poaIrradianceKwhM2 * temperatureFactor
        * systemLossFactor * shadingFactor;
      if (!Number.isFinite(energyKwh) || energyKwh < 0) {
        fail(`scenario.arrays[${arrayIndex}].slots[${slotIndex}]`, "numeric_overflow", "calculated energy must be finite and nonnegative");
      }
      return {
        timestamp: weatherSlot.timestamp,
        energyKwh,
        globalIrradianceWm2: weatherSlot.irradianceWm2,
        poaIrradianceWm2,
        poaIrradianceKwhM2,
        cellTemperatureC,
        sun: { altitudeDeg: weatherSlot.solarAltitudeDeg, azimuthDeg: weatherSlot.sunAzimuthDeg },
        factorBreakdown: { incidenceFactor: incidence, temperatureFactor, systemLossFactor, shadingFactor },
        provenance: copyProvenance(weatherSlot.provenance),
      };
    });
    return {
      arrayId: array.id,
      moduleCount: array.moduleCount,
      capacityKwp,
      energyUnit: "kWh",
      slots,
      totalEnergyKwh: sumEnergy(slots.map(({ energyKwh }) => energyKwh), `arrays[${arrayIndex}].totalEnergyKwh`),
    };
  });

  const slots = weather.slots.map((weatherSlot, index) => ({
    timestamp: weatherSlot.timestamp,
    energyKwh: sumEnergy(arrayResults.map((array) => array.slots[index].energyKwh), `slots[${index}].energyKwh`),
    provenance: copyProvenance(weatherSlot.provenance),
  }));
  return {
    scenarioId,
    intervalMinutes: GENERATION_INTERVAL_MINUTES,
    energyUnit: "kWh",
    provenance: { ...weather.provenance },
    arrays: arrayResults,
    slots,
    totalEnergyKwh: sumEnergy(arrayResults.map(({ totalEnergyKwh }) => totalEnergyKwh), "totalEnergyKwh"),
  };
}
