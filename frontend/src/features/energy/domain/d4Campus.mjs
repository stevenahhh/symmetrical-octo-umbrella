export const D4_ELEMENT_IDS = Object.freeze(["BLD_D3", "BLD_D4", "BLD_E3", "D4_ENGINEERING_3"]);

const ROOM_NUMBERS_BY_FLOOR = Object.freeze({
  1: ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113", "114"],
  2: ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212", "213", "214", "215", "216"],
  3: ["301", "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312", "313", "314", "315", "316", "317"],
  4: ["401", "402", "403", "404", "405", "406", "407", "408", "409", "410", "411", "412", "413", "414"],
  5: ["501", "502", "503", "504", "505", "506", "507"],
  6: ["601"],
});

const SPECIAL_ROOM_BY_NUMBER = Object.freeze({
  108: { specialType: "computer_lab", specialLabel: "\uCEF4\uD4E8\uD130\uC2E4", size: "medium", sizeLabel: "\uC911\uD615", computerCount: 34, hasLargeScreen: true },
  204: { specialType: "lab", specialLabel: "\uC2E4\uD5D8\uC2E4", size: "medium", sizeLabel: "\uC911\uD615", hasLargeScreen: false },
  305: { specialType: "server", specialLabel: "\uC11C\uBC84\uC2E4", size: "small", sizeLabel: "\uC18C\uD615", hasLargeScreen: false },
  401: { specialType: "faculty", specialLabel: "\uAD50\uC218/\uC870\uAD50\uC2E4", size: "small", sizeLabel: "\uC18C\uD615", hasLargeScreen: false },
  410: { specialType: "faculty", specialLabel: "\uAD50\uC218/\uC870\uAD50\uC2E4", size: "small", sizeLabel: "\uC18C\uD615", hasLargeScreen: false },
  501: { specialType: "lab", specialLabel: "\uD504\uB85C\uC81D\uD2B8\uC2E4", size: "medium", sizeLabel: "\uC911\uD615", hasLargeScreen: true },
  601: { specialType: "lab", specialLabel: "\uB300\uD559\uC6D0\uC2E4", size: "large", sizeLabel: "\uB300\uD615", hasLargeScreen: true },
});

const WEEKDAYS = ["\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08"];
const SUBJECTS = ["\uCEA1\uC2A4\uD1A4\uB514\uC790\uC778", "\uC790\uB8CC\uAD6C\uC870", "\uCEF4\uD4E8\uD130\uB124\uD2B8\uC6CC\uD06C", "\uB514\uC9C0\uD138\uB17C\uB9AC\uD68C\uB85C", "\uC778\uACF5\uC9C0\uB2A5", "\uC804\uB825\uC2DC\uC2A4\uD15C", "\uC18C\uD504\uD2B8\uC6E8\uC5B4\uACF5\uD559", "\uACF5\uD559\uC218\uD559"];

function createTimetable(roomId, roomNumber, index) {
  const numericRoom = Number(roomNumber);
  if (numericRoom >= 500 && numericRoom !== 601) return [];
  if (SPECIAL_ROOM_BY_NUMBER[roomNumber]?.specialType === "server") return [];
  return [
    { day: WEEKDAYS[index % 5], startHour: 9 + (index % 5), durationHours: index % 3 === 0 ? 3 : 2, subject: SUBJECTS[index % 8], professorId: `P-${String((index % 9) + 1).padStart(2, "0")}` },
    { day: WEEKDAYS[(index + 2) % 5], startHour: 13 + (index % 4), durationHours: 2, subject: SUBJECTS[(index + 3) % 8], professorId: `P-${String(((index + 3) % 9) + 1).padStart(2, "0")}` },
  ].map((event, eventIndex) => ({
    id: `${roomId}-event-${eventIndex + 1}`,
    ...event,
    startMinute: event.startHour * 60,
    durationMinutes: event.durationHours * 60,
  }));
}

function roomSize(roomIndex, special) {
  if (special.size) return { size: special.size, sizeLabel: special.sizeLabel };
  if (roomIndex % 5 === 0) return { size: "large", sizeLabel: "\uB300\uD615" };
  if (roomIndex % 2 === 0) return { size: "medium", sizeLabel: "\uC911\uD615" };
  return { size: "small", sizeLabel: "\uC18C\uD615" };
}

function getRoomGeometry(floor, roomIndex, count, side) {
  const sideIndex = Math.floor(roomIndex / 2);
  const sideCount = Math.ceil(count / 2);
  return {
    x: (side === "left" ? -2.25 : 2.25) + (roomIndex % 2 === 0 ? -0.42 : 0.42),
    z: -1.75 + sideIndex * (sideCount > 1 ? 3.5 / (sideCount - 1) : 0),
    width: floor >= 5 ? 0.9 : 0.76,
    depth: floor >= 5 ? 0.82 : 0.66,
  };
}

export const D4_BUILDING_DATA = Object.freeze({
  id: "D4",
  displayName: "D4 / \uACF5\uB300 3\uD638\uAD00",
  floors: [1, 2, 3, 4, 5, 6].map((floor) => ({ id: `floor-${floor}`, floor, label: `${floor}\uCE35` })),
  wings: [
    { id: "left", label: "\uC67C\uCABD \uB3D9", floors: 5, x: -2.25, width: 3.25, depth: 4.3 },
    { id: "right", label: "\uC624\uB978\uCABD \uB3D9", floors: 6, x: 2.25, width: 3.25, depth: 4.3 },
  ],
  bridges: [{ floor: 3 }, { floor: 5 }],
  assumption: { type: "simulation-assumption", quality: "predicted", calibration: "not-engineering-calibrated" },
});

export const D4_ROOMS = Object.freeze(Object.entries(ROOM_NUMBERS_BY_FLOOR).flatMap(([floorText, roomNumbers]) => {
  const floor = Number(floorText);
  return roomNumbers.map((roomNumber, roomIndex) => {
    const id = `d4-${roomNumber}`;
    const side = roomNumber === "601" ? "right" : roomIndex % 2 === 0 ? "left" : "right";
    const special = SPECIAL_ROOM_BY_NUMBER[roomNumber] ?? {};
    return Object.freeze({
      id,
      buildingId: D4_BUILDING_DATA.id,
      roomNumber,
      floor,
      wing: side,
      ...roomSize(roomIndex, special),
      specialType: special.specialType ?? "classroom",
      specialLabel: special.specialLabel ?? "\uAC15\uC758\uC2E4",
      hasLargeScreen: special.hasLargeScreen ?? roomIndex % 3 === 0,
      hvacUnits: special.specialType === "server" ? 2 : roomIndex % 4 === 0 ? 2 : 1,
      computerCount: special.computerCount ?? 0,
      weeklySavingsKwh: 18 + ((floor * 13 + roomIndex * 7) % 42),
      savingRate: 8 + ((floor + roomIndex) % 9),
      timetable: createTimetable(id, roomNumber, floor * 20 + roomIndex),
      geometry: getRoomGeometry(floor, roomIndex, roomNumbers.length, side),
      assumption: D4_BUILDING_DATA.assumption,
    });
  });
}));

export function isD4ElementId(elementId) {
  return D4_ELEMENT_IDS.includes(elementId);
}
