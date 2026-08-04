import assert from "node:assert/strict";
import {
  ContractParseError,
  parseRoofLayoutDocument,
  summarizePanelArray,
} from "./roofContracts.mjs";
import { D4_ROOF_SCENARIO_FIXTURE } from "./fixtures/d4RoofScenarioFixture.mjs";

const parsed = parseRoofLayoutDocument(JSON.parse(JSON.stringify(D4_ROOF_SCENARIO_FIXTURE)));
const summary = summarizePanelArray(parsed.scenarios[0].arrays[0], parsed.modules);
assert.deepEqual(summary, { moduleCount: 16, capacityKwp: 7.056 });

const rejectedFields = [];
for (const [field, mutate] of [
  ["originMeters.xMeters", (payload) => { payload.scenarios[0].arrays[0].originMeters.xMeters = Number.NaN; }],
  ["tiltDeg", (payload) => { payload.scenarios[0].arrays[0].tiltDeg = 46; }],
  ["columns", (payload) => { payload.scenarios[0].arrays[0].columns = 0; }],
]) {
  const malformed = structuredClone(D4_ROOF_SCENARIO_FIXTURE);
  mutate(malformed);
  assert.throws(() => parseRoofLayoutDocument(malformed), ContractParseError);
  rejectedFields.push(field);
}

console.log(JSON.stringify({ status: "pass", ...summary, rejectedFields }));
