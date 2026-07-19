import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASSROOMS,
  SCENARIO_PRESETS,
  chooseRecommendedScenario,
  estimateBuildingEnergy,
  estimateCampusEnergy,
  formatScheduleLabel,
  getRoomHourlyBreakdown,
} from "./classroomEnergy.mjs";
import { D4_BUILDING_DATA, D4_ROOMS, isD4ElementId } from "./d4BuildingData.mjs";

test("estimates classroom baseline and optimized power from timetable assumptions", () => {
  const result = estimateCampusEnergy({
    rooms: CLASSROOMS,
    outdoorTemperature: 30,
    scenario: SCENARIO_PRESETS.balanced,
  });

  assert.ok(result.weeklyBaselineKwh > result.weeklyOptimizedKwh);
  assert.ok(result.monthlySavingsKwh > 0);
  assert.ok(result.savingsRate > 10);
  assert.ok(result.rooms[0].weeklySavingsKwh >= result.rooms.at(-1).weeklySavingsKwh);
});

test("stronger scenario saves more electricity than conservative scenario", () => {
  const conservative = estimateCampusEnergy({
    outdoorTemperature: 30,
    scenario: SCENARIO_PRESETS.conservative,
  });
  const aggressive = estimateCampusEnergy({
    outdoorTemperature: 30,
    scenario: SCENARIO_PRESETS.aggressive,
  });

  assert.ok(aggressive.weeklySavingsKwh > conservative.weeklySavingsKwh);
  assert.ok(aggressive.weeklyOptimizedKwh < conservative.weeklyOptimizedKwh);
});

test("formats empty and populated schedules for dashboard display", () => {
  assert.equal(formatScheduleLabel([]), "상시 운영");
  assert.match(formatScheduleLabel(CLASSROOMS[0].timetable), /자료구조/);
});

test("models computer labs as a separate high-load classroom type", () => {
  const result = estimateCampusEnergy({
    rooms: CLASSROOMS,
    outdoorTemperature: 29,
    scenario: SCENARIO_PRESETS.balanced,
  });
  const computerLab = result.rooms.find((room) => room.specialType === "computer_lab");

  assert.ok(computerLab, "expected a computer lab sample room");
  assert.equal(computerLab.specialLabel, "컴퓨터실");
  assert.ok(computerLab.computerCount >= 20);
  assert.ok(computerLab.weeklyBaselineKwh > 120);
});

test("puts professor office into idle mode while that professor is teaching", () => {
  const result = estimateCampusEnergy({
    rooms: CLASSROOMS,
    outdoorTemperature: 30,
    scenario: SCENARIO_PRESETS.balanced,
  });
  const office = result.rooms.find((room) => room.id === "ENG-PROF-KIM");
  const teachingHour = getRoomHourlyBreakdown({
    room: office,
    day: "월",
    hour: 9,
    outdoorTemperature: 30,
    scenario: SCENARIO_PRESETS.balanced,
  });
  const officeHour = getRoomHourlyBreakdown({
    room: office,
    day: "수",
    hour: 15,
    outdoorTemperature: 30,
    scenario: SCENARIO_PRESETS.balanced,
  });

  assert.equal(teachingHour.occupancyState, "professor_teaching");
  assert.ok(teachingHour.optimizedKw < officeHour.optimizedKw);
  assert.ok(office.professorTeachingHours > 0);
});

test("recommends an explainable AI savings scenario", () => {
  const recommendation = chooseRecommendedScenario({
    outdoorTemperature: 31,
    rooms: CLASSROOMS,
  });

  assert.ok(recommendation.scenarioId);
  assert.ok(recommendation.label.includes("추천"));
  assert.ok(recommendation.expectedMonthlySavingsKwh > 0);
  assert.ok(recommendation.reasons.some((reason) => reason.includes("원격 제어")));
});

test("seeds D4 mock building data with room source metadata", () => {
  assert.ok(isD4ElementId("BLD_D3"));
  assert.ok(isD4ElementId("BLD_D4"));
  assert.equal(D4_BUILDING_DATA.floors.length, 6);
  assert.equal(D4_BUILDING_DATA.wings.find((wing) => wing.id === "left").floors, 5);
  assert.equal(D4_BUILDING_DATA.wings.find((wing) => wing.id === "right").floors, 6);
  assert.deepEqual(
    D4_BUILDING_DATA.bridges.map((bridge) => bridge.floor),
    [3, 5],
  );
  assert.ok(D4_ROOMS.some((room) => room.roomNumber === "101"));
  assert.ok(D4_ROOMS.some((room) => room.roomNumber === "102"));
  assert.ok(D4_ROOMS.some((room) => room.roomNumber === "103"));
  assert.ok(D4_ROOMS.some((room) => room.roomNumber === "601" && room.side === "right"));
  assert.ok(D4_ROOMS.some((room) => room.specialType === "computer_lab"));
  assert.ok(D4_ROOMS.some((room) => room.specialType === "faculty"));
  assert.ok(D4_ROOMS.every((room) => room.floor && room.size && room.sourcePath));
  assert.ok(D4_ROOMS.every((room) => room.geometry?.width > 0 && room.geometry?.depth > 0));
});

test("estimates D4 building energy from its own room list", () => {
  const result = estimateBuildingEnergy({
    building: D4_BUILDING_DATA,
    outdoorTemperature: 30,
    scenario: SCENARIO_PRESETS.balanced,
  });
  const recommendation = chooseRecommendedScenario({
    rooms: D4_BUILDING_DATA.rooms,
    outdoorTemperature: 30,
  });
  const office = D4_BUILDING_DATA.rooms.find((room) => room.id === "D4-411");
  const teachingHour = getRoomHourlyBreakdown({
    room: office,
    rooms: D4_BUILDING_DATA.rooms,
    day: "월",
    hour: 9,
    outdoorTemperature: 30,
    scenario: SCENARIO_PRESETS.balanced,
  });

  assert.equal(result.buildingId, D4_BUILDING_DATA.id);
  assert.equal(result.rooms.length, D4_BUILDING_DATA.rooms.length);
  assert.ok(result.monthlyBaselineKwh > result.monthlyOptimizedKwh);
  assert.ok(result.rooms[0].weeklySavingsKwh >= result.rooms.at(-1).weeklySavingsKwh);
  assert.equal(teachingHour.occupancyState, "professor_teaching");
  assert.ok(recommendation.topRoom.id.startsWith("D4-"));
});
