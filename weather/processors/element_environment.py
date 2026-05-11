from __future__ import annotations

from typing import Any

from processors.pipeline import risk_level_to_score, run_pipeline_all
from processors.weather_timeline import timeline_frame_to_weather_input


def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _estimate_rain_cooling(weather_frame: dict[str, Any]) -> float:
    precipitation_amount = weather_frame.get("precipitation_amount")
    precipitation_type = weather_frame.get("precipitation_type")

    if precipitation_amount is None and precipitation_type in (None, 0):
        return 0.0

    amount_component = 0.0 if precipitation_amount is None else min(float(precipitation_amount), 10.0) * 0.18
    type_component = 0.35 if precipitation_type not in (None, 0) else 0.0
    return round(min(2.5, amount_component + type_component), 3)


def _build_drivers(
    weather_frame: dict[str, Any],
    element_feature: dict[str, Any],
    pipeline_result: dict[str, Any],
) -> dict[str, float]:
    micro = element_feature.get("microclimate", {})
    detail = pipeline_result.get("microclimate_detail", {})
    solar_radiation = _safe_float(weather_frame.get("solar_radiation"))
    shade_factor = _safe_float(micro.get("shade_factor"))

    radiation_effect = _safe_float(detail.get("surface_heat_effect")) + _safe_float(detail.get("material_heat_retention"))
    shade_effect = -(shade_factor * solar_radiation * 0.002)
    vegetation_effect = -_safe_float(detail.get("vegetation_cooling_effect"))
    ventilation_effect = -_safe_float(detail.get("wind_cooling_effect"))
    rain_cooling_effect = -_estimate_rain_cooling(weather_frame)

    return {
        "radiation": round(radiation_effect, 3),
        "shade": round(shade_effect, 3),
        "vegetation": round(vegetation_effect, 3),
        "ventilation": round(ventilation_effect, 3),
        "rain_cooling": round(rain_cooling_effect, 3),
    }


def _reshape_result(
    weather_frame: dict[str, Any],
    element_feature: dict[str, Any],
    pipeline_result: dict[str, Any],
) -> dict[str, Any]:
    risk_level = pipeline_result.get("risk_level", "낮음")
    return {
        "timestamp": weather_frame.get("timestamp"),
        "element_id": pipeline_result.get("element_id"),
        "zone_id": element_feature.get("zone_id"),
        "element_type": element_feature.get("element_type"),
        "weather_ref": {
            "timestamp": weather_frame.get("timestamp"),
            "lead_hour": weather_frame.get("lead_hour"),
            "source": weather_frame.get("source"),
            "precipitation_source": weather_frame.get("precipitation_source"),
        },
        "local_environment": {
            "local_temp": pipeline_result.get("local_temp"),
            "local_wind_speed": pipeline_result.get("local_wind_speed"),
            "radiation_load": pipeline_result.get("radiation_load"),
            "tmrt": pipeline_result.get("tmrt"),
            "feels_like": pipeline_result.get("feels_like"),
            "utci": pipeline_result.get("utci"),
            "wbgt": pipeline_result.get("wbgt"),
            "risk_level": risk_level,
            "risk_score": risk_level_to_score(risk_level),
            "stress_category": pipeline_result.get("stress_category"),
            "reasons": pipeline_result.get("reasons", []),
        },
        "drivers": _build_drivers(weather_frame, element_feature, pipeline_result),
    }


def build_element_environment_timeline(
    weather_timeline: list[dict[str, Any]],
    element_features: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    timeline_rows: list[dict[str, Any]] = []

    for frame in weather_timeline:
        weather_input = timeline_frame_to_weather_input(frame)
        pipeline_results = run_pipeline_all(weather_input, element_features, include_detail=True)
        for feature, pipeline_result in zip(element_features, pipeline_results):
            timeline_rows.append(_reshape_result(frame, feature, pipeline_result))

    return timeline_rows


def summarize_element_environment(
    element_environment: list[dict[str, Any]],
    limit: int = 10,
) -> dict[str, Any]:
    ranked = sorted(
        element_environment,
        key=lambda item: (
            -item["local_environment"].get("risk_score", 0),
            -_safe_float(item["local_environment"].get("utci")),
            item.get("weather_ref", {}).get("lead_hour", 999),
            item.get("element_id") or "",
        ),
    )

    items = [
        {
            "timestamp": item.get("timestamp"),
            "element_id": item.get("element_id"),
            "zone_id": item.get("zone_id"),
            "element_type": item.get("element_type"),
            "weather_ref": item.get("weather_ref"),
            "risk_level": item["local_environment"].get("risk_level"),
            "risk_score": item["local_environment"].get("risk_score"),
            "utci": item["local_environment"].get("utci"),
            "feels_like": item["local_environment"].get("feels_like"),
        }
        for item in ranked[:limit]
    ]

    return {
        "summary_scope": "top_risk_all_lead_hours",
        "item_count": len(items),
        "items": items,
    }
