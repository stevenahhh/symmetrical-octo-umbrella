const EPSILON_METERS = 1e-9;

export class GeometryInputError extends TypeError {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.name = "GeometryInputError";
    this.code = "MALFORMED_GEOMETRY_INPUT";
    this.field = field;
  }
}
function finite(value, field) {
  if (!Number.isFinite(value)) throw new GeometryInputError(field, "must be finite");
  return value;
}
function point(value, field) {
  if (!value || typeof value !== "object") throw new GeometryInputError(field, "must be a point");
  return { xMeters: finite(value.xMeters, `${field}.xMeters`), yMeters: finite(value.yMeters, `${field}.yMeters`) };
}
function polygon(value, field) {
  if (!Array.isArray(value) || value.length < 3) throw new GeometryInputError(field, "must have at least three points");
  return value.map((item, index) => point(item, `${field}[${index}]`));
}
const cross = (a, b, c) => (b.xMeters - a.xMeters) * (c.yMeters - a.yMeters)
  - (b.yMeters - a.yMeters) * (c.xMeters - a.xMeters);
function pointOnSegment(p, a, b) {
  return cross(a, b, p) === 0
    && p.xMeters >= Math.min(a.xMeters, b.xMeters) && p.xMeters <= Math.max(a.xMeters, b.xMeters)
    && p.yMeters >= Math.min(a.yMeters, b.yMeters) && p.yMeters <= Math.max(a.yMeters, b.yMeters);
}
export function pointInPolygon(candidate, polygonMeters) {
  const p = point(candidate, "point");
  const vertices = polygon(polygonMeters, "polygonMeters");
  let inside = false;
  for (let i = 0, previous = vertices.length - 1; i < vertices.length; previous = i++) {
    const a = vertices[previous]; const b = vertices[i];
    if (pointOnSegment(p, a, b)) return true;
    if ((a.yMeters > p.yMeters) !== (b.yMeters > p.yMeters)
      && p.xMeters < ((b.xMeters - a.xMeters) * (p.yMeters - a.yMeters)) / (b.yMeters - a.yMeters) + a.xMeters) inside = !inside;
  }
  return inside;
}
function segmentsIntersect(a, b, c, d) {
  const o = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)];
  if (((o[0] > 0 && o[1] < 0) || (o[0] < 0 && o[1] > 0))
    && ((o[2] > 0 && o[3] < 0) || (o[2] < 0 && o[3] > 0))) return true;
  return (o[0] === 0 && pointOnSegment(c, a, b)) || (o[1] === 0 && pointOnSegment(d, a, b))
    || (o[2] === 0 && pointOnSegment(a, c, d)) || (o[3] === 0 && pointOnSegment(b, c, d));
}
function pointSegmentDistance(p, a, b) {
  const dx = b.xMeters - a.xMeters; const dy = b.yMeters - a.yMeters;
  if (dx === 0 && dy === 0) return Math.hypot(p.xMeters - a.xMeters, p.yMeters - a.yMeters);
  const ratio = Math.max(0, Math.min(1, ((p.xMeters - a.xMeters) * dx + (p.yMeters - a.yMeters) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.xMeters - a.xMeters - ratio * dx, p.yMeters - a.yMeters - ratio * dy);
}
export function segmentDistance(firstStart, firstEnd, secondStart, secondEnd) {
  const [a, b, c, d] = [firstStart, firstEnd, secondStart, secondEnd].map((item, index) => point(item, `segments[${index}]`));
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
const edges = (vertices) => vertices.map((vertex, index) => [vertex, vertices[(index + 1) % vertices.length]]);
function polygonsOverlap(first, second) {
  return edges(first).some(([a, b]) => edges(second).some(([c, d]) => segmentsIntersect(a, b, c, d)))
    || pointInPolygon(first[0], second) || pointInPolygon(second[0], first);
}
function polygonBoundaryDistance(first, second) {
  return Math.min(...edges(first).flatMap(([a, b]) => edges(second).map(([c, d]) => segmentDistance(a, b, c, d))));
}
function polygonDistance(first, second) {
  return polygonsOverlap(first, second) ? 0 : polygonBoundaryDistance(first, second);
}
export function projectArrayFootprint(array, module, layoutRules) {
  if (!array || !module || !layoutRules) throw new GeometryInputError("array", "array, module, and rules are required");
  const origin = point(array.originMeters, "array.originMeters");
  if (!Number.isInteger(array.rows) || array.rows < 1 || !Number.isInteger(array.columns) || array.columns < 1) throw new GeometryInputError("array.rows", "rows and columns must be positive integers");
  if (!["portrait", "landscape"].includes(array.orientation)) throw new GeometryInputError("array.orientation", "must be portrait or landscape");
  const azimuth = finite(array.azimuthDeg, "array.azimuthDeg"); const tilt = finite(array.tiltDeg, "array.tiltDeg");
  const gap = finite(layoutRules.interPanelGapMeters, "layoutRules.interPanelGapMeters");
  const acrossModule = finite(array.orientation === "portrait" ? module.widthMeters : module.lengthMeters, "module.widthMeters");
  const slopeModule = finite(array.orientation === "portrait" ? module.lengthMeters : module.widthMeters, "module.lengthMeters");
  const width = array.columns * acrossModule + (array.columns - 1) * gap;
  const depth = array.rows * slopeModule * Math.cos(tilt * Math.PI / 180) + (array.rows - 1) * gap;
  const radians = azimuth * Math.PI / 180;
  const across = { xMeters: Math.cos(radians), yMeters: -Math.sin(radians) };
  const forward = { xMeters: Math.sin(radians), yMeters: Math.cos(radians) };
  const clean = (value) => Math.round(value * 1e12) / 1e12;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([xSign, ySign]) => ({
    xMeters: clean(origin.xMeters + xSign * width / 2 * across.xMeters + ySign * depth / 2 * forward.xMeters),
    yMeters: clean(origin.yMeters + xSign * width / 2 * across.yMeters + ySign * depth / 2 * forward.yMeters),
  }));
}
function containedByZone(footprint, zonePolygon) {
  if (!footprint.every((vertex) => pointInPolygon(vertex, zonePolygon))) return false;
  return !edges(footprint).some(([a, b]) => edges(zonePolygon).some(([c, d]) => segmentsIntersect(a, b, c, d)
    && !pointOnSegment(a, c, d) && !pointOnSegment(b, c, d)));
}
export function validateRoofArrays({ roof, arrays, modules, layoutRules }) {
  if (!roof || !Array.isArray(roof.zones) || !Array.isArray(roof.obstacles) || !Array.isArray(arrays) || !Array.isArray(modules)) {
    throw new GeometryInputError("layout", "roof, arrays, modules, and rules are required");
  }
  const margin = finite(layoutRules?.roofEdgeMarginMeters, "layoutRules.roofEdgeMarginMeters");
  const clearance = finite(layoutRules?.obstacleClearanceMeters, "layoutRules.obstacleClearanceMeters");
  const projected = arrays.map((array, index) => {
    const module = modules.find((item) => item.id === array.moduleId);
    const zone = roof.zones.find((item) => item.id === array.roofZoneId);
    if (!module || !zone) throw new GeometryInputError(`arrays[${index}]`, "must reference a known module and zone");
    return { array, zone, footprint: projectArrayFootprint(array, module, layoutRules) };
  });
  const violations = [];
  for (const item of projected) {
    const zonePolygon = polygon(item.zone.polygonMeters, `zone.${item.zone.id}.polygonMeters`);
    if (!containedByZone(item.footprint, zonePolygon) || polygonBoundaryDistance(item.footprint, zonePolygon) + EPSILON_METERS < margin) {
      violations.push({ code: "ROOF_EDGE_MARGIN", arrayId: item.array.id, roofId: roof.id, roofZoneId: item.zone.id,
        messageKo: `배열 ${item.array.id}은(는) 옥상 가장자리에서 ${margin.toFixed(2)}m 이상 떨어져야 합니다.` });
    }
    for (const obstacle of roof.obstacles.filter((candidate) => candidate.roofZoneId === item.zone.id)) {
      if (polygonDistance(item.footprint, polygon(obstacle.polygonMeters, `obstacle.${obstacle.id}.polygonMeters`)) + EPSILON_METERS < clearance) {
        violations.push({ code: "OBSTACLE_CLEARANCE", arrayId: item.array.id, obstacleId: obstacle.id,
          messageKo: `배열 ${item.array.id}은(는) 장애물 ${obstacle.id}에서 ${clearance.toFixed(2)}m 이상 떨어져야 합니다.` });
      }
    }
  }
  for (let first = 0; first < projected.length; first += 1) {
    for (let second = first + 1; second < projected.length; second += 1) {
      if (polygonsOverlap(projected[first].footprint, projected[second].footprint)) {
        violations.push({ code: "ARRAY_OVERLAP", arrayId: projected[first].array.id, otherArrayId: projected[second].array.id,
          messageKo: `배열 ${projected[first].array.id}과(와) ${projected[second].array.id}이(가) 겹칩니다.` });
      }
    }
  }
  return violations;
}
