export const ROOM_SIZE_PROFILE = {
  small: {
    label: "소형",
    lightingKw: 0.8,
    plugKw: 0.45,
    hvacKw: 2.2,
    standbyKw: 0.18,
  },
  medium: {
    label: "중형",
    lightingKw: 1.35,
    plugKw: 0.75,
    hvacKw: 3.6,
    standbyKw: 0.26,
  },
  large: {
    label: "대형",
    lightingKw: 2.4,
    plugKw: 1.1,
    hvacKw: 5.4,
    standbyKw: 0.38,
  },
};

export const SPECIAL_ROOM_PROFILE = {
  lecture: {
    label: "일반 강의실",
    continuousKw: 0,
    classKw: 0,
    hvacMultiplier: 1,
  },
  lab: {
    label: "실험실",
    continuousKw: 0.55,
    classKw: 1.1,
    hvacMultiplier: 1.12,
  },
  computer_lab: {
    label: "컴퓨터실",
    continuousKw: 0.75,
    classKw: 0.85,
    hvacMultiplier: 1.18,
  },
  server: {
    label: "서버실",
    continuousKw: 3.2,
    classKw: 0.2,
    hvacMultiplier: 1.45,
  },
  faculty: {
    label: "교수/조교실",
    continuousKw: 0.35,
    classKw: 0.45,
    hvacMultiplier: 0.78,
  },
};

export const SCENARIO_PRESETS = {
  conservative: {
    id: "conservative",
    label: "보수 절감",
    occupancyControl: 0.35,
    hvacSetback: 0.12,
    screenOff: 0.35,
    standbyCut: 0.2,
  },
  balanced: {
    id: "balanced",
    label: "균형 절감",
    occupancyControl: 0.62,
    hvacSetback: 0.2,
    screenOff: 0.55,
    standbyCut: 0.38,
  },
  aggressive: {
    id: "aggressive",
    label: "강화 절감",
    occupancyControl: 0.78,
    hvacSetback: 0.28,
    screenOff: 0.72,
    standbyCut: 0.55,
  },
};

export const CLASSROOMS = [
  {
    id: "ENG-101",
    name: "공학관 101",
    size: "large",
    airConditioners: 3,
    hasLargeScreen: true,
    specialType: "lecture",
    timetable: [
      { day: "월", startHour: 9, durationHours: 3, subject: "자료구조", professorId: "kim" },
      { day: "수", startHour: 13, durationHours: 3, subject: "컴퓨터구조", professorId: "park" },
      { day: "목", startHour: 10, durationHours: 2, subject: "캡스톤디자인" },
    ],
  },
  {
    id: "ENG-204",
    name: "공학관 204",
    size: "medium",
    airConditioners: 2,
    hasLargeScreen: true,
    specialType: "lecture",
    timetable: [
      { day: "월", startHour: 13, durationHours: 2, subject: "인공지능", professorId: "lee" },
      { day: "화", startHour: 10, durationHours: 3, subject: "웹프로그래밍", professorId: "kim" },
      { day: "금", startHour: 9, durationHours: 2, subject: "운영체제" },
    ],
  },
  {
    id: "ENG-207",
    name: "컴퓨터 실습실",
    size: "large",
    airConditioners: 4,
    hasLargeScreen: true,
    specialType: "computer_lab",
    computerCount: 32,
    timetable: [
      { day: "월", startHour: 14, durationHours: 3, subject: "프로그래밍 실습", professorId: "kim" },
      { day: "수", startHour: 9, durationHours: 3, subject: "데이터베이스 실습", professorId: "lee" },
      { day: "목", startHour: 13, durationHours: 3, subject: "AI 모델링", professorId: "park" },
    ],
  },
  {
    id: "ENG-305",
    name: "네트워크 실험실",
    size: "medium",
    airConditioners: 2,
    hasLargeScreen: true,
    specialType: "lab",
    timetable: [
      { day: "화", startHour: 14, durationHours: 3, subject: "네트워크 실습", professorId: "park" },
      { day: "목", startHour: 14, durationHours: 3, subject: "IoT 실험" },
    ],
  },
  {
    id: "ENG-SVR",
    name: "서버 장비실",
    size: "small",
    airConditioners: 2,
    hasLargeScreen: false,
    specialType: "server",
    timetable: [],
  },
  {
    id: "ENG-PROF-KIM",
    name: "김교수 연구실",
    size: "small",
    airConditioners: 1,
    hasLargeScreen: false,
    specialType: "faculty",
    professorId: "kim",
    timetable: [
      { day: "월", startHour: 10, durationHours: 2, subject: "상담/지도" },
      { day: "수", startHour: 15, durationHours: 2, subject: "프로젝트 미팅" },
      { day: "금", startHour: 13, durationHours: 2, subject: "연구 세미나" },
    ],
  },
  {
    id: "ENG-401",
    name: "대형 세미나실",
    size: "large",
    airConditioners: 4,
    hasLargeScreen: true,
    specialType: "lecture",
    timetable: [
      { day: "화", startHour: 9, durationHours: 2, subject: "교양 SW" },
      { day: "수", startHour: 10, durationHours: 2, subject: "초청 세미나" },
      { day: "금", startHour: 15, durationHours: 2, subject: "졸업작품 발표" },
    ],
  },
];

