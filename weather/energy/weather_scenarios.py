"""Deterministic SCNU weather scenarios and an estimated KMA adapter.

KMA's current-observation endpoint does not provide cloud cover or irradiance.
The existing collector derives those fields from precipitation type and solar
position, so this adapter deliberately marks the whole solar interval as
``estimated`` while retaining field-level provenance for temperature.
"""

from __future__ import annotations

import math
import queue
import threading
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from types import MappingProxyType
from typing import Any, Callable, Literal, Mapping

import requests

SCNU_LATITUDE_DEG = 34.96
SCNU_LONGITUDE_DEG = 127.49
KST = timezone(timedelta(hours=9))
PRESET_NAMES = ("clear", "partly_cloudy", "overcast")

Source = Literal["scenario", "estimated"]
Status = Literal["available", "unavailable"]


class WeatherInputError(ValueError):
    """A caller supplied an invalid deterministic scenario request."""


@dataclass(frozen=True)
class WeatherInterval:
    timestamp: str
    ambient_temperature_c: float
    global_irradiance_w_m2: float
    cloud_factor: float
    solar_altitude_deg: float
    source: Source
    quality_text: str
    field_sources: Mapping[str, str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "ambient_temperature_c": self.ambient_temperature_c,
            "global_irradiance_w_m2": self.global_irradiance_w_m2,
            "cloud_factor": self.cloud_factor,
            "solar_altitude_deg": self.solar_altitude_deg,
            "source": self.source,
            "quality_text": self.quality_text,
            "field_sources": dict(self.field_sources),
        }


@dataclass(frozen=True)
class WeatherSeries:
    status: Status
    source: Source
    scenario_id: str | None
    location_id: str
    timezone: str
    quality_text: str
    intervals: tuple[WeatherInterval, ...]
    error_code: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "source": self.source,
            "scenario_id": self.scenario_id,
            "location_id": self.location_id,
            "timezone": self.timezone,
            "quality_text": self.quality_text,
            "intervals": [slot.to_dict() for slot in self.intervals],
            "error_code": self.error_code,
        }


@dataclass(frozen=True)
class _Preset:
    cloud_cover: float
    temperature_offset_c: float
    quality_text: str


_PRESETS = {
    "clear": _Preset(0.08, 1.5, "Reproducible clear-sky simulation assumption; not observed weather."),
    "partly_cloudy": _Preset(0.48, 0.0, "Reproducible partly-cloudy simulation assumption; not observed weather."),
    "overcast": _Preset(0.88, -1.5, "Reproducible overcast simulation assumption; not observed weather."),
}
_SCENARIO_FIELD_SOURCES = MappingProxyType(
    {
        "ambient_temperature_c": "scenario_preset",
        "cloud_factor": "scenario_preset",
        "global_irradiance_w_m2": "scenario_solar_model",
    }
)
_KMA_FIELD_SOURCES = MappingProxyType(
    {
        "ambient_temperature_c": "kma_observation",
        "cloud_factor": "estimated_from_kma_precipitation_type",
        "global_irradiance_w_m2": "estimated_from_solar_position_and_cloud",
    }
)
_KMA_QUALITY = (
    "Temperature comes from the KMA observation; cloud factor and irradiance "
    "are model estimates, not measured solar data."
)


def _parse_date(value: date | str) -> date:
    if isinstance(value, datetime) or not isinstance(value, (date, str)):
        raise WeatherInputError("scenario_date must be a date or YYYY-MM-DD string")
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise WeatherInputError("scenario_date must be a valid YYYY-MM-DD date") from exc


def _solar_altitude(local_dt: datetime) -> float:
    """NOAA fractional-year approximation, evaluated explicitly in KST."""
    day = local_dt.timetuple().tm_yday
    hour = local_dt.hour + local_dt.minute / 60.0
    gamma = 2.0 * math.pi / 365.0 * (day - 1 + (hour - 12.0) / 24.0)
    equation_of_time = 229.18 * (
        0.000075 + 0.001868 * math.cos(gamma) - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2 * gamma) - 0.040849 * math.sin(2 * gamma)
    )
    declination = (
        0.006918 - 0.399912 * math.cos(gamma) + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2 * gamma) + 0.000907 * math.sin(2 * gamma)
        - 0.002697 * math.cos(3 * gamma) + 0.00148 * math.sin(3 * gamma)
    )
    time_offset = equation_of_time + 4.0 * SCNU_LONGITUDE_DEG - 60.0 * 9.0
    true_solar_minutes = local_dt.hour * 60.0 + local_dt.minute + time_offset
    hour_angle = math.radians(true_solar_minutes / 4.0 - 180.0)
    latitude = math.radians(SCNU_LATITUDE_DEG)
    cos_zenith = (
        math.sin(latitude) * math.sin(declination)
        + math.cos(latitude) * math.cos(declination) * math.cos(hour_angle)
    )
    altitude = 90.0 - math.degrees(math.acos(max(-1.0, min(1.0, cos_zenith))))
    return round(altitude, 3)


def _cloud_cover(preset_name: str, slot_index: int) -> float:
    base = _PRESETS[preset_name].cloud_cover
    if preset_name != "partly_cloudy":
        return base
    # A fixed wave gives cloud variation without randomness or mutable state.
    return max(0.0, min(1.0, base + 0.16 * math.sin(2.0 * math.pi * slot_index / 24.0)))


