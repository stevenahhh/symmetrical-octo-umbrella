export const ENERGY_BALANCE_INTERVAL_MINUTES = 15;

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|([+-])(\d{2}):(\d{2}))$/;

export class EnergyBalanceInputError extends TypeError {
  constructor(field, code, message) {
    super(`${field}: ${message}`);
    this.name = "EnergyBalanceInputError";
    this.field = field;
    this.code = code;
    this.errors = [{ field, code, message }];
  }
}

const fail = (field, code, message) => { throw new EnergyBalanceInputError(field, code, message); };

function object(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(field, "object", "must be an object");
  return value;
}

function finiteNonnegative(value, field) {
  if (!Number.isFinite(value)) fail(field, "finite_number", "must be a finite number");
  if (value < 0) fail(field, "nonnegative_energy", "must be zero or greater");
  return value;
}

function parseTimestamp(value, field) {
  const match = typeof value === "string" ? ISO_TIMESTAMP.exec(value) : null;
  if (!match) fail(field, "iso_timestamp", "must be an ISO timestamp with a UTC offset");
  const [, y, mo, d, h, mi, s = "0", offset, , oh = "0", om = "0"] = match;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = [y, mo, d, h, mi, s, oh, om].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const validOffset = offset === "Z" || (offsetHour < 14 && offsetMinute <= 59) || (offsetHour === 14 && offsetMinute === 0);
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59 || !validOffset) {
    fail(field, "iso_timestamp", "must contain valid calendar, time, and offset components");
  }
  if (minute % ENERGY_BALANCE_INTERVAL_MINUTES !== 0 || second !== 0) fail(field, "timestamp_interval", "must be on a 15-minute boundary");
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) fail(field, "iso_timestamp", "must be a valid timestamp");
  return { originalTimestamp: value, instant };
}

function parseProvenance(demand, generation) {
  if (demand.quality !== "predicted") fail("demand.quality", "demand_quality", "must be predicted");
  object(demand.assumption, "demand.assumption");
  const weather = object(generation.provenance, "generation.provenance");
  if (typeof weather.source !== "string" || weather.source.length === 0) fail("generation.provenance.source", "weather_source", "must be present");
  return {
    demandProvenance: structuredClone({ quality: demand.quality, assumption: demand.assumption }),
    weatherProvenance: structuredClone(weather),
  };
}

function parseSeries(value, field) {
  const series = object(value, field);
  if (series.intervalMinutes !== ENERGY_BALANCE_INTERVAL_MINUTES) fail(`${field}.intervalMinutes`, "interval_minutes", "must be 15");
  if (series.energyUnit !== "kWh") fail(`${field}.energyUnit`, "energy_unit", "must be kWh");
  if (!Array.isArray(series.slots)) fail(`${field}.slots`, "array", "must be an array");
  return series.slots.map((candidate, index) => {
    const slotField = `${field}.slots[${index}]`;
    const slot = object(candidate, slotField);
    const result = { ...parseTimestamp(slot.timestamp, `${slotField}.timestamp`),
      energyKwh: finiteNonnegative(slot.energyKwh, `${slotField}.energyKwh`) };
    if (field === "generation") result.provenance = structuredClone(object(slot.provenance, `${slotField}.provenance`));
    return result;
  });
}

function parseRates(value) {
  const rates = object(value, "rates");
  return {
    electricityPriceKrwPerKwh: finiteNonnegative(rates.electricityPriceKrwPerKwh, "rates.electricityPriceKrwPerKwh"),
    carbonIntensityKgCo2ePerKwh: finiteNonnegative(rates.carbonIntensityKgCo2ePerKwh, "rates.carbonIntensityKgCo2ePerKwh"),
  };
}

function align(demand, generation) {
  const issues = [];
  if (demand.length === 0 && generation.length === 0) {
    issues.push({ code: "empty_energy_series", timestamp: "", canonicalTimestamp: "" });
  }
  const index = (slots, side) => {
    const result = new Map();
    for (const slot of slots) {
      if (result.has(slot.instant)) issues.push({ code: `duplicate_${side}_instant`, timestamp: slot.originalTimestamp,
        canonicalTimestamp: new Date(slot.instant).toISOString() });
      else result.set(slot.instant, slot);
    }
    return result;
  };
  const demandByInstant = index(demand, "demand");
  const generationByInstant = index(generation, "generation");
  for (const [instant, slot] of generationByInstant) if (!demandByInstant.has(instant)) {
    issues.push({ code: "missing_demand_slot", timestamp: slot.originalTimestamp, canonicalTimestamp: new Date(instant).toISOString() });
  }
  for (const [instant, slot] of demandByInstant) if (!generationByInstant.has(instant)) {
    issues.push({ code: "missing_generation_slot", timestamp: slot.originalTimestamp, canonicalTimestamp: new Date(instant).toISOString() });
  }
  issues.sort((a, b) => a.canonicalTimestamp.localeCompare(b.canonicalTimestamp) || a.code.localeCompare(b.code));
  return { issues, demandByInstant, generationByInstant };
}

function finiteDerived(value, field) {
  if (!Number.isFinite(value)) fail(field, "numeric_overflow", "calculated value must be finite");
  return value;
}

function sumFinite(slots, property, field) {
  return finiteDerived(slots.reduce((total, slot) => finiteDerived(total + slot[property], field), 0), field);
}

