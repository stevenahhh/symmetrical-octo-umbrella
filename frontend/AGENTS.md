# FRONTEND KNOWLEDGE BASE

## OVERVIEW

React 18/Vite dashboard with two supported entry points: the Three.js Legacy
view and the VWorld WebGL view. Both consume the weather API and share building
selection, detail panels, and D4 room data.

## STRUCTURE

```text
frontend/
├── index.html                 # `/src/index.jsx` -> App -> AppLegacy
├── index-vworld.html          # VWorld SDK -> `/src/index-vworld.jsx`
├── src/AppLegacy.jsx          # Three.js dashboard
├── src/AppVWorld.jsx          # VWorld dashboard
├── src/CityModel.jsx          # GLB selection and camera focus
├── src/components/            # Building and room drill-down UI
├── src/vworld/                # VWorld adapters and focused unit tests
└── src/utils/                 # D4 data, solar math, mock data
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Shared/default entry | `src/App.jsx` | Re-exports `AppLegacy` |
| Legacy layout/data flow | `src/AppLegacy.jsx` | Large integration component |
| VWorld layout/data flow | `src/AppVWorld.jsx` | Large integration component |
| 3D building mapping | `src/CityModel.jsx` | GLB names to `BLD_*` |
| VWorld building mapping | `src/vworld/buildingResolver.mjs` | `MODEL_NAME` contract |
| VWorld map lifecycle | `src/vworld/VWorldRenderer.jsx` | SDK, boundary, D4 marker |
| Popup API contract | `WEATHER_API.md` | Complete response and ID rules |
| D4 room data | `src/utils/d4BuildingData.mjs` | Floors, rooms, energy state |

## CONVENTIONS

- Legacy: `bun run dev:legacy`, `index.html`, `src/index.jsx`, `AppLegacy`.
- VWorld: `bun run dev:vworld`, `index-vworld.html`,
  `src/index-vworld.jsx`, `AppVWorld`.
- `vite.config.js` selects the HTML build input from mode; validate both outputs.
- Read `VITE_API_URL` for the weather service. Require
  `VITE_VWORLD_API_KEY` only for VWorld mode; keep both in ignored `.env.local`.
- Convert UI selections to canonical `BLD_*` IDs before fetching popup data.
- Use `/microclimate/elements/{element_id}/popup` as the complete building
  popup request. `RD_`, `ND_`, and `CW_` currently have no popup payload.
- Preserve the D4 coordinate marker until VWorld supplies a resolvable model.
- Keep estimated-data labeling visible when rendering material/radiation values.

## ANTI-PATTERNS

- Do not collapse Legacy and VWorld entry points into one build accidentally.
- Do not edit `.bak`, `App_backup.jsx`, or one-off Python rewrite scripts as if
  they were runtime modules.
- Do not copy hardcoded weather keys from old test/demo files into active code.
- Do not rename `common_elemetns.json` in isolation.
- Do not replace the VWorld selection helpers with ad hoc component-local maps;
  their `.mjs` modules have focused contract tests.

## COMMANDS

```powershell
cd frontend
bun install
bun run test
node --test src/vworld/*.test.mjs
bun run build
bun run build:vworld
bun run dev:legacy
bun run dev:vworld
```

## CHECKS

- Legacy renders at `http://127.0.0.1:5173`.
- VWorld renders at `http://127.0.0.1:5173/index-vworld.html`.
- A native VWorld building opens the matching `BLD_*` detail.
- The D4 coordinate marker opens the same detail path.
- Traffic failures may be silent by design; inspect the `8001` endpoint directly.

