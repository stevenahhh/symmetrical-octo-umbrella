// common/data/common_elemetns.json(공식 ID부여 등록부) 기준 BLD_D4 = 공과대학 3호관.
// CityModel.jsx의 BUILDING_MAP은 이 등록부와 어긋나 있어 라벨 표시(ELEMENT_NAME_MAP)를 기준으로 판단해야 함.
export const D4_ELEMENT_IDS = ["BLD_D4"];

// 실제 배치도(공학 3호관) 기준. 각 층은 실물 안내판처럼 2개 행(row)으로 구성되고,
// 각 행 안의 칸은 안내판 상 비율에 가깝게 width(가중치)를 갖는다. number가 없으면 화장실 등 비실(非室) 칸.
const LAB_WING_FLOORS = [
  { floor: 5, rows: [
    [
      { number: "21-501", name: "전공실습실", width: 3 },
      { number: "21-502", name: "지능형 스마트농업 G-ITRC 세미나실", width: 2 },
      { number: "21-503", name: "기초정보실험실", width: 3 },
      { number: null, name: "화장실", width: 1 },
    ],
    [
      { number: "21-504", name: "스마트소프트웨어 연구실", width: 2 },
      { number: "21-505", name: "인공지능응용시스템연구실", width: 2 },
      { number: "21-506", name: "이동통신연구실", width: 2 },
      { number: "21-507", name: "딥러닝연구실", width: 2 },
      { number: "21-508", name: "분산시스템연구실", width: 2 },
    ],
  ] },
  { floor: 4, rows: [
    [
      { number: "21-401", name: "멀티미디어 실습실", width: 1.5 },
      { number: "21-402", name: "멀티미디어 실습실", width: 1.5 },
      { number: "21-403", name: "실감 멀티미디어 실험실", width: 2.5 },
      { number: "21-404", name: "프로그램 실습실", width: 3 },
      { number: null, name: "화장실", width: 1 },
    ],
    [
      { number: "21-405", name: "소프트웨어공학 실험실", width: 2 },
      { number: "21-406", name: "소프트웨어공학 실험실", width: 2 },
      { number: "21-407", name: "DB & EC 실험실", width: 2 },
      { number: "21-408", name: "정보보호 & 빅데이터 실험실", width: 2 },
      { number: "21-409", name: "컴퓨터비전 실험실", width: 2 },
    ],
  ] },
  { floor: 3, rows: [
    [
      { number: "21-301", name: "제어시스템 실험실", width: 3 },
      { number: "21-302", name: "오광교 교수실", width: 2 },
      { number: "21-303", name: "전기공학전공사무실", width: 2 },
      { number: "21-304", name: "전기공학전공학생회실", width: 2 },
      { number: null, name: "화장실", width: 1 },
    ],
    [
      { number: "21-305", name: "전력전자 실험실", width: 3 },
      { number: "21-306", name: "김상일 교수실", width: 2 },
      { number: "21-307", name: "전력전자 실험실", width: 1.5 },
      { number: "21-308", name: "전력전자 실험실", width: 3.5 },
    ],
  ] },
  { floor: 2, rows: [
    [
      { number: "21-201", name: "반도체 회로 및 시스템 연구실", width: 3 },
      { number: "21-202", name: "반도체 회로 및 시스템 연구실", width: 3 },
      { number: "21-203", name: "임베디드시스템연구실", width: 3 },
      { number: null, name: "화장실", width: 1 },
    ],
    [
      { number: "21-204", name: "반도체TCAD 연구실", width: 2 },
      { number: "21-205", name: "통신시스템 연구실", width: 2.5 },
      { number: "21-206", name: "패턴인식 및 기계학습 연구실", width: 3 },
      { number: "21-207", name: "전자공학전공 세미나실", width: 2.5 },
    ],
  ] },
  { floor: 1, rows: [
    [
      { number: "21-101", name: "멀티미디어 실습실", width: 3 },
      { number: "21-102", name: "멀티미디어공학전공 대학원 세미나실", width: 3 },
      { number: "21-103", name: "전공컴퓨터실", width: 3 },
      { number: null, name: "화장실", width: 1 },
    ],
    [
      { number: "21-104", name: "컴퓨터그래픽스실험실", width: 2 },
      { number: "21-105", name: "AI신호처리 실험실", width: 2 },
      { number: "21-106", name: "멀티미디어통신 실험실", width: 2 },
      { number: "21-107", name: "인공지능 & 빅데이터 실험실", width: 2 },
      { number: "21-108", name: "전자공학전공 강의실", width: 2 },
    ],
  ] },
];

