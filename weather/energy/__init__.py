"""Campus energy simulation domain."""

from .weather_scenarios import (
    PRESET_NAMES,
    WeatherInputError,
    WeatherInterval,
    WeatherSeries,
    adapt_kma_estimate,
    build_preset_series,
    fetch_kma_estimate,
)

__all__ = [
    "PRESET_NAMES", "WeatherInputError", "WeatherInterval", "WeatherSeries",
    "adapt_kma_estimate", "build_preset_series", "fetch_kma_estimate",
]
