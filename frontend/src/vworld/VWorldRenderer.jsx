import { useEffect, useRef, useState } from "react";
import { focusMapAt } from "./cameraFocus.mjs";
import { D4_COORDINATE_HIT_TOLERANCE_DEGREES, isCoordinateMarkerHit } from "./coordinateMarkerHit.mjs";
import { D4_COORDINATE_MARKER } from "./d4CoordinateMarker.mjs";
import {
  activateCoordinateMarkerSelection,
  activateNativeModelSelection,
} from "./selectionActivation.mjs";
import { loadVWorldWebGlSdk } from "./webglSdkLoader.mjs";

const VWORLD_MAP_ID = "vmap";
const CAMPUS_BOUNDARY_ID = "SCNU_CAMPUS_AREA";
const D4_MARKER_ID = "SCNU_D4_COORDINATE_MARKER";
const D4_MARKER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='16' fill='%235e6ad2'/%3E%3Ccircle cx='18' cy='18' r='12' fill='%230f1011'/%3E%3Ctext x='18' y='22' text-anchor='middle' fill='%23f7f8f8' font-family='sans-serif' font-size='12' font-weight='700'%3ED4%3C/text%3E%3C/svg%3E";

function createCampusBoundary(vw) {
  const coordinates = [
    new vw.Coord(127.4758811, 34.9698032),
    new vw.Coord(127.476452, 34.9684882),
    new vw.Coord(127.4771066, 34.9672831),
    new vw.Coord(127.4792342, 34.9662112),
    new vw.Coord(127.4837115, 34.9654154),
    new vw.Coord(127.4845949, 34.965956),
    new vw.Coord(127.4844475, 34.9669869),
    new vw.Coord(127.4841844, 34.9681617),
    new vw.Coord(127.4833142, 34.9708445),
    new vw.Coord(127.4830788, 34.9715139),
    new vw.Coord(127.4777905, 34.9711092),
    new vw.Coord(127.4771614, 34.9710003),
    new vw.Coord(127.4761456, 34.9706227),
    new vw.Coord(127.4758811, 34.9698032),
  ];
  const campusBoundary = new vw.geom.PolygonZ(new vw.Collection(coordinates));

  campusBoundary.setId(CAMPUS_BOUNDARY_ID);
  campusBoundary.setFillColor(new vw.Color(0, 180, 220, 100));
  campusBoundary.setOutLineColor(new vw.Color(60, 220, 255, 220));
  campusBoundary.setDistanceFromTerrain(10);
  campusBoundary.setExtrudeHeight(3);
  campusBoundary.create();
}

function createD4CoordinateMarker(vw) {
  const marker = new vw.geom.PointZ(
    new vw.CoordZ(127.4764043, 34.9700548, 0),
  );

  marker.setId(D4_MARKER_ID);
  marker.setName(D4_COORDINATE_MARKER.displayName);
  marker.setFont("Wanted Sans");
  marker.setFontSize(14);
  marker.setImage(D4_MARKER_IMAGE);
  marker.create();
}

export default function VWorldRenderer({ onSelection }) {
  const onSelectionRef = useRef(onSelection);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    onSelectionRef.current = onSelection;
  }, [onSelection]);

  useEffect(() => {
    let isDisposed = false;
    let map = null;
    let handleMapClick = null;

    async function initializeMap() {
      try {
        const vw = await loadVWorldWebGlSdk(import.meta.env.VITE_VWORLD_API_KEY);
        if (isDisposed) return;

        map = new vw.Map();
        map.setOption({
          mapId: VWORLD_MAP_ID,
          initPosition: new vw.CameraPosition(
            new vw.CoordZ(127.4810, 34.9697, 400),
            new vw.Direction(0, -60, 0),
          ),
          logo: false,
          navigation: false,
        });
        map.start();

        const poiLayer = map.getLayerElement("POI_GROUP");
        if (poiLayer) poiLayer.hide();

        createCampusBoundary(vw);
        createD4CoordinateMarker(vw);

        handleMapClick = (
          _windowPosition,
          _ecefPosition,
          cartographic,
          modelObject,
        ) => {
          const modelName = modelObject?.attributes?.MODEL_NAME;
          const nativeSelection = activateNativeModelSelection(
            modelName,
            onSelectionRef.current,
          );

          if (nativeSelection) {
            focusMapAt(map, vw, {
              longitude: cartographic?.longitudeDD,
              latitude: cartographic?.latitudeDD,
            });
            return;
          }

          if (
            isCoordinateMarkerHit(
              cartographic,
              D4_COORDINATE_MARKER,
              D4_COORDINATE_HIT_TOLERANCE_DEGREES,
            )
          ) {
            activateCoordinateMarkerSelection(
              D4_COORDINATE_MARKER,
              onSelectionRef.current,
            );
            focusMapAt(map, vw, {
              longitude: D4_COORDINATE_MARKER.longitude,
              latitude: D4_COORDINATE_MARKER.latitude,
            });
          }
        };
        map.onClick.addEventListener(handleMapClick);

        setIsLoading(false);
      } catch (error) {
        if (isDisposed) return;

        console.error("VWorld renderer initialization failed.", error);
        setHasLoadError(true);
        setIsLoading(false);
      }
    }

    initializeMap();

    return () => {
      isDisposed = true;
      if (!map) return;

      if (handleMapClick) {
        map.onClick.removeEventListener(handleMapClick);
      }
      map.removeObjectById(D4_MARKER_ID);
      map.removeObjectById(CAMPUS_BOUNDARY_ID);
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div id={VWORLD_MAP_ID} className="h-full w-full" />
      {isLoading && !hasLoadError && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4"
          role="status"
        >
          <div className="dashboard-status-badge flex items-center gap-2 px-3 py-2 text-xs">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--colors-hairline)] border-t-[var(--colors-primary)]" />
            VWorld 지도를 불러오는 중입니다.
          </div>
        </div>
      )}
      {hasLoadError && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4"
          role="alert"
        >
          <div className="dashboard-status-badge px-3 py-2 text-xs">
            VWorld 지도를 불러오지 못했습니다.
          </div>
        </div>
      )}
    </div>
  );
}