const CLASS_DAYS = ["월", "화", "수", "목", "금"];
const DAY_HOURS = Array.from({ length: 14 }, (_, index) => index + 8);
const SCREEN_KW = 0.65;
const CLASS_PREHEAT_HOURS = 0.5;
const COMPUTER_ACTIVE_KW = 0.16;
const COMPUTER_STANDBY_KW = 0.025;
const PROFESSOR_OFFICE_IDLE_FACTOR = 0.28;

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function getRoomSizeProfile(size) {
  return ROOM_SIZE_PROFILE[size] ?? ROOM_SIZE_PROFILE.medium;
}

function getSpecialProfile(specialType) {
  return SPECIAL_ROOM_PROFILE[specialType] ?? SPECIAL_ROOM_PROFILE.lecture;
}

function getThermalDemand(outdoorTemperature) {
  if (!Number.isFinite(outdoorTemperature)) return 0.45;
  if (outdoorTemperature >= 26) return clampRatio(0.45 + (outdoorTemperature - 26) * 0.055);
  if (outdoorTemperature <= 18) return clampRatio(0.35 + (18 - outdoorTemperature) * 0.045);
  return 0.18;
}

function hasClassAt(room, day, hour) {
  return room.timetable.some((entry) => {
    if (entry.day !== day) return false;
    return hour >= entry.startHour && hour < entry.startHour + entry.durationHours;
  });
}

function isProfessorTeaching(room, rooms, day, hour) {
  if (room.specialType !== "faculty" || !room.professorId) return false;
  return rooms.some((candidate) => {
    if (candidate.id === room.id || candidate.specialType === "faculty") return false;
    return candidate.timetable.some((entry) => {
      if (entry.professorId !== room.professorId || entry.day !== day) return false;
      return hour >= entry.startHour && hour < entry.startHour + entry.durationHours;
    });
  });
}

function getOccupancyState(room, rooms, day, hour) {
  if (isProfessorTeaching(room, rooms, day, hour)) return "professor_teaching";
  if (hasClassAt(room, day, hour)) return "class";
  return "idle";
}

function calculateHourlyLoad(room, day, hour, outdoorTemperature) {
  return getRoomHourlyBreakdown({
    room,
    rooms: CLASSROOMS,
    day,
    hour,
    outdoorTemperature,
    scenario: SCENARIO_PRESETS.balanced,
  }).baselineKw;
}

