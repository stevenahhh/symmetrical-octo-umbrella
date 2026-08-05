# api/app.py
"""
Campus Digital Twin — Weather & Microclimate API

엔드포인트 구조
===============
기존 (zone 기반, 하위 호환 유지)
  GET /                          API 정보
  GET /health                    헬스체크
  GET /environment/current       zone 기반 현재 환경
  GET /environment/full          zone + 예보

신규 (element 기반, microclimate 엔진 사용)
  GET /microclimate/elements              전체 element 미기후 + 체감지표
  GET /microclimate/elements/{id}         특정 element 결과
  GET /microclimate/elements/{id}/popup   건물 클릭 팝업용 UI-ready 응답 ★
  GET /microclimate/zones                 zone별 집계 (heatmap용)
  GET /microclimate/heatmap               heatmap 렌더링용 경량 결과
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

_WEATHER_ROOT = str(Path(__file__).parent.parent)
if _WEATHER_ROOT not in sys.path:
    sys.path.insert(0, _WEATHER_ROOT)

# 기존 collectors / domain (zone 기반)
from weather.collectors.kma_current import fetch_kma_current
from weather.collectors.air_quality import fetch_air_quality
from weather.collectors.kma_forecast import fetch_kma_forecast
from weather.domain.environment import build_environment_result
from weather.domain.zones import ZONES

# 신규 element 기반 파이프라인
from weather.processors.element_environment import build_element_environment_timeline, summarize_element_environment
from weather.processors.pipeline import aggregate_by_zone, run_pipeline_all, run_pipeline_for_element
from weather.processors.popup_formatter import format_popup_response
from weather.processors.weather_timeline import build_weather_timeline


# =========================================================
# FastAPI 앱 설정
# =========================================================

app = FastAPI(
    title="Campus Digital Twin — Microclimate API",
    description=(
        "캠퍼스 디지털 트윈 기반 미기후 분석 API.\n\n"
        "**신규**: `/microclimate/*` 엔드포인트 — element 단위 UTCI, WBGT, 체감온도 제공\n"
        "**기존**: `/environment/*` 엔드포인트 — zone 기반 환경 정보 (하위 호환)"
    ),
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


# =========================================================
# element feature 로딩
# =========================================================

_FEATURE_FILE  = Path(__file__).parent.parent / "data" / "microclimate_features.json"
_ELEMENTS_FILE = Path(__file__).parent.parent.parent / "common" / "data" / "common_elemetns.json"


# =========================================================
# 건물 메타 로더 (이름 / 타입)
# =========================================================

_element_meta_cache: Optional[Dict[str, Dict[str, str]]] = None

def _load_element_meta() -> Dict[str, Dict[str, str]]:
    """
    common_elemetns.json 에서 element_id → {name, element_type} 매핑 반환.
    파일이 없으면 빈 dict 반환 (graceful fallback).
    """
    global _element_meta_cache
    if _element_meta_cache is not None:
        return _element_meta_cache

    if not _ELEMENTS_FILE.exists():
        _element_meta_cache = {}
        return _element_meta_cache

    try:
        content = _ELEMENTS_FILE.read_text(encoding="utf-8").strip()
        # common_elemetns.json 은 두 JSON 블록이 빈 줄로 구분된 포맷
        parts = content.split("\n\n")
        common = json.loads(parts[1] if len(parts) > 1 else parts[0])
        _element_meta_cache = {
            e["element_id"]: {
                "name":         e.get("name", e["element_id"]),
                "element_type": e.get("element_type", "building"),
            }
            for e in common.get("elements", [])
        }
    except Exception:
        _element_meta_cache = {}

    return _element_meta_cache


def _load_element_features(path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """
    microclimate_features.json 을 로드.
    파일이 없으면 샘플 feature를 반환 (개발용 fallback).
    """
    target = path or _FEATURE_FILE
    if target.exists():
        with open(target, encoding="utf-8") as f:
            payload = json.load(f)
            if isinstance(payload, dict):
                return payload.get("features", [])
            return payload

    # --- fallback: 샘플 데이터 ---
    return [
        {
            "element_id": "RD_011",
            "zone_id":    "zone_central",
            "microclimate": {
                "albedo": 0.12, "vegetation_ratio": 0.05,
                "shade_factor": 0.10, "ventilation_factor": 0.75,
                "building_density": 0.30, "facade_reflectivity": 0.20,
                "sky_view_factor": 0.80, "orientation": 180.0,
            },
        },
        {
            "element_id": "GR_020",
            "zone_id":    "zone_green",
            "microclimate": {
                "albedo": 0.20, "vegetation_ratio": 0.60,
                "shade_factor": 0.50, "ventilation_factor": 0.85,
                "building_density": 0.10, "facade_reflectivity": 0.05,
                "sky_view_factor": 0.70, "orientation": 0.0,
            },
        },
        {
            "element_id": "ND_006",
            "zone_id":    "zone_central",
            "microclimate": {
                "albedo": 0.12, "vegetation_ratio": 0.03,
                "shade_factor": 0.05, "ventilation_factor": 0.90,
                "building_density": 0.20, "facade_reflectivity": 0.15,
                "sky_view_factor": 0.90, "orientation": 0.0,
            },
        },
    ]


def _fetch_weather_for_microclimate() -> Dict[str, Any]:
    """
    KMA 기상 데이터를 microclimate 파이프라인용으로 정규화.
    """
    weather = fetch_kma_current()
    # 필수 키 보정 (kma_current 에 없을 수 있는 필드)
    weather.setdefault("solar_radiation", 0.0)
    weather.setdefault("cloud_cover", 0.0)
    weather.setdefault("solar_altitude", 45.0)
    return weather


# =========================================================
# 기본 엔드포인트
# =========================================================

@app.get("/", summary="API 정보")
def root():
    return {
        "message": "Campus Digital Twin Microclimate API",
        "version": "0.2.0",
        "docs": "/docs",
        "endpoints": {
            "microclimate": [
                "/microclimate/elements",
                "/microclimate/elements/{element_id}",
                "/microclimate/zones",
                "/microclimate/heatmap",
            ],
            "legacy_zone": [
                "/environment/current",
                "/environment/full",
                "/environment/elements/timeline",
                "/environment/elements/{element_id}/timeline",
            ],
        },
    }


@app.get("/health", summary="헬스체크")
def health_check():
    return {"status": "ok"}


# =========================================================
# 신규: element 기반 미기후 엔드포인트
# =========================================================

@app.get(
    "/microclimate/elements",
    summary="전체 element 미기후 결과",
    description=(
        "모든 element에 대한 미기후 계산 결과 반환.\n\n"
        "각 element: local_temp, tmrt, feels_like, UTCI, WBGT, risk_level, reasons 포함."
    ),
)
def get_all_elements(
    detail: bool = Query(False, description="True이면 미기후 세부 계산값 포함"),
):
    try:
        weather  = _fetch_weather_for_microclimate()
        features = _load_element_features()
        results  = run_pipeline_all(weather, features, include_detail=detail)

        return JSONResponse(content={
            "timestamp":       weather.get("timestamp"),
            "base_weather":    {
                "temperature":  weather.get("temperature"),
                "humidity":     weather.get("humidity"),
                "wind_speed":   weather.get("wind_speed"),
            },
            "element_count":   len(results),
            "elements":        results,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/microclimate/elements/{element_id}",
    summary="특정 element 미기후 결과",
)
def get_element(
    element_id: str,
    detail: bool = Query(False, description="True이면 세부 계산값 포함"),
):
    try:
        weather  = _fetch_weather_for_microclimate()
        features = _load_element_features()

        feature = next(
            (f for f in features if f["element_id"] == element_id), None
        )
        if feature is None:
            raise HTTPException(
                status_code=404,
                detail=f"element_id '{element_id}' 를 찾을 수 없습니다.",
            )

        result = run_pipeline_for_element(weather, feature, include_detail=detail)
        return JSONResponse(content={
            "timestamp":    weather.get("timestamp"),
            "base_weather": {
                "temperature": weather.get("temperature"),
                "humidity":    weather.get("humidity"),
                "wind_speed":  weather.get("wind_speed"),
            },
            "element": result,
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/microclimate/elements/{element_id}/popup",
    summary="건물 클릭 팝업용 UI-ready 응답",
    description=(
        "3D 뷰에서 건물을 클릭했을 때 팝업에 표시할 모든 정보를 한 번에 반환.\n\n"
        "포함 내용:\n"
        "- 건물 이름 / 타입 / zone\n"
        "- local_temp / feels_like / UTCI / WBGT\n"
        "- risk_level + 위험도 색상 코드(risk_color) + 정수 점수(risk_score 0~4)\n"
        "- 미기후 인자 정성 평가 (shade / vegetation / wind / radiation)\n"
        "- 기준 기상 대비 온도 델타\n"
        "- 원인 설명(reasons)\n"
        "- 기준 기상 요약"
    ),
)
def get_element_popup(element_id: str):
    try:
        weather  = _fetch_weather_for_microclimate()
        features = _load_element_features()
        meta     = _load_element_meta()

        feature = next(
            (f for f in features if f["element_id"] == element_id), None
        )
        if feature is None:
            raise HTTPException(
                status_code=404,
                detail=f"element_id '{element_id}' 를 찾을 수 없습니다.",
            )

        try:
            pipeline_result = run_pipeline_for_element(weather, feature, include_detail=False)
        except Exception as e:
            print(f"❌ pipeline error for {element_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

        # 건물 메타 (없으면 element_id 를 이름으로 사용)
        m = meta.get(element_id, {})
        name         = m.get("name", element_id)
        element_type = m.get("element_type", "building")
        zone_id      = feature.get("zone_id", "")
        microclimate = feature.get("microclimate") or {}

        popup = format_popup_response(
            element_id      = element_id,
            name            = name,
            zone_id         = zone_id,
            element_type    = element_type,
            pipeline_result = pipeline_result,
            microclimate    = microclimate,
            weather         = weather,
            timestamp       = weather.get("timestamp"),
        )

        return JSONResponse(content=popup)

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ popup endpoint error for {element_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/microclimate/zones",
    summary="zone별 집계 결과",
    description=(
        "element 결과를 zone 단위로 집계.\n\n"
        "각 zone: 평균 기온, 평균 UTCI, 평균 WBGT, 최고 위험도 제공."
    ),
)
def get_zone_aggregates():
    try:
        weather  = _fetch_weather_for_microclimate()
        features = _load_element_features()
        elements = run_pipeline_all(weather, features)
        zones    = aggregate_by_zone(elements)

        return JSONResponse(content={
            "timestamp":   weather.get("timestamp"),
            "zone_count":  len(zones),
            "zones":       zones,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/microclimate/heatmap",
    summary="heatmap 렌더링용 경량 결과",
    description=(
        "3D 시각화 / heatmap 렌더링에 필요한 최소 필드만 반환.\n\n"
        "각 element: element_id, zone_id, utci, risk_level"
    ),
)
def get_heatmap():
    try:
        weather  = _fetch_weather_for_microclimate()
        features = _load_element_features()
        results  = run_pipeline_all(weather, features)

        heatmap = [
            {
                "element_id": r["element_id"],
                "zone_id":    r.get("zone_id"),
                "utci":       r["utci"],
                "wbgt":       r["wbgt"],
                "risk_level": r["risk_level"],
            }
            for r in results
        ]

        return JSONResponse(content={
            "timestamp": weather.get("timestamp"),
            "heatmap":   heatmap,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================
# 기존: zone 기반 엔드포인트 (하위 호환)
# =========================================================

def _build_zone_environment(weather: Optional[Dict[str, Any]] = None):
    weather = dict(weather or fetch_kma_current())
    air_quality = fetch_air_quality()
    weather.update(air_quality)
    return build_environment_result(weather, ZONES)


def _build_environment_timeline_bundle(element_id: Optional[str] = None) -> Dict[str, Any]:
    current_weather = fetch_kma_current()
    forecast_rows = fetch_kma_forecast(limit=None)
    weather_timeline = build_weather_timeline(forecast_rows, current_weather)

    features = _load_element_features()
    if element_id is not None:
        features = [feature for feature in features if feature.get("element_id") == element_id]
        if not features:
            raise HTTPException(
                status_code=404,
                detail=f"element_id '{element_id}' 를 찾을 수 없습니다.",
            )

    element_environment = build_element_environment_timeline(weather_timeline, features)
    return {
        "generated_at": current_weather.get("timestamp"),
        "weather_timeline": weather_timeline,
        "element_environment": element_environment,
        "element_summary": summarize_element_environment(element_environment),
        "element_count": len(features),
    }


@app.get("/environment/current", summary="[기존] zone 기반 현재 환경")
def get_environment_current():
    try:
        result = _build_zone_environment()
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/environment/full", summary="[기존] zone 기반 환경 + 예보")
def get_environment_full():
    try:
        current_weather = fetch_kma_current()
        result = _build_zone_environment(current_weather)
        forecast = fetch_kma_forecast()
        weather_timeline = build_weather_timeline(forecast, current_weather)
        element_environment = build_element_environment_timeline(weather_timeline, _load_element_features())
        return JSONResponse(content={
            **result,
            "forecast": forecast,
            "weather_timeline": weather_timeline,
            "element_environment": summarize_element_environment(element_environment),
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/environment/elements/timeline", summary="element 단위 시간별 local environment")
def get_environment_elements_timeline():
    try:
        payload = _build_environment_timeline_bundle()
        return JSONResponse(content={
            "generated_at": payload["generated_at"],
            "element_count": payload["element_count"],
            "weather_timeline": payload["weather_timeline"],
            "element_environment": payload["element_environment"],
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/environment/elements/{element_id}/timeline", summary="단일 element 시간별 local environment")
def get_environment_element_timeline(element_id: str):
    try:
        payload = _build_environment_timeline_bundle(element_id=element_id)
        element_rows = payload["element_environment"]
        return JSONResponse(content={
            "generated_at": payload["generated_at"],
            "weather_timeline": payload["weather_timeline"],
            "element": {
                "element_id": element_id,
                "zone_id": element_rows[0].get("zone_id") if element_rows else None,
                "element_type": element_rows[0].get("element_type") if element_rows else None,
                "timeline": element_rows,
            },
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from weather.api.energy import router as energy_router

app.include_router(energy_router)


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(_request: Request, exc: RequestValidationError):
    details = [{"type": item["type"], "location": list(item["loc"]), "message": item["msg"]}
               for item in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": {
        "code": "request_validation_error",
        "message_en": "The request failed validation.",
        "message_ko": "\uc694\uccad \uac80\uc99d\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.",
        "details": details,
    }})


@app.exception_handler(sqlite3.OperationalError)
async def sqlite_operational_error_handler(_request: Request, _exc: sqlite3.OperationalError):
    return JSONResponse(status_code=503, content={"detail": {
        "code": "database_unavailable",
        "message_en": "The database is temporarily unavailable.",
        "message_ko": "\ub370\uc774\ud130\ubca0\uc774\uc2a4\ub97c \uc0ac\uc6a9\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
    }})


def create_app() -> FastAPI:
    """Return the configured app; dependencies read current environment settings."""
    return app
