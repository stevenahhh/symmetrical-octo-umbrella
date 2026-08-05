# VEHICLE VISION KNOWLEDGE BASE

## OVERVIEW

YOLO/OpenCV parking-flow proof of concept with two integration surfaces: the
root dashboard feed (`../vision_api.py`) and this directory's WebSocket server
plus independent React 19 client.

## STRUCTURE

```text
car_vision_model/
├── parking_counter.py         # ROI, gate, direction, and crossing logic
├── server.py                  # WebSocket image stream and `/api/stats`
├── requirements_server.txt    # Python runtime dependencies
├── car-frontend/              # Separate React 19/Vite/Tailwind 4 application
└── *.png, *.csv               # Experiment evidence, not runtime modules
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Dashboard traffic feed | `../vision_api.py` | Camera thread and `/api/traffic` on 8001 |
| Gate-crossing math | `parking_counter.py` | ROI, smoothing, direction checks |
| Streaming API | `server.py` | `/ws/stream` and `/api/stats` |
| Vision demo UI | `car-frontend/src/App.jsx` | Captures and sends frames |
| WebSocket proxy | `car-frontend/vite.config.js` | `/ws` -> `127.0.0.1:8000` |

## CONVENTIONS

- Model files (`*.pt`) are intentionally gitignored; provision `yolov8s.pt`
  locally before starting either vision path.
- `vision_api.py` is the SCNU dashboard integration and defaults to port 8001.
- `server.py` is the streaming demo and defaults to port 8000; do not run it
  beside the weather API on the same port.
- Gate coordinates are resolution-relative; crossing uses recent trajectory
  smoothing, minimum movement, and direction dot-product checks.
- Server counters are process-global and designed for one active session.
- `car-frontend/` has its own package manifest and React version; do not apply
  the main `frontend/` dependency assumptions here.

## ANTI-PATTERNS

- Do not commit downloaded weights, camera recordings, or generated frame dumps.
- Do not treat root `parking_counter.py`/`server.py` snapshots as automatically
  synchronized with this directory.
- Do not claim multi-user isolation: connecting the WebSocket resets global
  counting state.
- Do not start the streaming server on `8000` while the weather service is using
  that port.
- Do not validate vision behavior with source inspection alone; use a real
  camera or deterministic sample video and inspect counts.

## COMMANDS

```powershell
# Python streaming demo
python -m pip install -r car_vision_model/requirements_server.txt
cd car_vision_model
python server.py

# Independent demo client
cd car-frontend
npm install
npm run lint
npm run build
npm run dev

# Main dashboard feed, from repository root
cd ../..
python vision_api.py --source 0 --port 8001
```

## CHECKS

- Confirm the selected model path exists before launch.
- Confirm `/api/traffic` for the dashboard or `/api/stats` for the demo.
- Test one crossing in each direction and verify `current` never goes negative.

