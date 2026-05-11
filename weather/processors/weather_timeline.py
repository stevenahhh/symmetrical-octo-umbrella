from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from collectors.kma_current import calc_solar_altitude, estimate_solar_radiation, pty_to_cloud_cover
from config import CAMPUS_LAT, CAMPUS_LON


KST = timezone(timedelta(hours=9))
TARGET_LEAD_HOURS = (1, 2, 3)

_SKY_TO_CLOUD = {
    "맑음": 0.1,
    "구름많음": 0.55,
    "흐림": 0.85,
}


def _ensure_kst(dt: datetime | None = None) -> datetime:
    value = dt or datetime.now(KST)
    if value.tzinfo is None:
        return value.replace(tzinfo=KST)
    return value.astimezone(KST)


def _parse_timestamp_kst(timestamp: str) -> datetime:
    return datetime.strptime(timestamp, "%Y%m%dT%H%M").replace(tzinfo=KST)


def _round_value(value: Any, digits: int = 3) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _current_timestamp_to_kst(current_weather: dict[str, Any], now: datetime | None = None) -> datetime:
    timestamp = current_weather.get("timestamp")
    if timestamp:
        try:
            return _parse_timestamp_kst(timestamp)
        except ValueError:
            pass
    return _ensure_kst(now)


def _bucket_targets(current_weather: dict[str, Any], now: datetime | None = None) -> dict[int, datetime]:
    base_dt = _current_timestamp_to_kst(current_weather, now).replace(minute=0, second=0, microsecond=0)
    return {
        lead_hour: base_dt + timedelta(hours=lead_hour)
        for lead_hour in TARGET_LEAD_HOURS
    }


def _sky_to_cloud_cover(sky: str | None, precipitation_type: int | None, fallback: float | None) -> float:
    candidates = []
    if sky in _SKY_TO_CLOUD:
        candidates.append(_SKY_TO_CLOUD[sky])
    if precipitation_type not in (None, 0):
        candidates.append(pty_to_cloud_cover(int(precipitation_type)))
    if fallback is not None:
        candidates.append(float(fallback))
    if not candidates:
        return 0.3
    return round(max(0.0, min(1.0, max(candidates))), 3)


def _estimate_timeline_radiation(
    solar_altitude: float,
    cloud_cover: float,
    precipitation_type: int | None,
    precipitation_amount: float | None,
    precipitation_probability: int | None,
) -> float:
    radiation = estimate_solar_radiation(solar_altitude, cloud_cover)

    if precipitation_type not in (None, 0):
        radiation *= 0.6
    elif precipitation_probability is not None and precipitation_probability >= 60:
        radiation *= 0.85

    if precipitation_amount is not None and precipitation_amount > 0.0:
        radiation *= max(0.35, 1.0 - min(precipitation_amount, 10.0) * 0.05)

    return round(max(0.0, radiation), 1)


def _build_frame(
    lead_hour: int,
    target_dt: datetime,
    forecast_row: dict[str, Any] | None,
    current_weather: dict[str, Any],
) -> dict[str, Any]:
    forecast_row = forecast_row or {}

    temperature = forecast_row.get("temperature")
    humidity = forecast_row.get("humidity")
    wind_speed = forecast_row.get("wind_speed")
    wind_direction = forecast_row.get("wind_direction")

    fallback_fields = []
    if temperature is None:
        temperature = current_weather.get("temperature")
        fallback_fields.append("temperature")
    if humidity is None:
        humidity = current_weather.get("humidity")
        fallback_fields.append("humidity")
    if wind_speed is None:
        wind_speed = current_weather.get("wind_speed")
        fallback_fields.append("wind_speed")
    if wind_direction is None:
        wind_direction = current_weather.get("wind_direction")
        fallback_fields.append("wind_direction")

    precipitation_type = forecast_row.get("precipitation_type")
    cloud_cover = _sky_to_cloud_cover(
        forecast_row.get("sky"),
        precipitation_type,
        current_weather.get("cloud_cover"),
    )

    utc_dt = target_dt.astimezone(timezone.utc).replace(tzinfo=None)
    solar_altitude = calc_solar_altitude(CAMPUS_LAT, CAMPUS_LON, utc_dt)
    solar_radiation = _estimate_timeline_radiation(
        solar_altitude=solar_altitude,
        cloud_cover=cloud_cover,
        precipitation_type=precipitation_type,
        precipitation_amount=forecast_row.get("precipitation_amount"),
        precipitation_probability=forecast_row.get("precipitation_probability"),
    )

    source = "kma_forecast"
    if fallback_fields and forecast_row:
        source = "kma_forecast_with_current_fallback"
    elif fallback_fields:
        source = "current_weather_fallback"

    return {
        "timestamp": target_dt.strftime("%Y%m%dT%H%M"),
        "lead_hour": lead_hour,
        "source": source,
        "core_source": "forecast" if not fallback_fields else source,
        "precipitation_source": "kma_forecast",
        "fallback_fields": fallback_fields,
        "temperature": _round_value(temperature, 1),
        "humidity": _round_value(humidity, 1),
        "wind_speed": _round_value(wind_speed, 1),
        "wind_direction": _round_value(wind_direction, 1),
        "sky": forecast_row.get("sky"),
        "cloud_cover": _round_value(cloud_cover, 3),
        "precipitation_probability": forecast_row.get("precipitation_probability"),
        "precipitation_amount": _round_value(forecast_row.get("precipitation_amount"), 3),
        "precipitation_amount_text": forecast_row.get("precipitation_amount_text"),
        "precipitation_type": precipitation_type,
        "solar_altitude": _round_value(solar_altitude, 2),
        "solar_radiation": _round_value(solar_radiation, 1),
        "base_time": forecast_row.get("base_time"),
    }


def build_weather_timeline(
    forecast_rows: list[dict[str, Any]],
    current_weather: dict[str, Any],
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    targets = _bucket_targets(current_weather, now)
    forecast_by_lead: dict[int, dict[str, Any]] = {}
    for row in forecast_rows:
        lead_hour = row.get("lead_hour")
        if isinstance(lead_hour, int) and lead_hour in TARGET_LEAD_HOURS:
            forecast_by_lead[lead_hour] = row
    forecast_by_timestamp = {
        row.get("timestamp"): row
        for row in forecast_rows
        if row.get("timestamp")
    }

    frames = []
    for lead_hour, target_dt in targets.items():
        forecast_row = forecast_by_lead.get(lead_hour)
        if forecast_row is None:
            forecast_row = forecast_by_timestamp.get(target_dt.strftime("%Y%m%dT%H%M"))
        frames.append(_build_frame(lead_hour, target_dt, forecast_row, current_weather))

    return frames


def timeline_frame_to_weather_input(frame: dict[str, Any]) -> dict[str, Any]:
    return {
        "timestamp": frame.get("timestamp"),
        "temperature": frame.get("temperature"),
        "humidity": frame.get("humidity"),
        "wind_speed": frame.get("wind_speed"),
        "wind_direction": frame.get("wind_direction"),
        "solar_radiation": frame.get("solar_radiation"),
        "cloud_cover": frame.get("cloud_cover"),
        "solar_altitude": frame.get("solar_altitude"),
        "precipitation_type": frame.get("precipitation_type"),
        "precipitation_probability": frame.get("precipitation_probability"),
        "precipitation_amount": frame.get("precipitation_amount"),
    }
