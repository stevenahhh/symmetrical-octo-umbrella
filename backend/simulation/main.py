from __future__ import annotations

import asyncio
import json
import os
import time
import urllib.request
from contextlib import asynccontextmanager
from typing import Dict, Optional, Set
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

try:
    from .schemas import ScenarioRequest, SpeedRequest, StartRequest
    from .traci_adapter import InternalSimulationProvider, create_provider
except ImportError:  # Supports: cd simulation && uvicorn main:app
    from schemas import ScenarioRequest, SpeedRequest, StartRequest
    from traci_adapter import InternalSimulationProvider, create_provider


UPDATE_INTERVAL = max(0.05, float(os.getenv("SIMULATION_UPDATE_INTERVAL_MS", "100")) / 1000.0)
WEATHER_URL = os.getenv("WEATHER_API_URL", "http://127.0.0.1:8000")
provider, provider_message = create_provider()
clients: Set[WebSocket] = set()
loop_task: Optional[asyncio.Task] = None
weather_task: Optional[asyncio.Task] = None
runtime_status = "stopped"
runtime_time = 0.0
runtime_speed = 1.0
DATA_DIR = Path(__file__).resolve().parent / "data"


def _engine():
    return provider.engine if isinstance(provider, InternalSimulationProvider) else None


def _model_dict(value):
    return value.model_dump() if hasattr(value, "model_dump") else value.dict()


async def _snapshot() -> Dict:
    engine = _engine()
    if engine:
        return engine.snapshot()
    return {
        "type": "simulation_update",
        "simulation_time": round(runtime_time, 2),
        "status": runtime_status,
        "entities": await provider.get_entities(),
        "risk_events": [],
        "statistics": {},
        "traffic_lights": await provider.get_traffic_lights(),
        "weather": {"source": "unavailable"},
    }


async def _simulation_loop() -> None:
    global runtime_time
    previous = time.monotonic()
    while True:
        started = time.monotonic()
        delta = min(started - previous, 0.5)
        previous = started
        if runtime_status == "running":
            await provider.step(delta if _engine() else delta * runtime_speed)
            if not _engine():
                runtime_time += delta * runtime_speed
        payload = await _snapshot()
        disconnected = []
        for websocket in tuple(clients):
            try:
                await websocket.send_json(payload)
            except Exception:
                disconnected.append(websocket)
        for websocket in disconnected:
            clients.discard(websocket)
        elapsed = time.monotonic() - started
        await asyncio.sleep(max(0.0, UPDATE_INTERVAL - elapsed))


def _fetch_weather_sync() -> Dict:
    request = urllib.request.Request(f"{WEATHER_URL.rstrip('/')}/environment/full", headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=2.0) as response:
        payload = json.load(response)
    base = payload.get("base_weather") or payload.get("current") or {}
    precipitation = base.get("precipitation", base.get("rain", 0))
    sky = str(base.get("sky", ""))
    return {
        "rain": bool(precipitation and float(precipitation) > 0) or "비" in sky,
        "wind_speed": float(base.get("wind_speed", 0) or 0),
        "night": bool(base.get("night", False)),
        "source": "weather_api",
    }


async def _weather_loop() -> None:
    while True:
        try:
            weather = await asyncio.to_thread(_fetch_weather_sync)
            engine = _engine()
            if engine and engine.weather.get("source") != "scenario":
                engine.set_weather(weather)
        except (OSError, ValueError, json.JSONDecodeError):
            # Weather API is optional; retain the last/default condition.
            pass
        await asyncio.sleep(max(10.0, float(os.getenv("WEATHER_POLL_INTERVAL_SECONDS", "60"))))


@asynccontextmanager
async def lifespan(_: FastAPI):
    global loop_task, weather_task
    loop_task = asyncio.create_task(_simulation_loop(), name="simulation-loop")
    weather_task = asyncio.create_task(_weather_loop(), name="simulation-weather")
    try:
        yield
    finally:
        for task in (loop_task, weather_task):
            if task:
                task.cancel()
        await asyncio.gather(*(task for task in (loop_task, weather_task) if task), return_exceptions=True)
        await provider.stop()
        clients.clear()