def _temperature(local_dt: datetime, offset_c: float) -> float:
    day = local_dt.timetuple().tm_yday
    seasonal = 14.0 + 10.0 * math.sin(2.0 * math.pi * (day - 105) / 365.0)
    daily = 5.0 * math.sin(2.0 * math.pi * (local_dt.hour + local_dt.minute / 60.0 - 9.0) / 24.0)
    return round(seasonal + daily + offset_c, 2)


def _irradiance(altitude_deg: float, cloud_cover: float) -> tuple[float, float]:
    cloud_factor = max(0.0, min(1.0, 1.0 - 0.75 * cloud_cover**2))
    if altitude_deg <= 0.0:
        return 0.0, round(cloud_factor, 4)
    clear_sky = 1361.0 * math.sin(math.radians(altitude_deg)) * 0.75
    return round(max(0.0, clear_sky * cloud_factor), 1), round(cloud_factor, 4)


def build_preset_series(scenario_date: date | str, preset: str) -> WeatherSeries:
    requested_date = _parse_date(scenario_date)
    if preset not in _PRESETS:
        raise WeatherInputError(f"unknown weather preset: {preset!r}")
    config = _PRESETS[preset]
    start = datetime.combine(requested_date, time.min, tzinfo=KST)
    intervals = []
    for index in range(96):
        timestamp = start + timedelta(minutes=15 * index)
        altitude = _solar_altitude(timestamp)
        irradiance, cloud_factor = _irradiance(altitude, _cloud_cover(preset, index))
        intervals.append(WeatherInterval(
            timestamp=timestamp.isoformat(),
            ambient_temperature_c=_temperature(timestamp, config.temperature_offset_c),
            global_irradiance_w_m2=irradiance,
            cloud_factor=cloud_factor,
            solar_altitude_deg=altitude,
            source="scenario",
            quality_text=config.quality_text,
            field_sources=_SCENARIO_FIELD_SOURCES,
        ))
    return WeatherSeries(
        status="available", source="scenario",
        scenario_id=f"scnu-{preset}-{requested_date.isoformat()}",
        location_id="scnu", timezone="Asia/Seoul",
        quality_text=config.quality_text, intervals=tuple(intervals),
    )


def _unavailable(error_code: str) -> WeatherSeries:
    return WeatherSeries(
        status="unavailable", source="estimated", scenario_id=None,
        location_id="scnu", timezone="Asia/Seoul",
        quality_text="KMA weather unavailable; no weather values returned.",
        intervals=(), error_code=error_code,
    )


def _finite_number(payload: Mapping[str, Any], key: str) -> float:
    value = payload[key]
    if isinstance(value, bool):
        raise ValueError(key)
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(key)
    return number




def adapt_kma_estimate(payload: Mapping[str, Any]) -> WeatherSeries:
    try:
        timestamp = datetime.strptime(str(payload["timestamp"]), "%Y%m%dT%H%M").replace(tzinfo=KST)
        temperature = _finite_number(payload, "temperature")
        altitude = _finite_number(payload, "solar_altitude")
        cloud_cover = _finite_number(payload, "cloud_cover")
        irradiance = _finite_number(payload, "solar_radiation")
        if not 0.0 <= cloud_cover <= 1.0 or irradiance < 0.0:
            raise ValueError("out of range")
    except (KeyError, TypeError, ValueError, OverflowError):
        return _unavailable("invalid_kma_payload")

    cloud_factor = round(max(0.0, min(1.0, 1.0 - 0.75 * cloud_cover**2)), 4)
    slot = WeatherInterval(
        timestamp=timestamp.isoformat(), ambient_temperature_c=round(temperature, 2),
        global_irradiance_w_m2=0.0 if altitude <= 0 else round(irradiance, 1),
        cloud_factor=cloud_factor, solar_altitude_deg=round(altitude, 3),
        source="estimated", quality_text=_KMA_QUALITY, field_sources=_KMA_FIELD_SOURCES,
    )
    return WeatherSeries(
        status="available", source="estimated", scenario_id=None,
        location_id="scnu", timezone="Asia/Seoul", quality_text=_KMA_QUALITY,
        intervals=(slot,),
    )


def _default_kma_fetcher() -> Mapping[str, Any]:
    try:
        from weather.collectors.kma_current import fetch_kma_current
    except ModuleNotFoundError:
        from collectors.kma_current import fetch_kma_current
    return fetch_kma_current()


def fetch_kma_estimate(
    fetcher: Callable[[], Mapping[str, Any]] = _default_kma_fetcher,
    timeout_seconds: float = 5.0,
) -> WeatherSeries:
    if (
        isinstance(timeout_seconds, bool)
        or not isinstance(timeout_seconds, (int, float))
        or not math.isfinite(timeout_seconds)
        or timeout_seconds <= 0
    ):
        raise WeatherInputError("timeout_seconds must be a positive finite number")
    outcome: queue.Queue[tuple[str, Any]] = queue.Queue(maxsize=1)

    def run() -> None:
        try:
            outcome.put(("result", fetcher()))
        except Exception as exc:
            outcome.put(("error", exc))

    threading.Thread(target=run, name="kma-weather-fetch", daemon=True).start()
    try:
        kind, value = outcome.get(timeout=float(timeout_seconds))
    except queue.Empty:
        return _unavailable("kma_timeout")
    if kind == "result":
        if not isinstance(value, Mapping):
            return _unavailable("invalid_kma_payload")
        return adapt_kma_estimate(value)
    if isinstance(value, requests.Timeout):
        return _unavailable("kma_timeout")
    if isinstance(value, requests.RequestException):
        return _unavailable("kma_unavailable")
    return _unavailable("kma_unavailable")
