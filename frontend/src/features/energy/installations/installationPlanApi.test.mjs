import assert from "node:assert/strict";
import test from "node:test";
import { createInstallationPlanClient, createPlanDraftFromExisting, InstallationPlanContractError, parseInstallationPlan } from "./installationPlanApi.mjs";

const array = {
  id: "array-1", installation_plan_id: "plan-1", roof_id: "D4-roof-west", roof_zone_id: "D4-roof-west-main",
  module_id: "module-default-441wp", origin_x_m: 10, origin_y_m: 12, rows: 2, columns: 8,
  azimuth_deg: 180, tilt_deg: 25, orientation: "portrait", module_width_m: 1.05,
  module_length_m: 2.1, module_efficiency_percent: 20, module_nominal_power_wp: 441,
  inter_panel_gap_m: 0.02,
};
const plan = {
  id: "plan-1", building_id: "D4", name: "남향 기준안",
  created_at: "2026-08-04T10:00:00+09:00", updated_at: "2026-08-04T10:00:00+09:00", arrays: [array],
};
const planArrays = parseInstallationPlan(plan).arrays;
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("installation plan client binds every CRUD and representative route and preserves roof-local numbers", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === "DELETE") return { ok: true, status: 204, json: async () => null };
    if (url.endsWith("/representative-installation-plan")) {
      if (options.method === "DELETE") return { ok: true, status: 204, json: async () => null };
      return response({ building_id: "D4", installation_plan_id: "plan-1", selected_at: "2026-08-04T10:00:00+09:00" });
    }
    if (url.endsWith("/installation-plans") && !options.method) return response([{ id: "plan-1", building_id: "D4", name: "남향 기준안", array_count: 1, updated_at: "2026-08-04T10:00:00+09:00", is_representative: true }]);
    return response(plan, options.method === "POST" ? 201 : 200);
  };
  const client = createInstallationPlanClient("http://api.test", fetchImpl);

  const listed = await client.list("D4");
  const loaded = await client.get("plan-1");
  const created = await client.create({ buildingId: "D4", name: "남향 기준안", arrays: loaded.arrays });
  await client.update("plan-1", { buildingId: "D4", name: "수정안", arrays: loaded.arrays });
  await client.copy(loaded, "복사안");
  await client.remove("plan-1");
  const representative = await client.getRepresentative("D4");
  await client.setRepresentative("D4", "plan-1");
  await client.unsetRepresentative("D4");

  assert.equal(listed[0].arrayCount, 1);
  assert.equal(loaded.arrays[0].originMeters.xMeters, 10);
  assert.equal(created.arrays[0].originMeters.yMeters, 12);
  assert.equal(representative.installationPlanId, "plan-1");
  assert.deepEqual(requests.map(({ url, options }) => [url, options.method ?? "GET"]), [
    ["http://api.test/energy/buildings/D4/installation-plans", "GET"],
    ["http://api.test/energy/installation-plans/plan-1", "GET"],
    ["http://api.test/energy/installation-plans", "POST"],
    ["http://api.test/energy/installation-plans/plan-1", "PUT"],
    ["http://api.test/energy/installation-plans", "POST"],
    ["http://api.test/energy/installation-plans/plan-1", "DELETE"],
    ["http://api.test/energy/buildings/D4/representative-installation-plan", "GET"],
    ["http://api.test/energy/buildings/D4/representative-installation-plan", "PUT"],
    ["http://api.test/energy/buildings/D4/representative-installation-plan", "DELETE"],
  ]);
  const createBody = JSON.parse(requests[2].options.body);
  assert.equal(createBody.arrays[0].origin_x_m, 10);
  assert.equal("installation_plan_id" in createBody.arrays[0], false);
  assert.deepEqual(JSON.parse(requests[7].options.body), { installation_plan_id: "plan-1" });
});

test("new-plan drafts reuse the representative roof-local layout instead of inventing an empty plan", () => {
  const first = { id: "plan-1", buildingId: "D4", arrays: [{ id: "array-first" }] };
  const representative = { id: "plan-2", buildingId: "D4", arrays: [{ id: "array-representative" }] };
  const draft = createPlanDraftFromExisting({ buildingId: "D4", plans: [first, representative], representativePlanId: "plan-2" });
  assert.equal(draft.name, "D4 새 설치안");
  assert.equal(draft.arrays, representative.arrays);
  assert.throws(() => createPlanDraftFromExisting({ buildingId: "D4", plans: [], representativePlanId: null }), /existing installation plan/);
});

