import { D4_ROOF_SOURCE_BASELINE } from "../features/energy/domain/fixtures/d4RoofScenarioFixture.mjs";

const D4_WEST_ROOF = Object.freeze({
  centerLongitude: 127.4764043 - 0.00022,
  centerLatitude: 34.9700548,
  widthMeters: 31,
  depthMeters: 51.2,
  longitudeSpanDegrees: D4_ROOF_SOURCE_BASELINE.vworldWingLongitudeSpanDegrees,
  latitudeSpanDegrees: D4_ROOF_SOURCE_BASELINE.vworldWingLatitudeSpanDegrees,
  distanceFromTerrain: 20.4,
});

export function d4RoofLocalPointToVWorld({ xMeters, yMeters }) {
  return {
    longitude:
      D4_WEST_ROOF.centerLongitude
      + ((xMeters / D4_WEST_ROOF.widthMeters) - 0.5) * D4_WEST_ROOF.longitudeSpanDegrees,
    latitude:
      D4_WEST_ROOF.centerLatitude
      + ((yMeters / D4_WEST_ROOF.depthMeters) - 0.5) * D4_WEST_ROOF.latitudeSpanDegrees,
  };
}

export function getVerifiedVWorldRoofTransform(buildingId, roofId, roofZoneId) {
  if (buildingId !== "D4" || roofId !== "D4-roof-west" || roofZoneId !== "D4-roof-west-main") {
    return null;
  }
  return {
    pointToVWorld: d4RoofLocalPointToVWorld,
    distanceFromTerrain: D4_WEST_ROOF.distanceFromTerrain,
  };
}

function objectId(planId, arrayId) {
  return `SCNU_REPRESENTATIVE_PANEL_${planId}_${arrayId}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function replaceRepresentativePlanObjects({
  map,
  vw,
  overlays,
  previousIds = [],
}) {
  for (const id of previousIds) map.removeObjectById(id);

  const nextIds = [];
  for (const overlay of overlays) {
    for (const array of overlay.arrays) {
      const transform = getVerifiedVWorldRoofTransform(
        overlay.buildingId,
        array.roofId,
        array.roofZoneId,
      );
      if (!transform) continue;
      const footprint = array.footprintMeters.map(transform.pointToVWorld);
      if (footprint.length < 3) continue;
      const closed = [...footprint, footprint[0]];
      const polygon = new vw.geom.PolygonZ(
        new vw.Collection(
          closed.map(({ longitude, latitude }) => new vw.Coord(longitude, latitude)),
        ),
      );
      const id = objectId(overlay.installationPlanId, array.id);
      polygon.setId(id);
      polygon.setName(`${overlay.name ?? "대표 설치안"} 태양광 패널`);
      polygon.setFillColor(new vw.Color(34, 211, 238, 225));
      polygon.setOutLineColor(new vw.Color(207, 250, 254, 255));
      polygon.setDistanceFromTerrain(transform.distanceFromTerrain);
      polygon.setExtrudeHeight(0.12);
      polygon.create();
      nextIds.push(id);
    }
  }
  return nextIds;
}
