const CENTER = { longitude: 127.4764043, latitude: 34.9700548 };
const FLOOR_HEIGHT = 4.1;

function createFootprint({ centerLongitude, centerLatitude, halfLongitude, halfLatitude }) {
  return [
    { longitude: centerLongitude - halfLongitude, latitude: centerLatitude - halfLatitude },
    { longitude: centerLongitude + halfLongitude, latitude: centerLatitude - halfLatitude },
    { longitude: centerLongitude + halfLongitude, latitude: centerLatitude + halfLatitude },
    { longitude: centerLongitude - halfLongitude, latitude: centerLatitude + halfLatitude },
    { longitude: centerLongitude - halfLongitude, latitude: centerLatitude - halfLatitude },
  ];
}

function createWingVolumes({ id, centerLongitude, floors }) {
  return Array.from({ length: floors }, (_, index) => {
    const floor = index + 1;
    return {
      id: `SCNU_D4_${id.toUpperCase()}_${floor}`,
      kind: "wing",
      floor,
      distanceFromTerrain: index * FLOOR_HEIGHT,
      height: FLOOR_HEIGHT - 0.25,
      footprint: createFootprint({
        centerLongitude,
        centerLatitude: CENTER.latitude,
        halfLongitude: 0.00017,
        halfLatitude: 0.00023,
      }),
    };
  });
}

const wingVolumes = [
  ...createWingVolumes({ id: "west", centerLongitude: CENTER.longitude - 0.00022, floors: 5 }),
  ...createWingVolumes({ id: "east", centerLongitude: CENTER.longitude + 0.00022, floors: 6 }),
];

const bridgeVolumes = [3, 5].map((floor) => ({
  id: `SCNU_D4_BRIDGE_${floor}`,
  kind: "bridge",
  floor,
  distanceFromTerrain: (floor - 1) * FLOOR_HEIGHT + 1.35,
  height: 1.5,
  footprint: createFootprint({
    centerLongitude: CENTER.longitude,
    centerLatitude: CENTER.latitude,
    halfLongitude: 0.00008,
    halfLatitude: 0.000065,
  }),
}));

export const D4_VWORLD_VOLUMES = [...wingVolumes, ...bridgeVolumes];
export const D4_VWORLD_MODEL_IDS = D4_VWORLD_VOLUMES.map((volume) => volume.id);

export function createD4VWorldModel(vw) {
  for (const volume of D4_VWORLD_VOLUMES) {
    const coordinates = volume.footprint.map(
      ({ longitude, latitude }) => new vw.Coord(longitude, latitude),
    );
    const polygon = new vw.geom.PolygonZ(new vw.Collection(coordinates));
    const isBridge = volume.kind === "bridge";

    polygon.setId(volume.id);
    polygon.setName(`공과대학 3호관 ${volume.floor}층`);
    polygon.setFillColor(
      isBridge ? new vw.Color(196, 208, 255, 235) : new vw.Color(94, 106, 210, 225),
    );
    polygon.setOutLineColor(new vw.Color(220, 226, 255, 255));
    polygon.setDistanceFromTerrain(volume.distanceFromTerrain);
    polygon.setExtrudeHeight(volume.height);
    polygon.create();
  }
}

export function removeD4VWorldModel(map) {
  for (const objectId of D4_VWORLD_MODEL_IDS) {
    map.removeObjectById(objectId);
  }
}