function ratio(numerator, denominator, field) {
  return finiteDerived(denominator === 0 ? 0 : numerator / denominator, field);
}

function aggregate(slots, rates, period, field = "totals") {
  const predictedDemandEnergyKwh = sumFinite(slots, "predictedDemandEnergyKwh", `${field}.predictedDemandEnergyKwh`);
  const generationEnergyKwh = sumFinite(slots, "generationEnergyKwh", `${field}.generationEnergyKwh`);
  const directSolarUseEnergyKwh = sumFinite(slots, "directSolarUseEnergyKwh", `${field}.directSolarUseEnergyKwh`);
  const result = { slotCount: slots.length, generationEnergyKwh, predictedDemandEnergyKwh, directSolarUseEnergyKwh,
    gridImportEnergyKwh: finiteDerived(predictedDemandEnergyKwh - directSolarUseEnergyKwh, `${field}.gridImportEnergyKwh`),
    surplusEnergyKwh: finiteDerived(generationEnergyKwh - directSolarUseEnergyKwh, `${field}.surplusEnergyKwh`),
    selfSufficiencyRatio: ratio(directSolarUseEnergyKwh, predictedDemandEnergyKwh, `${field}.selfSufficiencyRatio`),
    solarUtilizationRatio: ratio(directSolarUseEnergyKwh, generationEnergyKwh, `${field}.solarUtilizationRatio`),
    savingsKrw: finiteDerived(directSolarUseEnergyKwh * rates.electricityPriceKrwPerKwh, `${field}.savingsKrw`),
    carbonAvoidedKgCo2e: finiteDerived(directSolarUseEnergyKwh * rates.carbonIntensityKgCo2ePerKwh, `${field}.carbonAvoidedKgCo2e`) };
  return period === undefined ? result : { period, ...result };
}

function aggregatePeriods(slots, length, rates, field) {
  const groups = new Map();
  for (const slot of slots) {
    const period = slot.demandTimestamp.slice(0, length);
    groups.set(period, [...(groups.get(period) ?? []), slot]);
  }
  return [...groups].map(([period, values], index) => aggregate(values, rates, period, `${field}[${index}]`));
}

function assertFiniteResult(value, field = "result") {
  if (typeof value === "number") finiteDerived(value, field);
  else if (Array.isArray(value)) value.forEach((item, index) => assertFiniteResult(item, `${field}[${index}]`));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) assertFiniteResult(item, `${field}.${key}`);
  }
  return value;
}

export function calculateEnergyBalance(value) {
  const input = object(value, "input");
  const demandInput = object(input.demand, "demand");
  const generationInput = object(input.generation, "generation");
  const provenance = parseProvenance(demandInput, generationInput);
  const rates = parseRates(input.rates);
  const demand = parseSeries(demandInput, "demand");
  const generation = parseSeries(generationInput, "generation");
  const { issues, demandByInstant, generationByInstant } = align(demand, generation);
  if (issues.length > 0) return { status: "incomplete", code: "incomplete_energy_series", intervalMinutes: 15,
    demandSlotCount: demand.length, generationSlotCount: generation.length, issues, ...provenance, rates: { ...rates } };
  const slots = [...demandByInstant.keys()].sort((a, b) => a - b).map((instant) => {
    const demandSlot = demandByInstant.get(instant);
    const generationSlot = generationByInstant.get(instant);
    const predictedDemandEnergyKwh = demandSlot.energyKwh;
    const generationEnergyKwh = generationSlot.energyKwh;
    const field = `slots[${new Date(instant).toISOString()}]`;
    const directSolarUseEnergyKwh = finiteDerived(Math.min(generationEnergyKwh, predictedDemandEnergyKwh), `${field}.directSolarUseEnergyKwh`);
    return { timestamp: new Date(instant).toISOString(), demandTimestamp: demandSlot.originalTimestamp,
      generationTimestamp: generationSlot.originalTimestamp, generationEnergyKwh, predictedDemandEnergyKwh,
      directSolarUseEnergyKwh,
      gridImportEnergyKwh: finiteDerived(Math.max(predictedDemandEnergyKwh - generationEnergyKwh, 0), `${field}.gridImportEnergyKwh`),
      surplusEnergyKwh: finiteDerived(Math.max(generationEnergyKwh - predictedDemandEnergyKwh, 0), `${field}.surplusEnergyKwh`),
      selfSufficiencyRatio: ratio(directSolarUseEnergyKwh, predictedDemandEnergyKwh, `${field}.selfSufficiencyRatio`),
      solarUtilizationRatio: ratio(directSolarUseEnergyKwh, generationEnergyKwh, `${field}.solarUtilizationRatio`),
      savingsKrw: finiteDerived(directSolarUseEnergyKwh * rates.electricityPriceKrwPerKwh, `${field}.savingsKrw`),
      carbonAvoidedKgCo2e: finiteDerived(directSolarUseEnergyKwh * rates.carbonIntensityKgCo2ePerKwh, `${field}.carbonAvoidedKgCo2e`),
      demandProvenance: structuredClone(provenance.demandProvenance),
      weatherProvenance: structuredClone(generationSlot.provenance) };
  });
  return assertFiniteResult({ status: "complete", intervalMinutes: 15, energyUnit: "kWh", ...provenance, rates: { ...rates }, slots,
    totals: aggregate(slots, rates), daily: aggregatePeriods(slots, 10, rates, "daily"),
    monthly: aggregatePeriods(slots, 7, rates, "monthly") });
}
