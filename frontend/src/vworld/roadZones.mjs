import roadZonesGeoJson from "./data/roadZones.json";

const ROAD_ZONE_ID_PREFIX = "SCNU_ROAD_ZONE_";
// Soft app-blue highlight for the clicked zone only — nothing is drawn until a road is clicked.
const HIGHLIGHT_FILL_COLOR = [96, 165, 250, 90];
const HIGHLIGHT_OUTLINE_COLOR = [59, 130, 246, 210];

function normalizePolygonParts(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

// Ray-casting point-in-polygon test against a single (outer) ring.
function isPointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export const ROAD_ZONES = roadZonesGeoJson.features.map((feature) => ({
  id: feature.id ?? feature.properties?.FEATURE_ID,
  name: feature.properties?.ZONE_NAME ?? "이름 없는 도로 구역",
  // Outer ring only per polygon part; the source data has no holes.
  rings: normalizePolygonParts(feature.geometry).map((parts) => parts[0]),
}));

export function findRoadZoneAt(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  for (const zone of ROAD_ZONES) {
    if (zone.rings.some((ring) => isPointInRing(longitude, latitude, ring))) {
      return zone;
    }
  }
  return null;
}

function roadZoneObjectId(zone, ringIndex) {
  return `${ROAD_ZONE_ID_PREFIX}${zone.id}_${ringIndex}`;
}

// vw.geom.PolygonZ only keeps one live Cesium entity per geometry type
// (confirmed by inspecting map._wsViewer.entities at runtime), so it silently
// drops all but the last polygon when several are created. We add entities
// straight to the underlying Cesium viewer instead, which drapes them onto
// the terrain/3D tiles automatically (no manual height guessing needed).
function getViewer(map) {
  return map?._wsViewer ?? null;
}

function paintRoadZoneRing(map, zone, ring, ringIndex) {
  const Cesium = window.Cesium;
  const viewer = getViewer(map);
  if (!Cesium || !viewer) return null;

  const flat = ring.flatMap(([longitude, latitude]) => [longitude, latitude]);
  const id = roadZoneObjectId(zone, ringIndex);

  viewer.entities.add({
    id,
    name: zone.name,
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
      material: Cesium.Color.fromBytes(...HIGHLIGHT_FILL_COLOR),
      outline: true,
      outlineColor: Cesium.Color.fromBytes(...HIGHLIGHT_OUTLINE_COLOR),
      classificationType: Cesium.ClassificationType.BOTH,
    },
  });
  return id;
}

/** Draws the clicked zone only. Returns the created entity ids (for cleanup). */
export function setRoadZoneHighlighted(map, zone) {
  if (!zone) return [];
  return zone.rings
    .map((ring, ringIndex) => paintRoadZoneRing(map, zone, ring, ringIndex))
    .filter(Boolean);
}

export function clearRoadZoneOverlays(map, ids) {
  const viewer = getViewer(map);
  if (!viewer) return;
  ids.forEach((id) => viewer.entities.removeById(id));
}
