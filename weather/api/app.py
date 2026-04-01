# api/app.py

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from collectors.kma_current import fetch_kma_current
from collectors.air_quality import fetch_air_quality
from collectors.kma_forecast import fetch_kma_forecast
from domain.environment import build_environment_result
from domain.zones import ZONES


app = FastAPI(
    title="Campus Environment MVP API",
    description="AI 기반 스마트 캠퍼스 환경 디지털 트윈 MVP API",
    version="0.1.0",
)


def build_current_environment():
    weather = fetch_kma_current()
    air_quality = fetch_air_quality()
    weather.update(air_quality)
    return build_environment_result(weather, ZONES)


@app.get("/")
def root():
    return {
        "message": "Campus Environment MVP API is running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/environment/current")
def get_environment_current():
    try:
        result = build_current_environment()
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)},
        )


@app.get("/environment/full")
def get_environment_full():
    try:
        environment_result = build_current_environment()
        forecast = fetch_kma_forecast()

        final_result = {
            **environment_result,
            "forecast": forecast,
        }
        return JSONResponse(content=final_result)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)},
        )