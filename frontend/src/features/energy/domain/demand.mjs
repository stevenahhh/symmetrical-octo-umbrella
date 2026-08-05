import { DEMAND_INTERVAL_MINUTES, DEMAND_QUALITY, DEMAND_TIME_ZONE, createIntervalKeys, parseBuilding, parseCalendarDate, parseRoom } from "./contracts.mjs";
import { DEMAND_ASSUMPTION, LOAD_PROFILE_ASSUMPTIONS } from "./loadProfiles.mjs";

export function findOccupancyEvent(room, weekday, minuteOfDay) {
  return room.timetable.find((event) => event.day === weekday && minuteOfDay >= event.startMinute && minuteOfDay < event.startMinute + event.durationMinutes);
}

function componentsFor(room, occupied) {
  const profile = LOAD_PROFILE_ASSUMPTIONS[room.specialType];
  const shared = LOAD_PROFILE_ASSUMPTIONS.shared;
  const server = room.specialType === "server";
  return {
    standby: profile.standbyKw,
    lighting: occupied && !server ? shared.lightingKwBySize[room.size] : 0,
    plug: occupied && !server ? profile.occupiedPlugKw : 0,
    computers: occupied && !server ? room.computerCount * shared.computerKwEach : 0,
    largeScreen: occupied && !server && room.hasLargeScreen ? shared.largeScreenKw : 0,
    hvac: server ? room.hvacUnits * shared.serverHvacKwEach : occupied ? room.hvacUnits * shared.occupiedHvacKwEach : 0,
  };
}

export function calculateRoomDemand(roomInput, date) {
  const room = parseRoom(roomInput);
  const { weekday } = parseCalendarDate(date);
  const profile = LOAD_PROFILE_ASSUMPTIONS[room.specialType];
  const slots = createIntervalKeys(date).map((intervalKey, index) => {
    const startMinute = index * DEMAND_INTERVAL_MINUTES;
    const occupancyEvent = findOccupancyEvent(room, weekday, startMinute);
    const alwaysOn = room.specialType === "server";
    const occupied = alwaysOn || Boolean(occupancyEvent);
    const componentsKw = componentsFor(room, occupied);
    const powerKw = Object.values(componentsKw).reduce((sum, value) => sum + value, 0);
    return { intervalKey, startMinute, occupied, alwaysOn, occupancyEvent: occupancyEvent ?? null, componentsKw, powerKw, energyKwh: powerKw / 4, unit: "kW", energyUnit: "kWh", quality: DEMAND_QUALITY };
  });
  return { roomId: room.id, buildingId: room.buildingId, date, intervalMinutes: DEMAND_INTERVAL_MINUTES, timeZone: DEMAND_TIME_ZONE, quality: DEMAND_QUALITY, loadProfileId: profile.id, assumption: DEMAND_ASSUMPTION, slots, totalEnergyKwh: slots.reduce((sum, slot) => sum + slot.energyKwh, 0) };
}

export function calculateBuildingDemand(buildingInput, date) {
  const building = parseBuilding(buildingInput);
  const rooms = building.rooms.map((room) => calculateRoomDemand(room, date));
  const slots = createIntervalKeys(date).map((intervalKey, index) => {
    const powerKw = rooms.reduce((sum, room) => sum + room.slots[index].powerKw, 0);
    const energyKwh = rooms.reduce((sum, room) => sum + room.slots[index].energyKwh, 0);
    return { intervalKey, powerKw, energyKwh, unit: "kW", energyUnit: "kWh", quality: DEMAND_QUALITY };
  });
  return { buildingId: building.id, date, intervalMinutes: DEMAND_INTERVAL_MINUTES, timeZone: DEMAND_TIME_ZONE, quality: DEMAND_QUALITY, assumption: DEMAND_ASSUMPTION, rooms, slots, totalEnergyKwh: slots.reduce((sum, slot) => sum + slot.energyKwh, 0) };
}
