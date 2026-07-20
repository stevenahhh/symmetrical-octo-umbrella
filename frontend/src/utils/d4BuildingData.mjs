export const D4_ELEMENT_IDS = ["BLD_D3", "BLD_D4", "BLD_E3", "D4_ENGINEERING_3"];

const ROOM_NUMBERS_BY_FLOOR = {
  1: ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113", "114"],
  2: ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212", "213", "214", "215", "216"],
  3: ["301", "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312", "313", "314", "315", "316", "317"],
  4: ["401", "402", "403", "404", "405", "406", "407", "408", "409", "410", "411", "412", "413", "414"],
  5: ["501", "502", "503", "504", "505", "506", "507"],
  6: ["601"],
};

const SPECIAL_ROOM_BY_NUMBER = {
  108: { specialType: "computer_lab", specialLabel: "컴퓨터실", sizeLabel: "중형", computerCount: 34, hasLargeScreen: true },
  204: { specialType: "lab", specialLabel: "실험실", sizeLabel: "중형", hasLargeScreen: false },
  305: { specialType: "server", specialLabel: "서버실", sizeLabel: "소형", hasLargeScreen: false },
  401: { specialType: "faculty", specialLabel: "교수/조교실", sizeLabel: "소형", hasLargeScreen: false },
  410: { specialType: "faculty", specialLabel: "교수/조교실", sizeLabel: "소형", hasLargeScreen: false },
  501: { specialType: "lab", specialLabel: "프로젝트실", sizeLabel: "중형", hasLargeScreen: true },
  601: { specialType: "lab", specialLabel: "대학원실", sizeLabel: "대형", hasLargeScreen: true },
};

const WEEKDAYS = ["월", "화", "수", "목", "금"];
const SUBJECTS = ["캡스톤디자인", "자료구조", "컴퓨터네트워크", "디지털논리회로", "인공지능", "전력시스템", "소프트웨어공학", "공학수학"];

function createTimetable(roomNumber, index) {
  const numericRoom = Number(roomNumber);
  if (numericRoom >= 500 && numericRoom !== 601) return [];
  if (SPECIAL_ROOM_BY_NUMBER[roomNumber]?.specialType === "server") return [];

  return [
    {
      day: WEEKDAYS[index % WEEKDAYS.length],
      startHour: 9 + (index % 5),
      durationHours: index % 3 === 0 ? 3 : 2,
      subject: SUBJECTS[index % SUBJECTS.length],
      professorId: `P-${String((index % 9) + 1).padStart(2, "0")}`,
    },
    {
      day: WEEKDAYS[(index + 2) % WEEKDAYS.length],
      startHour: 13 + (index % 4),
      durationHours: 2,
      subject: SUBJECTS[(index + 3) % SUBJECTS.length],
      professorId: `P-${String(((index + 3) % 9) + 1).padStart(2, "0")}`,
    },
  ];
}

function getWing(roomNumber, roomIndex) {
  if (roomNumber === "601") return "right";
  return roomIndex % 2 === 0 ? "left" : "right";
}

function getRoomGeometry({ floor, roomIndex, floorRoomCount, side }) {
  const wingX = side === "left" ? -2.25 : 2.25;
  const sideIndex = Math.floor(roomIndex / 2);
  const sideCount = Math.ceil(floorRoomCount / 2);
  const zStep = sideCount > 1 ? 3.5 / (sideCount - 1) : 0;

  return {
    x: wingX + (roomIndex % 2 === 0 ? -0.42 : 0.42),
    z: -1.75 + sideIndex * zStep,
    width: floor >= 5 ? 0.9 : 0.76,
    depth: floor >= 5 ? 0.82 : 0.66,
  };
}

export const D4_BUILDING_DATA = {
  id: "D4",
  displayName: "D4 / 공대 3호관",
  floors: [1, 2, 3, 4, 5, 6].map((floor) => ({ id: `floor-${floor}`, floor, label: `${floor}층` })),
  wings: [
    { id: "left", label: "왼쪽 동", floors: 5, x: -2.25, width: 3.25, depth: 4.3 },
    { id: "right", label: "오른쪽 동", floors: 6, x: 2.25, width: 3.25, depth: 4.3 },
  ],
  bridges: [{ floor: 3 }, { floor: 5 }],
};

export const D4_ROOMS = Object.entries(ROOM_NUMBERS_BY_FLOOR).flatMap(([floorText, roomNumbers]) => {
  const floor = Number(floorText);
  return roomNumbers.map((roomNumber, roomIndex) => {
    const side = getWing(roomNumber, roomIndex);
    const special = SPECIAL_ROOM_BY_NUMBER[roomNumber] ?? {};
    const index = floor * 20 + roomIndex;
    return {
      id: `d4-${roomNumber}`,
      roomNumber,
      floor,
      wing: side,
      sizeLabel: special.sizeLabel ?? (roomIndex % 5 === 0 ? "대형" : roomIndex % 2 === 0 ? "중형" : "소형"),
      specialType: special.specialType ?? "classroom",
      specialLabel: special.specialLabel ?? "강의실",
      hasLargeScreen: special.hasLargeScreen ?? roomIndex % 3 === 0,
      hvacUnits: special.specialType === "server" ? 2 : roomIndex % 4 === 0 ? 2 : 1,
      computerCount: special.computerCount ?? 0,
      weeklySavingsKwh: 18 + ((floor * 13 + roomIndex * 7) % 42),
      savingRate: 8 + ((floor + roomIndex) % 9),
      timetable: createTimetable(roomNumber, index),
      geometry: getRoomGeometry({ floor, roomIndex, floorRoomCount: roomNumbers.length, side }),
    };
  });
});

export function isD4ElementId(elementId) {
  return D4_ELEMENT_IDS.includes(elementId);
}
