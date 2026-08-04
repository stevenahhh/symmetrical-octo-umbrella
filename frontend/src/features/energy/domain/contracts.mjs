export const DEMAND_QUALITY = "predicted";
export const DEMAND_INTERVAL_MINUTES = 15;
export const DEMAND_TIME_ZONE = "Asia/Seoul";
export const ROOM_TYPES = Object.freeze(["classroom", "computer_lab", "lab", "faculty", "server"]);
export const ROOM_SIZES = Object.freeze(["small", "medium", "large"]);
export const WEEKDAY_LABELS = Object.freeze(["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"]);

export class DomainParseError extends Error {
  constructor(issues) {
    super(`Invalid energy domain input: ${issues.map(({ code, field }) => `${code} at ${field}`).join(", ")}`);
    this.name = "DomainParseError";
    this.code = "invalid_energy_domain_input";
    this.issues = issues;
  }
}

function issue(code, field, message) {
  return { code, field, message };
}

export function parseCalendarDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new DomainParseError([issue("invalid_calendar_date", "date", "Expected YYYY-MM-DD.")]);
  }
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new DomainParseError([issue("invalid_calendar_date", "date", "Date does not exist.")]);
  }
  return { year, month, day, weekday: WEEKDAY_LABELS[parsed.getUTCDay()] };
}

export function createIntervalKeys(date) {
  parseCalendarDate(date);
  return Array.from({ length: 96 }, (_, index) => {
    const hour = String(Math.floor(index / 4)).padStart(2, "0");
    const minute = String((index % 4) * DEMAND_INTERVAL_MINUTES).padStart(2, "0");
    return `${date}T${hour}:${minute}+09:00`;
  });
}

function validateEvent(event, field, issues) {
  if (!event || typeof event !== "object") {
    issues.push(issue("invalid_timetable_event", field, "Expected an event object."));
    return;
  }
  if (typeof event.id !== "string" || event.id.length === 0) issues.push(issue("invalid_event_id", `${field}.id`, "Event ID is required."));
  if (!WEEKDAY_LABELS.slice(1, 6).includes(event.day)) issues.push(issue("invalid_event_day", `${field}.day`, "Expected a weekday label."));
  if (!Number.isInteger(event.startMinute) || event.startMinute < 0 || event.startMinute >= 1440 || event.startMinute % 15 !== 0) {
    issues.push(issue("invalid_event_start", `${field}.startMinute`, "Start must be a 15-minute boundary within the day."));
  }
  if (!Number.isInteger(event.durationMinutes) || event.durationMinutes <= 0 || event.durationMinutes % 15 !== 0 || event.startMinute + event.durationMinutes > 1440) {
    issues.push(issue("invalid_event_duration", `${field}.durationMinutes`, "Duration must fit the day in 15-minute increments."));
  }
}

export function parseRoom(room, field = "room") {
  const issues = [];
  if (!room || typeof room !== "object") throw new DomainParseError([issue("invalid_room", field, "Expected a room object.")]);
  if (typeof room.id !== "string" || room.id.length === 0) issues.push(issue("invalid_room_id", `${field}.id`, "Room ID is required."));
  if (!ROOM_TYPES.includes(room.specialType)) issues.push(issue("unknown_room_type", `${field}.specialType`, "Unknown room type."));
  if (!ROOM_SIZES.includes(room.size)) issues.push(issue("unknown_room_size", `${field}.size`, "Unknown room size."));
  for (const equipmentField of ["computerCount", "hvacUnits"]) {
    if (!Number.isInteger(room[equipmentField]) || room[equipmentField] < 0) {
      issues.push(issue("invalid_equipment_count", `${field}.${equipmentField}`, "Equipment count must be a nonnegative integer."));
    }
  }
  if (typeof room.hasLargeScreen !== "boolean") issues.push(issue("invalid_equipment_flag", `${field}.hasLargeScreen`, "Expected a boolean."));
  if (!Array.isArray(room.timetable)) {
    issues.push(issue("invalid_timetable", `${field}.timetable`, "Expected an event array."));
  } else {
    room.timetable.forEach((event, index) => validateEvent(event, `${field}.timetable[${index}]`, issues));
    const eventsByDay = new Map();
    for (const event of room.timetable) {
      if (!Number.isInteger(event?.startMinute) || !Number.isInteger(event?.durationMinutes)) continue;
      const previous = eventsByDay.get(event.day) ?? [];
      if (previous.some((candidate) => event.startMinute < candidate.startMinute + candidate.durationMinutes && candidate.startMinute < event.startMinute + event.durationMinutes)) {
        issues.push(issue("overlapping_timetable_event", `${field}.timetable`, "Timetable events must not overlap."));
      }
      previous.push(event);
      eventsByDay.set(event.day, previous);
    }
  }
  if (issues.length > 0) throw new DomainParseError(issues);
  return room;
}

export function parseBuilding(building) {
  const issues = [];
  if (!building || typeof building !== "object") throw new DomainParseError([issue("invalid_building", "building", "Expected a building object.")]);
  if (typeof building.id !== "string" || building.id.length === 0) issues.push(issue("invalid_building_id", "building.id", "Building ID is required."));
  if (!Array.isArray(building.rooms)) issues.push(issue("invalid_rooms", "building.rooms", "Expected a room array."));
  else {
    const seen = new Set();
    building.rooms.forEach((room, index) => {
      if (seen.has(room?.id)) issues.push(issue("duplicate_room_id", `building.rooms[${index}].id`, "Room IDs must be unique."));
      seen.add(room?.id);
      if (room?.buildingId !== building.id) issues.push(issue("room_building_mismatch", `building.rooms[${index}].buildingId`, "Room must reference its building."));
      try { parseRoom(room, `building.rooms[${index}]`); } catch (error) {
        if (error instanceof DomainParseError) issues.push(...error.issues); else throw error;
      }
    });
  }
  if (issues.length > 0) throw new DomainParseError(issues);
  return building;
}
