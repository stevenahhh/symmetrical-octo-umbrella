import assert from "node:assert/strict";
import test from "node:test";
import { D4_ROOMS } from "./d4BuildingData.mjs";
import { getCurrentRoomStatus } from "./d4RoomStatus.mjs";

test("reports a scheduled D4 classroom as occupied", () => {
  const room = D4_ROOMS.find((candidate) => candidate.timetable.length > 0);
  assert.ok(room);
  const scheduledClass = room.timetable[0];
  const weekdayIndex = ["일", "월", "화", "수", "목", "금", "토"].indexOf(
    scheduledClass.day,
  );
  const date = new Date(2026, 6, 19 + weekdayIndex, scheduledClass.startHour, 0);

  const status = getCurrentRoomStatus(room, date);

  assert.equal(status.isInUse, true);
  assert.equal(status.currentClass?.subject, scheduledClass.subject);
  assert.equal(status.statusText, "현재 수업 중");
});

test("keeps the D4 server room in its always-on state", () => {
  const serverRoom = D4_ROOMS.find((room) => room.specialType === "server");
  assert.ok(serverRoom);

  const status = getCurrentRoomStatus(serverRoom, new Date(2026, 6, 19, 3, 0));

  assert.equal(status.isInUse, true);
  assert.equal(status.statusText, "상시 가동");
  assert.equal(status.hvacText, "냉난방기 가동 중");
});
