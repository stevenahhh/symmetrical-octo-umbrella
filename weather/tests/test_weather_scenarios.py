from __future__ import annotations

import json
from datetime import date, datetime
from threading import Event

import pytest
import requests

from weather.energy.weather_scenarios import (
    PRESET_NAMES,
    WeatherInputError,
    adapt_kma_estimate,
    build_preset_series,
    fetch_kma_estimate,
)


@pytest.mark.parametrize("preset", PRESET_NAMES)
def test_presets_emit_96_ordered_scnu_slots(preset: str) -> None:
    series = build_preset_series(date(2026, 5, 15), preset)
    assert series.status == "available"
    assert series.source == "scenario"
    assert len(series.intervals) == 96
    timestamps = [slot.timestamp for slot in series.intervals]
    assert timestamps == sorted(timestamps)
    assert timestamps[0] == "2026-05-15T00:00:00+09:00"
    assert timestamps[-1] == "2026-05-15T23:45:00+09:00"
    assert all(slot.source == "scenario" for slot in series.intervals)
    assert all(0 <= slot.cloud_factor <= 1 for slot in series.intervals)
    assert all(slot.global_irradiance_w_m2 >= 0 for slot in series.intervals)


def test_irradiance_is_zero_below_horizon() -> None:
    series = build_preset_series("2026-05-15", "clear")
    night = [slot for slot in series.intervals if slot.solar_altitude_deg <= 0]
    assert night
    assert all(slot.global_irradiance_w_m2 == 0 for slot in night)
    assert any(slot.global_irradiance_w_m2 > 0 for slot in series.intervals)


def test_presets_are_distinct_and_repeated_serialization_is_identical() -> None:
    series = [build_preset_series("2026-05-15", name) for name in PRESET_NAMES]
    totals = [sum(slot.global_irradiance_w_m2 for slot in item.intervals) for item in series]
    assert totals[0] > totals[1] > totals[2]
    encode = lambda value: json.dumps(value.to_dict(), sort_keys=True, separators=(",", ":"))
    assert encode(series[0]) == encode(build_preset_series("2026-05-15", "clear"))

    with pytest.raises(TypeError):
        series[0].intervals[0].field_sources["ambient_temperature_c"] = "tampered"  # type: ignore[index]
    assert encode(series[0]) == encode(build_preset_series("2026-05-15", "clear"))


def test_kma_adapter_preserves_estimated_provenance() -> None:
    result = adapt_kma_estimate({
        "timestamp": "20260515T1200", "temperature": 24.5,
        "solar_altitude": 68.2, "cloud_cover": 0.1, "solar_radiation": 950.2,
    })
    assert result.status == "available"
    assert result.source == "estimated"
    slot = result.intervals[0]
    assert slot.source == "estimated"
    assert slot.field_sources == {
        "ambient_temperature_c": "kma_observation",
        "cloud_factor": "estimated_from_kma_precipitation_type",
        "global_irradiance_w_m2": "estimated_from_solar_position_and_cloud",
    }
    assert "not measured" in slot.quality_text.lower()
    assert "not measured" in result.quality_text.lower()


@pytest.mark.parametrize("failure, code", [
    (requests.Timeout("deadline"), "kma_timeout"),
    (requests.ConnectionError("offline"), "kma_unavailable"),
])
def test_kma_failure_returns_typed_unavailable_state(failure: Exception, code: str) -> None:
    def fail() -> dict[str, object]:
        raise failure
    result = fetch_kma_estimate(fetcher=fail, timeout_seconds=0.1)
    assert result.status == "unavailable"
    assert result.source == "estimated"
    assert result.error_code == code
    assert result.intervals == ()
    assert "measured" not in result.quality_text.lower()


def test_adapter_rejects_malformed_kma_without_fabricating_values() -> None:
    result = adapt_kma_estimate({"timestamp": "bad", "temperature": "warm"})
    assert result.status == "unavailable"
    assert result.error_code == "invalid_kma_payload"
    assert result.intervals == ()


def test_hung_fetcher_is_bounded() -> None:
    never_finishes = Event()
    result = fetch_kma_estimate(fetcher=lambda: never_finishes.wait(), timeout_seconds=0.01)
    assert result.status == "unavailable"
    assert result.error_code == "kma_timeout"


@pytest.mark.parametrize("scenario_date, preset", [
    ("2026-02-30", "clear"),
    (datetime(2026, 5, 15, 12), "clear"),
    ("2026-05-15", "storm"),
])
def test_malformed_scenario_request_has_typed_error(scenario_date: object, preset: str) -> None:
    with pytest.raises(WeatherInputError):
        build_preset_series(scenario_date, preset)  # type: ignore[arg-type]
