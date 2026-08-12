const D4_WEST_ROOF = Object.freeze({
  centerLongitude: 127.4764043,
  centerLatitude: 34.9700548,
  widthMeters: 31,
  depthMeters: 88,
  modelWidthMeters: 36.86,
  modelDepthMeters: 65.2,
  headingDegrees: -14.5,
  distanceFromTerrain: 11.7,
});

export function d4RoofLocalPointToVWorld({ xMeters, yMeters }) {
  const localEast = ((xMeters / D4_WEST_ROOF.widthMeters) - 0.5) * D4_WEST_ROOF.modelWidthMeters;
  const localNorth = ((yMeters / D4_WEST_ROOF.depthMeters) - 0.5) * D4_WEST_ROOF.modelDepthMeters;
  const heading = D4_WEST_ROOF.headingDegrees * Math.PI / 180;
  const east = localEast * Math.cos(heading) - localNorth * Math.sin(heading);
  const north = localEast * Math.sin(heading) + localNorth * Math.cos(heading);
  const longitudeMetersPerDegree = 111_320 * Math.cos(D4_WEST_ROOF.centerLatitude * Math.PI / 180);
  return {
    longitude: D4_WEST_ROOF.centerLongitude + east / longitudeMetersPerDegree,
    latitude: D4_WEST_ROOF.centerLatitude + north / 110_540,
  };
}

export function getVerifiedVWorldRoofTransform(buildingId, roofId, roofZoneId) {
  if (buildingId !== "D4" || roofId !== "D4-roof-west" || !roofZoneId?.startsWith("D4-roof-")) {
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