test("listDetails rejects listed and detailed building identity mismatches", async () => {
  const listedMismatch = createInstallationPlanClient("http://api.test", async () => response([
    { id: "plan-1", building_id: "D5", name: "잘못된 목록", array_count: 1, updated_at: "2026-08-04T10:00:00+09:00", is_representative: false },
  ]));
  await assert.rejects(() => listedMismatch.listDetails("D4"), (error) => error instanceof InstallationPlanContractError && error.field === "plans");

  const detailedMismatch = createInstallationPlanClient("http://api.test", async (url) => url.endsWith("/installation-plans")
    ? response([{ id: "plan-1", building_id: "D4", name: "목록", array_count: 1, updated_at: "2026-08-04T10:00:00+09:00", is_representative: false }])
    : response({ ...plan, building_id: "D5" }));
  await assert.rejects(() => detailedMismatch.listDetails("D4"), (error) => error instanceof InstallationPlanContractError && error.field === "plans[0]");
});

test("get and getRepresentative bind success responses to the requested identities", async () => {
  const wrongPlan = createInstallationPlanClient("http://api.test", async () => response({
    ...plan,
    id: "plan-other",
    arrays: [{ ...array, installation_plan_id: "plan-other" }],
  }));
  await assert.rejects(
    () => wrongPlan.get("plan-1"),
    (error) => error instanceof InstallationPlanContractError && error.field === "plan.id",
  );

  const wrongBuilding = createInstallationPlanClient("http://api.test", async () => response({ building_id: "D5", installation_plan_id: "plan-1", selected_at: null }));
  await assert.rejects(
    () => wrongBuilding.getRepresentative("D4"),
    (error) => error instanceof InstallationPlanContractError && error.field === "representativePlan.building_id",
  );
});

test("create and update reject success responses outside the requested plan context", async () => {
  const wrongBuilding = createInstallationPlanClient("http://api.test", async () => response({ ...plan, building_id: "D5" }, 201));
  await assert.rejects(
    () => wrongBuilding.create({ buildingId: "D4", name: "신규안", arrays: planArrays }),
    (error) => error instanceof InstallationPlanContractError && error.field === "plan.building_id",
  );

  await assert.rejects(
    () => wrongBuilding.update("plan-1", { buildingId: "D4", name: "수정안", arrays: planArrays }),
    (error) => error instanceof InstallationPlanContractError && error.field === "plan.building_id",
  );

  const wrongUpdateId = createInstallationPlanClient("http://api.test", async () => response({
    ...plan,
    id: "plan-other",
    arrays: [{ ...array, installation_plan_id: "plan-other" }],
  }));
  await assert.rejects(
    () => wrongUpdateId.update("plan-1", { buildingId: "D4", name: "수정안", arrays: planArrays }),
    (error) => error instanceof InstallationPlanContractError && error.field === "plan.id",
  );
});

test("representative mutation rejects responses that do not match the requested building and plan", async () => {
  const wrongBuilding = createInstallationPlanClient("http://api.test", async () => response({ building_id: "D5", installation_plan_id: "plan-1", selected_at: null }));
  await assert.rejects(
    () => wrongBuilding.setRepresentative("D4", "plan-1"),
    (error) => error instanceof InstallationPlanContractError && error.field === "representativePlan.building_id",
  );

  const wrongPlan = createInstallationPlanClient("http://api.test", async () => response({ building_id: "D4", installation_plan_id: "plan-2", selected_at: null }));
  await assert.rejects(
    () => wrongPlan.setRepresentative("D4", "plan-1"),
    (error) => error instanceof InstallationPlanContractError && error.field === "representativePlan.installation_plan_id",
  );
});

test("installation plan client rejects malformed success payloads and preserves typed API failures", async () => {
  const malformed = createInstallationPlanClient("http://api.test", async () => response({ id: "plan-1", arrays: [] }));
  await assert.rejects(() => malformed.get("plan-1"), (error) => error instanceof InstallationPlanContractError && error.field === "plan.building_id");
  const failed = createInstallationPlanClient("http://api.test", async () => response({ detail: { code: "plan_conflict", message_ko: "대표안은 삭제할 수 없습니다." } }, 409));
  await assert.rejects(() => failed.remove("plan-1"), (error) => error.code === "plan_conflict" && error.status === 409 && /대표안/.test(error.message));
});

test("only an explicitly missing representative becomes null", async () => {
  const missingRepresentative = createInstallationPlanClient("http://api.test", async () => response({ detail: { code: "representative_installation_plan_not_found" } }, 404));
  assert.equal(await missingRepresentative.getRepresentative("D4"), null);

  const missingBuilding = createInstallationPlanClient("http://api.test", async () => response({ detail: { code: "building_not_found", message_ko: "건물이 없습니다." } }, 404));
  await assert.rejects(() => missingBuilding.getRepresentative("missing"), (error) => error.code === "building_not_found" && error.status === 404);
});