export function getRoomHourlyBreakdown({
  room,
  rooms = CLASSROOMS,
  day,
  hour,
  outdoorTemperature,
  scenario = SCENARIO_PRESETS.balanced,
}) {
  const size = getRoomSizeProfile(room.size);
  const special = getSpecialProfile(room.specialType);
  const occupancyState = getOccupancyState(room, rooms, day, hour);
  const occupied = occupancyState === "class";
  const professorTeaching = occupancyState === "professor_teaching";
  const nearClass = room.timetable.some((entry) => {
    if (entry.day !== day) return false;
    return hour >= entry.startHour - CLASS_PREHEAT_HOURS && hour < entry.startHour;
  });
  const occupancyFactor = occupied ? 1 : nearClass ? 0.42 : professorTeaching ? 0 : 0;
  const thermalDemand = getThermalDemand(outdoorTemperature);
  const officeIdleFactor = professorTeaching ? PROFESSOR_OFFICE_IDLE_FACTOR : 1;
  const hvacKw =
    size.hvacKw *
    Math.max(1, room.airConditioners) *
    0.52 *
    thermalDemand *
    special.hvacMultiplier *
    (occupied ? 1 : nearClass ? 0.5 : 0.22) *
    officeIdleFactor;
  const screenKw = room.hasLargeScreen && occupied ? SCREEN_KW : 0;
  const computerCount = room.computerCount ?? 0;
  const computerKw =
    room.specialType === "computer_lab"
      ? computerCount * (occupied ? COMPUTER_ACTIVE_KW : COMPUTER_STANDBY_KW)
      : 0;
  const classKw =
    (size.lightingKw + size.plugKw + special.classKw) * occupancyFactor + screenKw + computerKw;
  const baselineKw =
    (size.standbyKw + special.continuousKw) * officeIdleFactor + classKw + hvacKw;
  const optimizedKw = optimizeHourlyLoad(
    baselineKw,
    room,
    day,
    hour,
    outdoorTemperature,
    scenario,
    occupancyState,
  );

  return {
    baselineKw,
    optimizedKw,
    occupancyState,
    computerKw,
    hvacKw,
    controllableKw: Math.max(0, baselineKw - special.continuousKw),
  };
}

function optimizeHourlyLoad(rawLoad, room, day, hour, outdoorTemperature, scenario, occupancyState) {
  const size = getRoomSizeProfile(room.size);
  const special = getSpecialProfile(room.specialType);
  const occupied = occupancyState === "class";
  const professorTeaching = occupancyState === "professor_teaching";
  const occupancyControl = clampRatio(scenario.occupancyControl);
  const standbyCut = clampRatio(scenario.standbyCut);
  const screenOff = clampRatio(scenario.screenOff);
  const hvacSetback = clampRatio(scenario.hvacSetback);
  const officeIdleFactor = professorTeaching ? PROFESSOR_OFFICE_IDLE_FACTOR : 1;
  const unavoidable = special.continuousKw * officeIdleFactor + size.standbyKw * (1 - standbyCut);
  const controllable = Math.max(0, rawLoad - special.continuousKw - size.standbyKw);
  const occupancyReduction = occupied ? 0 : occupancyControl;
  const screenReduction = room.hasLargeScreen && occupied ? SCREEN_KW * screenOff : 0;
  const computerStandbyReduction =
    room.specialType === "computer_lab" && !occupied
      ? (room.computerCount ?? 0) * COMPUTER_STANDBY_KW * standbyCut
      : 0;
  const professorOfficeReduction = professorTeaching ? controllable * 0.45 : 0;
  const hvacReduction = controllable * getThermalDemand(outdoorTemperature) * hvacSetback;
  const optimized = unavoidable + controllable * (1 - occupancyReduction) - screenReduction - hvacReduction;

  return Math.max(unavoidable, optimized - computerStandbyReduction - professorOfficeReduction);
}

function sumRoom(room, rooms, outdoorTemperature, scenario) {
  let baselineKwh = 0;
  let optimizedKwh = 0;
  let peakKw = 0;
  let professorTeachingHours = 0;

  for (const day of CLASS_DAYS) {
    for (const hour of DAY_HOURS) {
      const breakdown = getRoomHourlyBreakdown({
        room,
        rooms,
        day,
        hour,
        outdoorTemperature,
        scenario,
      });
      baselineKwh += breakdown.baselineKw;
      optimizedKwh += breakdown.optimizedKw;
      peakKw = Math.max(peakKw, breakdown.baselineKw);
      if (breakdown.occupancyState === "professor_teaching") professorTeachingHours += 1;
    }
  }

  return {
    ...room,
    sizeLabel: getRoomSizeProfile(room.size).label,
    specialLabel: getSpecialProfile(room.specialType).label,
    weeklyBaselineKwh: baselineKwh,
    weeklyOptimizedKwh: optimizedKwh,
    weeklySavingsKwh: baselineKwh - optimizedKwh,
    savingsRate: baselineKwh > 0 ? ((baselineKwh - optimizedKwh) / baselineKwh) * 100 : 0,
    peakKw,
    classHours: room.timetable.reduce((sum, entry) => sum + entry.durationHours, 0),
    professorTeachingHours,
  };
}

