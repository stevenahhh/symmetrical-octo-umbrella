import assert from "node:assert/strict";
import test from "node:test";
import { D4_VWORLD_VOLUMES } from "./d4VWorldModel.mjs";

test("describes both D4 wings, every floor, and the two connecting bridges", () => {
  assert.equal(D4_VWORLD_VOLUMES.length, 13);
  assert.equal(new Set(D4_VWORLD_VOLUMES.map((volume) => volume.id)).size, 13);
  assert.equal(D4_VWORLD_VOLUMES.filter((volume) => volume.kind === "wing").length, 11);
  assert.deepEqual(
    D4_VWORLD_VOLUMES.filter((volume) => volume.kind === "bridge").map(
      (volume) => volume.floor,
    ),
    [3, 5],
  );

  for (const volume of D4_VWORLD_VOLUMES) {
    assert.equal(volume.footprint.length, 5);
    assert.deepEqual(volume.footprint[0], volume.footprint.at(-1));
    assert.equal(volume.height > 0, true);
    assert.equal(volume.distanceFromTerrain >= 0, true);
  }
});
