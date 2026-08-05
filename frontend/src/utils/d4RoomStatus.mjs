import { WEEKDAY_LABELS } from "../features/energy/domain/contracts.mjs";
import { findOccupancyEvent } from "../features/energy/domain/demand.mjs";

export function isRoomInUse(room, date) {
  return getCurrentRoomStatus(room, date).isInUse;
}

export function getCurrentRoomStatus(room, date) {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  const currentClass = findOccupancyEvent(room, weekday, minuteOfDay);
  const nextClass = room.timetable.find((event) => event.day === weekday && event.startMinute >= date.getHours() * 60);
  const isAlwaysOn = room.specialType === "server";
  const isInUse = Boolean(currentClass) || isAlwaysOn;

  return {
    isInUse,
    currentClass,
    nextClass,
    hvacRunning: isInUse && room.specialType !== "faculty",
    statusText: currentClass ? "\uD604\uC7AC \uC218\uC5C5 \uC911" : isAlwaysOn ? "\uC0C1\uC2DC \uAC00\uB3D9" : "\uD604\uC7AC \uACF5\uC2E4",
    hvacText: isInUse && room.specialType !== "faculty" ? "\uB0C9\uB09C\uBC29\uAE30 \uAC00\uB3D9 \uC911" : "\uB0C9\uB09C\uBC29\uAE30 \uB300\uAE30",
  };
}