export function estimateCampusEnergy({
  rooms = CLASSROOMS,
  outdoorTemperature = 26,
  scenario = SCENARIO_PRESETS.balanced,
} = {}) {
  const roomResults = rooms.map((room) => sumRoom(room, rooms, outdoorTemperature, scenario));
  const weeklyBaselineKwh = roomResults.reduce((sum, room) => sum + room.weeklyBaselineKwh, 0);
  const weeklyOptimizedKwh = roomResults.reduce((sum, room) => sum + room.weeklyOptimizedKwh, 0);
  const weeklySavingsKwh = weeklyBaselineKwh - weeklyOptimizedKwh;
  const peakKw = roomResults.reduce((max, room) => Math.max(max, room.peakKw), 0);

  return {
    rooms: roomResults.sort((a, b) => b.weeklySavingsKwh - a.weeklySavingsKwh),
    weeklyBaselineKwh,
    weeklyOptimizedKwh,
    weeklySavingsKwh,
    monthlyBaselineKwh: weeklyBaselineKwh * 4.345,
    monthlyOptimizedKwh: weeklyOptimizedKwh * 4.345,
    monthlySavingsKwh: weeklySavingsKwh * 4.345,
    savingsRate: weeklyBaselineKwh > 0 ? (weeklySavingsKwh / weeklyBaselineKwh) * 100 : 0,
    peakKw,
  };
}

export function estimateBuildingEnergy({
  building,
  rooms = building?.rooms ?? CLASSROOMS,
  outdoorTemperature = 26,
  scenario = SCENARIO_PRESETS.balanced,
} = {}) {
  const simulation = estimateCampusEnergy({
    rooms,
    outdoorTemperature,
    scenario,
  });

  return {
    buildingId: building?.id ?? "campus",
    buildingName: building?.displayName ?? building?.name ?? "캠퍼스",
    source: building?.source,
    floors: building?.floors ?? [],
    ...simulation,
  };
}

export function chooseRecommendedScenario({
  rooms = CLASSROOMS,
  outdoorTemperature = 26,
} = {}) {
  const candidates = Object.values(SCENARIO_PRESETS).map((scenario) => {
    const simulation = estimateCampusEnergy({ rooms, outdoorTemperature, scenario });
    const disruptionPenalty =
      scenario.id === "aggressive" ? 18 : scenario.id === "conservative" ? 4 : 8;
    const comfortPenalty =
      outdoorTemperature >= 30 && scenario.id === "aggressive" ? 12 : 3;
    const remoteControlBonus =
      scenario.hvacSetback * 35 + scenario.standbyCut * 25 + scenario.screenOff * 15;
    const score =
      simulation.monthlySavingsKwh * 0.45 + remoteControlBonus - disruptionPenalty - comfortPenalty;

    return {
      scenario,
      simulation,
      score,
    };
  });
  const best = candidates.sort((a, b) => b.score - a.score)[0];

  return {
    scenarioId: best.scenario.id,
    label: `AI 추천: ${best.scenario.label}`,
    score: best.score,
    expectedMonthlySavingsKwh: best.simulation.monthlySavingsKwh,
    expectedSavingsRate: best.simulation.savingsRate,
    topRoom: best.simulation.rooms[0],
    reasons: [
      `월 ${Math.round(best.simulation.monthlySavingsKwh)}kWh 절감 예상`,
      "수업 시간표와 교수실 비점유 시간을 함께 반영",
      "원격 제어 가능한 냉난방, 스크린, PC 대기전력 항목의 효과가 큼",
    ],
  };
}

export function formatScheduleLabel(timetable) {
  if (!Array.isArray(timetable) || timetable.length === 0) return "상시 운영";
  return timetable
    .slice(0, 3)
    .map((entry) => `${entry.day} ${entry.startHour}:00 ${entry.subject}`)
    .join(" · ");
}
