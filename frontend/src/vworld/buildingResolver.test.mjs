import assert from "node:assert/strict";
import test from "node:test";
import { resolveVWorldBuilding } from "./buildingResolver.mjs";

const EXPECTED_BUILDINGS = [
  ["SC090179", "BLD_D3", "공과대학 2호관"],
  ["SC090180", "BLD_D2", "공과대학 1호관"],
  ["SC090089", "BLD_D1", "창업보육센터"],
  ["SC030008", "BLD_C3", "공동실험실습관"],
  ["SC030418", "BLD_C2", "친환경농업센터"],
  ["SC030009", "BLD_C4", "환경친화형물질공장기술혁신센터"],
  ["SC030012", "BLD_B6", "제1중앙공급실"],
  ["SC030013", "BLD_B5", "생명산업과학대학온실"],
  ["SC030394", "BLD_B4", "생명산업과학대학2호관"],
  ["SC030448", "BLD_B3", "생명산업과학대학1호관"],
  ["SC030382", "BLD_B2", "70주년기념관"],
  ["SC030464", "BLD_B1", "박물관"],
  ["SC030058", "BLD_A17", "체육관"],
  ["SC030030", "BLD_A8", "학생생활관 향림관"],
  ["SC090108", "BLD_A9", "학생생활관 청운관"],
  ["SC090106", "BLD_A12", "우정원"],
  ["SC090104", "BLD_A11", "제2중앙공급실"],
  ["SC090105", "BLD_A10", "인재관"],
  ["SC090101", "BLD_A6", "학생생활관 창조관"],
  ["SC030028", "BLD_A7", "학생생활관 관리동"],
  ["SC030527", "BLD_A5", "학생생활관 진리관"],
  ["SC030493", "BLD_A1", "대학본부"],
  ["SC030523", "BLD_A2", "약학대학"],
  ["SC090098", "BLD_E1", "학생회관"],
  ["SC090102", "BLD_E2", "기초교육관"],
  ["SC090091", "BLD_E3", "사범대학"],
  ["SC030409", "BLD_C1", "도서관"],
  ["SC090094", "BLD_E8", "인문예술대학"],
  ["SC090113", "BLD_E7", "사회과학대학"],
  ["SC090103", "BLD_E6", "미래창조관"],
  ["SC030061", "BLD_F1", "국제문화컨벤션관"],
  ["SC030380", "BLD_F2", "평생교육원"],
  ["SC030673", "BLD_F4", "연립관사"],
];

test("resolves every mapped VWorld MODEL_NAME to a canonical selection", () => {
  for (const [modelName, elementId, displayName] of EXPECTED_BUILDINGS) {
    assert.deepEqual(resolveVWorldBuilding(modelName), {
      MODEL_NAME: modelName,
      elementId,
      displayName,
    });
  }
});

test("returns null for missing and unmapped VWorld MODEL_NAME values", () => {
  assert.equal(resolveVWorldBuilding(), null);
  assert.equal(resolveVWorldBuilding(null), null);
  assert.equal(resolveVWorldBuilding(""), null);
  assert.equal(resolveVWorldBuilding("SC999999"), null);
});
