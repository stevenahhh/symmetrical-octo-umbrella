import assert from "node:assert/strict";
import test from "node:test";
import {
  d4RoofLocalPointToVWorld,
  replaceRepresentativePlanObjects,
} from "./representativePlanVWorld.mjs";

test("maps the verified D4 west-roof local bounds onto its VWorld footprint", () => {
  assert.deepEqual(d4RoofLocalPointToVWorld({ xMeters: 0, yMeters: 0 }), {
    longitude: 127.4760143,
    latitude: 34.9698248,
  });
  assert.deepEqual(d4RoofLocalPointToVWorld({ xMeters: 31, yMeters: 51.2 }), {
    longitude: 127.4763543,
    latitude: 34.9702848,
  });
});

test("replaces representative panel polygons and clears stale objects", () => {
  const removed = [];
  const created = [];
  const polygons = [];
  class Collection {
    constructor(values) {
      this.values = values;
    }
  }
  class Coord {
    constructor(longitude, latitude) {
      this.longitude = longitude;
      this.latitude = latitude;
    }
  }
  class PolygonZ {
    setId(value) { this.id = value; }
    setName() {}
    setFillColor() {}
    setOutLineColor() {}
    setDistanceFromTerrain() {}
    setExtrudeHeight() {}
    create() { created.push(this.id); polygons.push(this); }
  }
  const vw = {
    Collection,
    Coord,
    Color: class Color {},
    geom: { PolygonZ: class extends PolygonZ {
      constructor(collection) {
        super();
        this.collection = collection;
      }
    } },
  };
  const map = { removeObjectById: (id) => removed.push(id) };
  const overlays = [{
    buildingId: "D4",
    installationPlanId: "plan-1",
    arrays: [{
      id: "array-1",
      roofId: "D4-roof-west",
      roofZoneId: "D4-roof-west-main",
      footprintMeters: [
        { xMeters: 10, yMeters: 10 },
        { xMeters: 12, yMeters: 10 },
        { xMeters: 12, yMeters: 14 },
        { xMeters: 10, yMeters: 14 },
      ],
    }],
  }];

  const firstIds = replaceRepresentativePlanObjects({ map, vw, overlays, previousIds: ["old"] });
  assert.deepEqual(removed, ["old"]);
  assert.equal(firstIds.length, 1);
  assert.deepEqual(created, firstIds);
  assert.equal(polygons[0].collection.values.length, 5, "D4 polygon is closed and present");

  const unverified = [{ ...overlays[0], buildingId: "D3", installationPlanId: "plan-d3" }];
  const nextIds = replaceRepresentativePlanObjects({ map, vw, overlays: unverified, previousIds: firstIds });
  assert.deepEqual(nextIds, []);
  assert.deepEqual(removed, ["old", firstIds[0]], "the stale D4 polygon is removed");
  assert.equal(created.length, 1, "unverified D3 coordinates are not invented");
});
