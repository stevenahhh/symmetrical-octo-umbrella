# WEATHER SERVICE KNOWLEDGE BASE

## OVERVIEW

FastAPI service that combines KMA/AirKorea inputs with campus feature data to
produce zone summaries, per-element microclimate values, heatmaps, timelines,
and UI-ready building popup responses.

## STRUCTURE

```text
weather/
├── api/app.py                 # FastAPI app and all HTTP routes
├── collectors/                # External KMA/AirKorea adapters
├── domain/                    # Legacy zone-level environment model
├── processors/                # Element microclimate and thermal pipeline
├── data/                      # Campus zones and generated feature inputs
├── config.py                  # Campus coordinates and current service config
├── main.py                    # CLI-style environment output
└── UPDATE_MRT_HANDOFF.md      # Estimated-material compatibility contract
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Route or response change | `api/app.py` | Loads features and assembles endpoints |
| Current weather | `collectors/kma_current.py` | Normalization and solar estimates |
| Forecast timeline | `collectors/kma_forecast.py`, `processors/weather_timeline.py` | +1/+2/+3 hour frames |
| Air quality | `collectors/air_quality.py` | External station lookup |
| Element calculation | `processors/pipeline.py` | Microclimate then thermal index |
| Radiation/material model | `processors/radiation.py`, `processors/materials.py` | Estimated physics |
| Popup schema | `processors/popup_formatter.py` | UI-ready compatibility surface |
| Feature source | `data/microclimate_features.json` | `{metadata, features}` wrapper |

## CONVENTIONS

- Start from `weather/`; imports assume that directory is on `sys.path`.
- Route flow is collector -> normalized weather -> element feature ->
  `run_pipeline_for_element`/`run_pipeline_all` -> formatter or aggregate.
- Feature loading must return the nested `features` array, not the raw wrapper.
- Timeline buckets are fixed to +1, +2, and +3 hours in KST and record fallback
  fields when forecast values are missing.
- `local_temp`, `local_wind_speed`, `radiation_load`, `tmrt`, `utci`, and `wbgt`
  are stable pipeline outputs.
- Popup fields `thermal`, `factors`, `delta`, `reasons`, and `base_weather` are
  stable client contracts. Extend additively.
- Material and radiation parameters are estimated until replaced by measured
  asset, geometry, or sensor data.

## ANTI-PATTERNS

- Do not add, duplicate, or expose service credentials. `config.py` already
  requires a dedicated secret-migration follow-up.
- Do not describe development sample features or estimated MRT as observations.
- Do not silently change `common/data/common_elemetns.json` element IDs.
- Do not remove fallback provenance from timeline frames.
- Do not break existing popup fields while refining materials or radiation.

## COMMANDS

```powershell
cd weather
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn api.app:app --host 127.0.0.1 --port 8000 --reload
python main.py
python -m compileall -q api collectors domain processors main.py config.py
```

## CHECKS

- `GET /health` responds before frontend integration checks.
- `GET /environment/full` exercises current weather and timeline assembly.
- `GET /microclimate/elements/{BLD_ID}/popup` exercises the complete UI path.
- External collectors use network timeouts; a failure there is not a VWorld SDK
  failure.
- There is no dedicated automated Python test suite in this repository.

