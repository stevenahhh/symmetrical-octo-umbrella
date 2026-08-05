import assert from "node:assert/strict";
import test from "node:test";
import { DEMAND_QUALITY, DomainParseError, createIntervalKeys, parseBuilding } from "./contracts.mjs";
import { D4_BUILDING_DATA, D4_ROOMS } from "./d4Campus.mjs";
import { calculateBuildingDemand, calculateRoomDemand } from "./demand.mjs";
import { LOAD_PROFILE_ASSUMPTIONS } from "./loadProfiles.mjs";

const MONDAY = "2026-05-18";

test("D4 building and room IDs remain stable and unique", () => {
  assert.equal(D4_BUILDING_DATA.id, "D4");
  assert.equal(D4_ROOMS.length, 69);
  assert.equal(D4_ROOMS[0].id, "d4-101");
  assert.equal(D4_ROOMS.at(-1).id, "d4-601");
  assert.equal(new Set(D4_ROOMS.map(({ id }) => id)).size, D4_ROOMS.length);
  assert.ok(D4_ROOMS.every((room) => room.buildingId === D4_BUILDING_DATA.id));
  assert.ok(D4_ROOMS.every((room) => room.timetable.every((event) => event.id.startsWith(`${room.id}-event-`))));
});

test("a local calendar day has exactly 96 ordered 15-minute interval keys", () => {
  const keys = createIntervalKeys(MONDAY);
  assert.equal(keys.length, 96);
  assert.equal(keys[0], "2026-05-18T00:00+09:00");
  assert.equal(keys[1], "2026-05-18T00:15+09:00");
  assert.equal(keys.at(-1), "2026-05-18T23:45+09:00");
  assert.equal(new Set(keys).size, 96);
});

test("scheduled room demand transitions at event boundaries", () => {
  const room = D4_ROOMS.find((candidate) => candidate.id === "d4-101");
  const mondayEvent = room.timetable.find((event) => event.day === "\uC6D4");
  assert.ok(mondayEvent);
  const result = calculateRoomDemand(room, MONDAY);
  const before = result.slots[(mondayEvent.startMinute / 15) - 1];
  const atStart = result.slots[mondayEvent.startMinute / 15];
  const atEnd = result.slots[(mondayEvent.startMinute + mondayEvent.durationMinutes) / 15];
  assert.equal(before.occupied, false);
  assert.equal(atStart.occupied, true);
  assert.equal(atStart.occupancyEvent.id, mondayEvent.id);
  assert.equal(atEnd.occupied, false);
  assert.ok(atStart.powerKw > before.powerKw);
});

test("server base and HVAC load remain always on", () => {
  const server = D4_ROOMS.find((room) => room.specialType === "server");
  const result = calculateRoomDemand(server, MONDAY);
  assert.equal(result.slots.length, 96);
  assert.ok(result.slots.every((slot) => slot.occupied && slot.alwaysOn));
  assert.ok(result.slots.every((slot) => slot.powerKw === 8.5));
  assert.deepEqual(result.slots[0].componentsKw, {
    standby: 6, lighting: 0, plug: 0, computers: 0, largeScreen: 0, hvac: 2.5,
  });
});

test("occupied room demand exposes an exact component breakdown", () => {
  const room = D4_ROOMS.find((candidate) => candidate.id === "d4-108");
  const event = room.timetable[0];
  const weekdayDates = { "\uC6D4": "2026-05-18", "\uD654": "2026-05-19", "\uC218": "2026-05-20", "\uBAA9": "2026-05-21", "\uAE08": "2026-05-22" };
  const result = calculateRoomDemand(room, weekdayDates[event.day]);
  const slot = result.slots[event.startMinute / 15];
  assert.deepEqual(slot.componentsKw, {
    standby: 0.8, lighting: 1, plug: 0.8, computers: 5.1, largeScreen: 0.3, hvac: 2.5,
  });
  assert.equal(slot.powerKw, 10.5);
  assert.equal(slot.energyKwh, 2.625);
  assert.equal(slot.quality, DEMAND_QUALITY);
  assert.equal(slot.unit, "kW");
  assert.equal(result.assumption.type, "simulation-assumption");
  assert.equal(result.loadProfileId, "load-profile-computer_lab-v1");
});

test("building totals exactly equal the sum of room totals", () => {
  const building = calculateBuildingDemand({ ...D4_BUILDING_DATA, rooms: D4_ROOMS }, MONDAY);
  assert.equal(building.slots.length, 96);
  for (let index = 0; index < building.slots.length; index += 1) {
    const roomPower = building.rooms.reduce((sum, room) => sum + room.slots[index].powerKw, 0);
    const roomEnergy = building.rooms.reduce((sum, room) => sum + room.slots[index].energyKwh, 0);
    assert.equal(building.slots[index].powerKw, roomPower);
    assert.equal(building.slots[index].energyKwh, roomEnergy);
  }
  assert.equal(building.quality, "predicted");
  assert.equal(building.intervalMinutes, 15);
  assert.equal(building.timeZone, "Asia/Seoul");
});

test("all required defaults are explicit simulation assumptions", () => {
  assert.equal(LOAD_PROFILE_ASSUMPTIONS.classroom.standbyKw, 0.2);
  assert.equal(LOAD_PROFILE_ASSUMPTIONS.computer_lab.standbyKw, 0.8);
  assert.equal(LOAD_PROFILE_ASSUMPTIONS.lab.standbyKw, 1);
  assert.equal(LOAD_PROFILE_ASSUMPTIONS.faculty.standbyKw, 0.4);
  assert.equal(LOAD_PROFILE_ASSUMPTIONS.server.standbyKw, 6);
  assert.deepEqual(LOAD_PROFILE_ASSUMPTIONS.shared.lightingKwBySize, { small: 0.6, medium: 1, large: 1.5 });
  assert.equal(LOAD_PROFILE_ASSUMPTIONS.shared.computerKwEach, 0.15);
  assert.equal(LOAD_PROFILE_ASSUMPTIONS.shared.largeScreenKw, 0.3);
  assert.equal(LOAD_PROFILE_ASSUMPTIONS.shared.occupiedHvacKwEach, 2.5);
  assert.equal(LOAD_PROFILE_ASSUMPTIONS.shared.serverHvacKwEach, 1.25);
  assert.ok(Object.values(LOAD_PROFILE_ASSUMPTIONS).every((value) => value.assumption?.type === "simulation-assumption"));
});

test("malformed domain input returns typed parse errors", () => {
  const validRoom = D4_ROOMS[0];
  const cases = [
    [{ ...D4_BUILDING_DATA, rooms: [validRoom, { ...validRoom }] }, "duplicate_room_id"],
    [{ ...D4_BUILDING_DATA, rooms: [{ ...validRoom, specialType: "warehouse" }] }, "unknown_room_type"],
    [{ ...D4_BUILDING_DATA, rooms: [{ ...validRoom, computerCount: -1 }] }, "invalid_equipment_count"],
    [{ ...D4_BUILDING_DATA, rooms: [{ ...validRoom, timetable: [
      { id: "one", day: "\uC6D4", startMinute: 540, durationMinutes: 120, subject: "A", professorId: "P-01" },
      { id: "two", day: "\uC6D4", startMinute: 600, durationMinutes: 60, subject: "B", professorId: "P-02" },
    ] }] }, "overlapping_timetable_event"],
  ];
  for (const [input, expectedCode] of cases) {
    assert.throws(
      () => parseBuilding(input),
      (error) => error instanceof DomainParseError && error.issues.some(({ code }) => code === expectedCode),
    );
  }
});