app = FastAPI(
    title="SCNU Campus Traffic Simulation API",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    engine = _engine()
    return {"status": "ok", "provider": type(provider).__name__, "message": provider_message, "network_runtime": engine.network_runtime if engine else None}


@app.get("/api/simulation/status")
async def simulation_status():
    engine = _engine()
    return {
        "status": engine.status if engine else runtime_status,
        "simulation_time": engine.simulation_time if engine else runtime_time,
        "speed_multiplier": engine.speed_multiplier if engine else runtime_speed,
        "scenario": engine.scenario_name if engine else None,
        "available_scenarios": engine.scenarios.names() if engine else [],
        "provider": type(provider).__name__,
        "provider_message": provider_message,
        "network_runtime": engine.network_runtime if engine else None,
        "update_interval_ms": int(UPDATE_INTERVAL * 1000),
    }


@app.post("/api/simulation/start")
async def simulation_start(request: Optional[StartRequest] = None):
    global runtime_status
    request = request or StartRequest()
    engine = _engine()
    if engine:
        counts = _model_dict(request.counts) if request.counts else None
        try:
            engine.start(counts=counts, scenario_name=request.scenario)
        except (KeyError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        await provider.start()
    runtime_status = "running"
    return await simulation_status()


@app.post("/api/simulation/pause")
async def simulation_pause():
    global runtime_status
    await provider.pause()
    runtime_status = "paused"
    return await simulation_status()


@app.post("/api/simulation/resume")
async def simulation_resume():
    global runtime_status
    engine = _engine()
    if engine:
        engine.resume()
    else:
        await provider.start()
    runtime_status = "running"
    return await simulation_status()


@app.post("/api/simulation/reset")
async def simulation_reset():
    global runtime_status, runtime_time, runtime_speed
    await provider.reset()
    runtime_status, runtime_time, runtime_speed = "stopped", 0.0, 1.0
    return await simulation_status()


@app.post("/api/simulation/speed")
async def simulation_speed(request: SpeedRequest):
    global runtime_speed
    runtime_speed = request.multiplier
    engine = _engine()
    if engine:
        engine.set_speed(request.multiplier)
    return await simulation_status()


@app.post("/api/simulation/scenario")
async def simulation_scenario(request: ScenarioRequest):
    engine = _engine()
    if not engine:
        raise HTTPException(status_code=501, detail="시나리오 설정은 현재 내부 시뮬레이터에서 지원됩니다.")
    try:
        engine.configure(
            request.scenario,
            _model_dict(request.counts) if request.counts else None,
            request.risk_events_enabled,
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await simulation_status()


@app.get("/api/simulation/entities")
async def simulation_entities():
    return {"entities": await provider.get_entities()}


@app.get("/api/simulation/agents/{agent_id}")
async def simulation_agent(agent_id: str):
    engine = _engine()
    if not engine:
        raise HTTPException(status_code=501, detail="Agent 상세 조회는 현재 내부 시뮬레이터에서 지원됩니다.")
    try:
        return engine.agent_detail(agent_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/simulation/events")
async def simulation_events(limit: int = Query(100, ge=1, le=200)):
    engine = _engine()
    return {"events": engine.risk_engine.recent_events(limit) if engine else []}


@app.get("/api/simulation/events/{event_id}")
async def simulation_event(event_id: str):
    engine = _engine()
    if not engine:
        raise HTTPException(status_code=501, detail="Event replay는 현재 내부 시뮬레이터에서 지원됩니다.")
    try:
        return engine.risk_event_detail(event_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/simulation/timeline")
async def simulation_timeline(limit: int = Query(200, ge=1, le=1000)):
    engine = _engine()
    return {"timeline": engine.statistics_manager.timeline(limit) if engine else []}


@app.get("/api/simulation/statistics")
async def simulation_statistics():
    engine = _engine()
    return engine.statistics() if engine else {"entity_count": len(await provider.get_entities())}


@app.get("/api/simulation/network")
async def simulation_network():
    path = DATA_DIR / "campus_transport_network.geojson"
    if not path.exists():
        raise HTTPException(status_code=404, detail="campus_transport_network.geojson이 없습니다.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/simulation/network/quality")
async def simulation_network_quality():
    path = DATA_DIR / "network_validation.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="먼저 python -m simulation.tools.validate_network를 실행하세요.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.websocket("/ws/simulation")
async def simulation_websocket(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    try:
        await websocket.send_json(await _snapshot())
        while True:
            # Optional ping/control messages keep disconnect detection explicit.
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8002)
