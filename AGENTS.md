# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-29
**Commit:** 883bad1
**Branch:** dev

## OVERVIEW

SCNU campus digital-twin prototype: a React/Three.js or VWorld dashboard, a
FastAPI weather/microclimate service, and local computer-vision and safety
proofs of concept. JavaScript UI and Python services are separate runtimes
joined by HTTP and shared `BLD_*` element identifiers.

## STRUCTURE

```text
./
├── frontend/                  # Main dashboard; Legacy and VWorld entry points
├── weather/                   # KMA/AirKorea collection and microclimate API
├── car_vision_model/          # YOLO gate counter plus its own React client
├── TrafficSafety/             # Separate OCR/NLP/Streamlit safety PoC
├── common/data/               # Cross-domain campus and element contracts
├── docs/                      # Static demonstration artifacts
├── vision_api.py              # Dashboard traffic endpoint on port 8001
└── README.md                  # Three-service local runbook and Git workflow
```

Ignore `.omo/`, `.playwright-mcp/`, virtual environments, `__pycache__/`, and
build outputs when mapping product code.

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Legacy dashboard behavior | `frontend/src/AppLegacy.jsx` | Default `index.html` route |
| VWorld dashboard behavior | `frontend/src/AppVWorld.jsx` | `index-vworld.html` route |
| VWorld SDK and selection | `frontend/src/vworld/` | Mapping, camera, marker, loader tests |
| Building/room details | `frontend/src/components/` | D4 section and room status UI |
| Weather HTTP API | `weather/api/app.py` | FastAPI routes and response assembly |
| Microclimate calculations | `weather/processors/` | Radiation, wind, thermal, timeline |
| External weather inputs | `weather/collectors/` | KMA and AirKorea requests |
| Campus data contracts | `common/data/` | IDs and geometry consumed across domains |
| Dashboard traffic feed | `vision_api.py` | `GET /api/traffic`, default port 8001 |
| WebSocket vision demo | `car_vision_model/` | Separate server and React 19 client |
| Safety-report PoC | `TrafficSafety/` | Currently contains unresolved merge markers |

## CODE MAP

| Symbol | Type | Location | Refs | Role |
|---|---|---|---:|---|
| `AppLegacy` | React component | `frontend/src/AppLegacy.jsx` | entry | Main Three.js dashboard |
| `AppVWorld` | React component | `frontend/src/AppVWorld.jsx` | entry | VWorld-backed dashboard |
| `VWorldRenderer` | React component | `frontend/src/vworld/VWorldRenderer.jsx` | 1 | SDK lifecycle and map selection |
| `BuildingSectionView` | React component | `frontend/src/components/BuildingSectionView.jsx` | 2 | D4 floor/room drill-down |
| `app` | FastAPI app | `weather/api/app.py` | entry | Weather and microclimate routes |
| `run_pipeline_for_element` | function | `weather/processors/pipeline.py` | 4 | Per-element thermal pipeline |
| `run_pipeline_all` | function | `weather/processors/pipeline.py` | 6 | Bulk/heatmap calculations |
| `build_weather_timeline` | function | `weather/processors/weather_timeline.py` | 3 | Current-plus-forecast frames |
| `run_vision_model` | function | `vision_api.py` | 1 | Background YOLO traffic counter |

## CONVENTIONS

- Branch from `dev` as `feature/<name>`; merge through a PR back into `dev`.
  `main` is reserved for deployment-ready source.
- Run services from their documented working directories. Weather modules use
  imports such as `from config import ...`, so repository-root execution is not
  equivalent to execution from `weather/`.
- Legacy and VWorld are parallel products, not aliases. Both builds must remain
  valid when shared dashboard behavior changes.
- `common/data/common_elemetns.json` is misspelled but is a live contract.
  Rename only with every consumer in the same change.
- Element prefixes are semantic: `BLD_` building, `RD_` road, `ND_` node,
  `CW_` crosswalk. Building popup data currently targets `BLD_*`.
- Material, radiation, MRT, and local-temperature values are estimated
  simulation outputs. User-facing text must not describe them as measurements.
- Existing popup and pipeline fields are compatibility contracts. Add new
  fields; do not remove or rename existing fields without coordinated clients.

## ANTI-PATTERNS (THIS PROJECT)

- Do not copy or add API keys in source, tests, HTML, examples, or generated
  documentation. Existing committed credentials require migration, not reuse.
- Do not bypass VWorld `MODEL_NAME` resolution or the D4 coordinate-marker
  fallback when changing building selection.
- Do not add extra building-popup requests; the popup endpoint is intended to
  provide the complete payload.
- Do not treat development fallback features from `weather/api/app.py` as
  production observations.
- Do not use root `server.py` as the normal launcher; it contains a stale,
  machine-specific static directory. Follow `README.md` entry points instead.
- Do not assume YOLO assets are present: model files are gitignored and must be
  provisioned locally.
- Do not clean up `TrafficSafety/` merge markers incidentally. That broken state
  predates this knowledge base and needs a deliberate conflict-resolution task.

## COMMANDS

```powershell
# Main dashboard
cd frontend
bun install
bun run dev:legacy
bun run dev:vworld
bun run test
bun run build
bun run build:vworld
cd ..

# Weather API
cd weather
python -m pip install -r requirements.txt
uvicorn api.app:app --host 127.0.0.1 --port 8000 --reload
cd ..

# Dashboard traffic API (from repository root)
python -m pip install -r car_vision_model/requirements_server.txt
python vision_api.py --source 0 --port 8001
```

## NOTES

- Local runtime is normally three processes: weather `8000`, vision `8001`,
  frontend `5173`.
- VWorld mode needs `VITE_VWORLD_API_KEY`; both modes use `VITE_API_URL`.
- KMA/AirKorea calls may delay or time out while map and popup UI remain usable.
- Vision startup loads a YOLO model and camera/stream; first launch can be slow.
- No repository CI workflow was found. Validation is local and domain-specific.

