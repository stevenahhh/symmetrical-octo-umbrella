export function focusMapAt(map, vw, { longitude, latitude }) {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    typeof map?.lookat?.moveTo !== "function"
  ) {
    return false;
  }

  map.lookat.moveTo(
    new vw.CameraPosition(
      new vw.CoordZ(longitude, latitude, 200),
      new vw.Direction(0, -60, 0),
    ),
  );
  return true;
}