const FACULTY_WING_FLOORS = [
  { floor: 6, rows: [
    [
      { number: null, name: "화장실", width: 1 },
      { number: "21-610", name: "인공지능공학전공 사무실", width: 2 },
      { number: "21-601", name: "지능형 스마트농업 연구센터", width: 4 },
      { number: "21-602", name: "서버실", width: 2 },
    ],
    [
      { number: "21-603", name: "조용윤 교수실", width: 1.4 },
      { number: "21-604", name: "교수실", width: 1.4 },
      { number: "21-605", name: "박장우 교수실", width: 1.4 },
      { number: "21-606", name: "조경룡 교수실", width: 1.4 },
      { number: "21-607", name: "한대현 교수실", width: 1.4 },
      { number: "21-608", name: "박철영 교수실", width: 1.4 },
      { number: "21-609", name: "신창선 교수실", width: 1.4 },
    ],
  ] },
  { floor: 5, rows: [
    [
      { number: null, name: "화장실", width: 1 },
      { number: "21-509", name: "컴퓨터공학전공학생회실", width: 2.5 },
      { number: "21-510", name: "전공강의실", width: 4 },
      { number: "21-511", name: "대학원세미나실", width: 2.5 },
    ],
    [
      { number: "21-512", name: "컴퓨터공학전공사무실", width: 2 },
      { number: "21-513", name: "김원중 교수실", width: 1.4 },
      { number: "21-514", name: "교수실", width: 1 },
      { number: "21-515", name: "염성관 교수실", width: 1.4 },
      { number: "21-516", name: "정세훈 교수실", width: 1.4 },
      { number: "21-517", name: "김종찬 교수실", width: 1.4 },
      { number: "21-518", name: "신광성 교수실", width: 1.4 },
    ],
  ] },
  { floor: 4, rows: [
    [
      { number: null, name: "화장실", width: 1 },
      { number: "21-410", name: "에너지메카트로닉스 실험실", width: 6 },
    ],
    [
      { number: "21-411", name: "윤근영 교수실", width: 2 },
      { number: "21-412", name: "김대경 교수실", width: 2 },
      { number: "21-413", name: "황성철 교수실", width: 2 },
      { number: "21-414", name: "전력계통 실험실", width: 3 },
    ],
  ] },
  { floor: 3, rows: [
    [
      { number: null, name: "화장실", width: 1 },
      { number: "21-309", name: "기초전자실험실", width: 5 },
      { number: "21-310", name: "기초전자실험준비실", width: 2 },
    ],
    [
      { number: "21-311", name: "전자공학전공사무실", width: 1.4 },
      { number: "21-312", name: "오강록 교수실", width: 1.4 },
      { number: "21-313", name: "교수실", width: 1 },
      { number: "21-314", name: "조병록 교수실", width: 1.4 },
      { number: "21-315", name: "문국철 교수실", width: 1.4 },
      { number: "21-316", name: "손명식 교수실", width: 1.4 },
      { number: "21-317", name: "조두산 교수실", width: 1.4 },
    ],
  ] },
  { floor: 2, rows: [
    [
      { number: null, name: "화장실", width: 1 },
      { number: "21-208", name: "첨단강의실", width: 4.5 },
      { number: "21-209", name: "영상및지능시스템실험실", width: 3.5 },
    ],
    [
      { number: "21-210", name: "인공지능공학전공학생회실", width: 1.3 },
      { number: "21-211", name: "인공지능공학전공사무실", width: 1.3 },
      { number: "21-212", name: "이성근 교수실", width: 1.3 },
      { number: "21-213", name: "오원근 교수실", width: 1.3 },
      { number: "21-214", name: "박상현 교수실", width: 1.3 },
      { number: "21-215", name: "심춘보 교수실", width: 1.3 },
      { number: "21-216", name: "김종호 교수실", width: 1.3 },
    ],
  ] },
  { floor: 1, rows: [
    [
      { number: null, name: "화장실", width: 1 },
      { number: "21-109", name: "컴퓨터공학전공·정보통신공학전공 강의실", width: 4 },
      { number: "21-209-1", name: "전기공학전공 강의실", width: 2.5 },
    ],
    [
      { number: "21-110", name: "관리실", width: 1.5 },
      { number: "21-111", name: "인공지능공학전공학생회실", width: 2 },
      { number: "21-112", name: "전자공학전공학생회실", width: 2 },
      { number: "21-113", name: "스마트농업전공세미나실", width: 2 },
      { number: "21-114", name: "인공지능공학전공강의실", width: 2 },
    ],
  ] },
  { floor: 0, rows: [
    [
      { number: "21-B101", name: "합동강의실", width: 2 },
    ],
  ] },
];

const FLOOR_MAJOR_BY_WING = {
  left: { 1: "인공지능공학전공", 2: "전자공학전공", 3: "전기공학전공", 4: "컴퓨터공학전공", 5: "인공지능공학전공" },
  right: { 0: "합동", 1: "복합", 2: "인공지능공학전공", 3: "전자공학전공", 4: "전기공학전공", 5: "컴퓨터공학전공", 6: "인공지능공학전공" },
};

const WEEKDAYS = ["월", "화", "수", "목", "금"];
const SUBJECTS = ["캡스톤디자인", "자료구조", "컴퓨터네트워크", "디지털논리회로", "인공지능", "전력시스템", "소프트웨어공학", "공학수학"];

