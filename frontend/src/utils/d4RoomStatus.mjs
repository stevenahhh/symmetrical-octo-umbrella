const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function isRoomInUse(room, date) {
  return getCurrentRoomStatus(room, date).isInUse;
}

export function getCurrentRoomStatus(room, date) {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  const hour = date.getHours();
  const currentClass = room.timetable.find((item) => item.day === weekday && hour >= item.startHour && hour < item.startHour + item.durationHours);
  const nextClass = room.timetable.find((item) => item.day === weekday && item.startHour >= hour);
  const isAlwaysOn = room.specialType === "server";
  const isInUse = Boolean(currentClass) || isAlwaysOn;

  return {
    isInUse,
    currentClass,
    nextClass,
    hvacRunning: isInUse && room.specialType !== "faculty",
    statusText: currentClass ? "현재 수업 중" : isAlwaysOn ? "상시 가동" : "현재 공실",
    hvacText: isInUse && room.specialType !== "faculty" ? "냉난방기 가동 중" : "냉난방기 대기",
  };
}
