import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { focusMapAt } from "./cameraFocus.mjs";
import { D4_COORDINATE_HIT_TOLERANCE_DEGREES, isCoordinateMarkerHit } from "./coordinateMarkerHit.mjs";
import { D4_COORDINATE_MARKER } from "./d4CoordinateMarker.mjs";
import { createD4VWorldModel, removeD4VWorldModel } from "./d4VWorldModel.mjs";
import {
  activateCoordinateMarkerSelection,
  activateNativeModelSelection,
} from "./selectionActivation.mjs";
import { applyVWorldSunSimulation } from "./sunSimulation.mjs";
import { loadVWorldWebGlSdk } from "./webglSdkLoader.mjs";
import { VWorldCampusStatus } from "./VWorldCampusStatus";
import { RepresentativePlanOverlayController } from "./RepresentativePlanOverlayController";
import { CAMPUS_REPRESENTATIVE_BUILDING_IDS } from "./representativePlanOverlay.mjs";
import { replaceRepresentativePlanObjects } from "./representativePlanVWorld.mjs";

const D4SectionExperience = lazy(() =>
  import("./D4SectionExperience").then((module) => ({
    default: module.D4SectionExperience,
  })),
);

const VWORLD_MAP_ID = "vmap";
const VWORLD_MAP_INSTANCE_KEY = "__scnuVWorldMapInstance";
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

export default function VWorldRenderer({
  onSelection,
  simulationDate,
  editorRequest,
  onEditorClose,
  onPlanSaved,
  createInstallationPlanDraft,
  installationPlanRefreshKey,
  onInstallationPlansChange,
  onRepresentativeInstallationPlanChange,
  representativeRefreshKey,
}) {
  const onSelectionRef = useRef(onSelection);
  const simulationDateRef = useRef(simulationDate);
  const mapRef = useRef(null);
  const vwRef = useRef(null);
  const overlayDataRef = useRef([]);
  const overlayObjectIdsRef = useRef([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isD4SectionOpen, setIsD4SectionOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState(null);

  useEffect(() => {
    onSelectionRef.current = onSelection;
  }, [onSelection]);

  useEffect(() => {
    if (editorRequest?.scenarioId || editorRequest?.installationPlanId) {
      setDetailRequest(editorRequest);
      setIsD4SectionOpen(true);
    }
  }, [editorRequest]);

  const handleOverlayDataChange = useCallback((overlays) => {
    overlayDataRef.current = overlays;
    if (!mapRef.current || !vwRef.current) return;
    overlayObjectIdsRef.current = replaceRepresentativePlanObjects({
      map: mapRef.current,
      vw: vwRef.current,
      overlays,
      previousIds: overlayObjectIdsRef.current,
    });
  }, []);

  useEffect(() => {
    simulationDateRef.current = simulationDate;
    applyVWorldSunSimulation(simulationDate);
  }, [simulationDate]);

  useEffect(() => {
    let isDisposed = false;
    let map = null;
    let handleMapClick = null;

    async function initializeMap() {
      try {
        const vw = await loadVWorldWebGlSdk(import.meta.env.VITE_VWORLD_API_KEY);
        if (isDisposed) return;

        map = globalThis.window[VWORLD_MAP_INSTANCE_KEY];
        if (!map) {
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
          globalThis.window[VWORLD_MAP_INSTANCE_KEY] = map;
        }
        // The SDK map deliberately survives component cleanup. Always bind the
        // current mount to it so StrictMode/remount overlay callbacks can render.
        mapRef.current = map;
        vwRef.current = vw;
        applyVWorldSunSimulation(simulationDateRef.current);

        const poiLayer = map.getLayerElement("POI_GROUP");
        if (poiLayer) poiLayer.hide();

        createCampusBoundary(vw);
        createD4VWorldModel(vw);
        handleOverlayDataChange(overlayDataRef.current);
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
            setIsD4SectionOpen(true);
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
      removeD4VWorldModel(map);
      overlayObjectIdsRef.current = replaceRepresentativePlanObjects({
        map,
        vw: vwRef.current,
        overlays: [],
        previousIds: overlayObjectIdsRef.current,
      });
      mapRef.current = null;
      vwRef.current = null;
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
      {!isD4SectionOpen && <VWorldCampusStatus onSelection={(selection) => onSelectionRef.current(selection)} />}
      {!isD4SectionOpen && (
        <RepresentativePlanOverlayController
          buildingIds={CAMPUS_REPRESENTATIVE_BUILDING_IDS}
          refreshKey={representativeRefreshKey}
          onOverlayDataChange={handleOverlayDataChange}
          onBuildingSelect={(buildingId) => onSelectionRef.current({
            elementId: `BLD_${buildingId}`,
            buildingId,
            displayName: buildingId,
          })}
          className="absolute left-6 top-6 z-20"
        />
      )}
      {!isD4SectionOpen && (
        <button
          type="button"
          className="dashboard-ghost-button absolute bottom-6 left-6 z-10 min-h-11 px-4 text-xs font-extrabold shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colors-primary)]"
          onClick={() => {
            activateCoordinateMarkerSelection(D4_COORDINATE_MARKER, onSelectionRef.current);
            setIsD4SectionOpen(true);
          }}
        >
          D4 공과대학 3호관 상세 보기
        </button>
      )}
      {isD4SectionOpen && (
        <Suspense
          fallback={
            <div
              className="absolute inset-0 z-30 grid place-items-center bg-slate-950/90 text-sm font-semibold text-slate-100"
              role="status"
            >
              D4 단면 모델을 불러오는 중입니다.
            </div>
          }
        >
          <D4SectionExperience
            buildingId={detailRequest?.buildingId ?? "D4"}
            scenarioId={detailRequest?.scenarioId}
            installationPlanId={detailRequest?.installationPlanId}
            startInstallation={Boolean(detailRequest?.scenarioId || detailRequest?.installationPlanId)}
            onPlanSaved={onPlanSaved}
            createInstallationPlanDraft={createInstallationPlanDraft}
            onPlansChange={onInstallationPlansChange}
            onRepresentativeChange={onRepresentativeInstallationPlanChange}
            planRefreshKey={installationPlanRefreshKey}
            onClose={() => {
              setIsD4SectionOpen(false);
              setDetailRequest(null);
              onEditorClose?.();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
