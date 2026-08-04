import { resolveVWorldBuilding } from "./buildingResolver.mjs";

function createDashboardSelection({ elementId, displayName }) {
  return { elementId, buildingId: elementId.replace(/^BLD_/, ""), displayName };
}

export function activateNativeModelSelection(modelName, onSelection) {
  const building = resolveVWorldBuilding(modelName);
  if (!building) return null;

  const selection = createDashboardSelection(building);
  onSelection(selection);
  return selection;
}

export function activateCoordinateMarkerSelection(marker, onSelection) {
  const selection = createDashboardSelection(marker);
  onSelection(selection);
  return selection;
}
