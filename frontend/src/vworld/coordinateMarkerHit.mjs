export const D4_COORDINATE_HIT_TOLERANCE_DEGREES = 0.00048;

export function isCoordinateMarkerHit(
  cartographic,
  marker,
  tolerance = D4_COORDINATE_HIT_TOLERANCE_DEGREES,
) {
  const longitude = cartographic?.longitudeDD;
  const latitude = cartographic?.latitudeDD;

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;

  return (
    Math.hypot(longitude - marker.longitude, latitude - marker.latitude) <=
    tolerance
  );
}
