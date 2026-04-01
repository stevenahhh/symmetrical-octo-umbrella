import { faker } from "@faker-js/faker";

const BUILDINGS_LIST = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "A8",
  "A9",
  "A10",
  "A11",
  "A12",
  "A13",
  "A14",
  "A15",
  "A16",
  "A17",
  "A18",
  "A19",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6",
  "B7",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "E1",
  "E2",
  "E3",
  "E4",
  "E5",
  "E6",
  "E7",
  "E8",
  "F1",
  "F2",
  "F3",
  "F4",
];

// 이전 상태를 저장할 메모리 (변화 폭을 줄이기 위함)
let prevBldData = null;
let prevTrafficData = null;

export const generateMockData = () => {
  const isFirstTime = !prevBldData;

  const newData = BUILDINGS_LIST.map((id) => {
    const isEngineering = id.startsWith("D");
    const basePwr = isEngineering ? 450 : 150;
    const baseSol = 45;

    // 이전 데이터가 있으면 거기서 +- 5% 이내로만 변화
    let pwr_u, sol_g;
    if (isFirstTime) {
      pwr_u = faker.number.float({
        min: basePwr - 50,
        max: basePwr + 50,
        precision: 0.1,
      });
      sol_g = faker.number.float({ min: 10, max: 80, precision: 0.1 });
    } else {
      const prev = prevBldData.find((b) => b.bld_id === id);
      const changeRange = 0.05; // 5% 내외 변화
      pwr_u =
        prev.pwr_u *
        (1 +
          faker.number.float({
            min: -changeRange,
            max: changeRange,
            precision: 0.01,
          }));
      sol_g =
        prev.sol_g *
        (1 +
          faker.number.float({
            min: -changeRange,
            max: changeRange,
            precision: 0.01,
          }));

      // 최소/최대 안전장치 (데이터 튀는 거 방지)
      pwr_u = Math.min(Math.max(pwr_u, 30), 800);
      sol_g = Math.min(Math.max(sol_g, 0), 120);
    }

    return {
      ts: Math.floor(Date.now() / 1000),
      bld_id: id,
      pwr_u: parseFloat(pwr_u.toFixed(1)),
      pwr_l: 500.0,
      sol_g: parseFloat(sol_g.toFixed(1)),
    };
  });

  prevBldData = newData;
  return newData;
};

export const generateTrafficData = () => {
  const LOCATIONS = ["Main_Gate", "Bibong_Ro", "Samsan_Ro"];
  const isFirstTime = !prevTrafficData;

  const newData = LOCATIONS.map((loc) => {
    if (isFirstTime) {
      return {
        ts: Math.floor(Date.now() / 1000),
        loc_id: loc,
        car: faker.number.int({ min: 30, max: 50 }),
        ped: faker.number.int({ min: 50, max: 80 }),
        kb: faker.number.int({ min: 10, max: 15 }),
        speed: faker.number.int({ min: 30, max: 50 }),
      };
    }

    const prev = prevTrafficData.find((t) => t.loc_id === loc);
    // 사람이나 차 숫자가 한 번에 30명씩 안 바뀌게 조정
    return {
      ts: Math.floor(Date.now() / 1000),
      loc_id: loc,
      car: Math.max(0, prev.car + faker.number.int({ min: -2, max: 2 })),
      ped: Math.max(0, prev.ped + faker.number.int({ min: -3, max: 3 })),
      kb: Math.max(0, prev.kb + faker.number.int({ min: -1, max: 1 })),
      speed: Math.max(10, prev.speed + faker.number.int({ min: -5, max: 5 })),
    };
  });

  prevTrafficData = newData;
  return newData;
};

export const generateD4History = () => {
  return Array.from({ length: 12 }, (_, i) => ({
    time: `${i * 2}h`,
    pwr_u: faker.number.float({ min: 400, max: 450, precision: 1 }),
    sol_g: faker.number.float({ min: 40, max: 60, precision: 1 }),
  }));
};