function classifyRoom(name) {
  if (name === "화장실") return { specialType: "utility", sizeLabel: "-" };
  if (name.includes("교수실")) return { specialType: "faculty", sizeLabel: "소형" };
  if (name.includes("서버실")) return { specialType: "server", sizeLabel: "소형" };
  if (name.includes("세미나실")) return { specialType: "seminar", sizeLabel: "중형" };
  if (name.includes("사무실") || name.includes("학생회실") || name.includes("관리실")) {
    return { specialType: "office", sizeLabel: "소형" };
  }
  if (name.includes("실험실") || name.includes("연구실") || name.includes("실습실") || name.includes("센터")) {
    return { specialType: "lab", sizeLabel: "중형" };
  }
  return { specialType: "classroom", sizeLabel: "대형" };
}

function createTimetable(roomId, specialType, index) {
  if (!["classroom", "seminar", "lab"].includes(specialType)) return [];

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
  ].map((event, eventIndex) => ({
    id: `${roomId}-event-${eventIndex + 1}`,
    ...event,
    startMinute: event.startHour * 60,
    durationMinutes: event.durationHours * 60,
  }));
}

export function formatRoomNumber(roomNumber) {
  return roomNumber?.startsWith("21-") ? roomNumber.slice(3) : roomNumber;
}

export const D4_BUILDING_DATA = {
  id: "D4",
  displayName: "D4 공대 3호관",
  floors: [0, 1, 2, 3, 4, 5, 6].map((floor) => ({
    id: `floor-${floor}`,
    floor,
    label: floor === 0 ? "B1" : `${floor}층`,
  })),
  // 배열 순서 = 화면 좌→우 배치 순서(실험동 왼쪽, 교수동 오른쪽)와 일치시켜 토글 버튼 순서도 맞춤.
  wings: [
    { id: "left", label: "실험동", floors: 5, x: -2.25, width: 3.25, depth: 4.3, totalFloorAreaSqm: 9860, todayEnergyKwh: 240, hasBasement: false },
    { id: "right", label: "교수동", floors: 6, x: 2.25, width: 3.25, depth: 4.3, totalFloorAreaSqm: 12540, todayEnergyKwh: 310, hasBasement: true },
  ],
  bridges: [{ floor: 3 }, { floor: 5 }],
};

export function getWingById(wingId) {
  return D4_BUILDING_DATA.wings.find((wing) => wing.id === wingId) ?? D4_BUILDING_DATA.wings[0];
}

export function getWingFloorLabel(wing) {
  if (!wing.hasBasement) return `1F~${wing.floors}F (${wing.floors}개 층)`;
  return `B1~${wing.floors}F (${wing.floors + 1}개 층)`;
}

export function getFloorMajor(wingId, floor) {
  return FLOOR_MAJOR_BY_WING[wingId]?.[floor] ?? "";
}

let globalIndex = 0;

function buildRoomsForWing(wingId, floorDefs) {
  const rooms = [];
  floorDefs.forEach(({ floor, rows }) => {
    rows.forEach((cells, rowIndex) => {
      let offset = 0;
      const wing = getWingById(wingId);
      const rowWidth = cells.reduce((sum, cell) => sum + cell.width, 0);
      const usableWidth = wing.width - 0.32;
      const horizontalScale = usableWidth / rowWidth;
      cells.forEach((cell) => {
        const index = globalIndex++;
        const { specialType, sizeLabel } = classifyRoom(cell.name);
        const isUtility = cell.number === null;
        const roomId = isUtility
          ? `d4-${wingId}-utility-${floor}-${rowIndex}-${offset}`
          : `d4-${wingId}-${cell.number}`;
        rooms.push({
          id: roomId,
          roomNumber: isUtility ? cell.name : cell.number,
          floor,
          wing: wingId,
          row: rowIndex,
          colOffset: offset,
          colWidth: cell.width,
          sizeLabel,
          specialType,
          specialLabel: cell.name,
          isSelectable: !isUtility,
          hasLargeScreen: specialType === "classroom" && index % 2 === 0,
          hvacUnits: specialType === "server" ? 2 : specialType === "faculty" ? 1 : 2,
          computerCount: specialType === "lab" && index % 3 === 0 ? 24 : 0,
          weeklySavingsKwh: 18 + ((floor * 13 + index * 7) % 42),
          savingRate: 8 + ((floor + index) % 9),
          timetable: createTimetable(roomId, specialType, floor * 20 + index),
          geometry: {
            x: wing.x - usableWidth / 2 + (offset + cell.width / 2) * horizontalScale,
            z: rowIndex === 0 ? -1.05 : 1.05,
            width: Math.max(0.22, cell.width * horizontalScale - 0.06),
            depth: 1.55,
          },
        });
        offset += cell.width;
      });
    });
  });
  return rooms;
}

export const D4_ROOMS = [
  ...buildRoomsForWing("left", LAB_WING_FLOORS),
  ...buildRoomsForWing("right", FACULTY_WING_FLOORS),
];

export function isD4ElementId(elementId) {
  return D4_ELEMENT_IDS.includes(elementId);
}
