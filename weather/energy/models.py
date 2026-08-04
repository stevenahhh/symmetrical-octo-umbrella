"""Typed persistence records for the campus energy domain."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Literal

Orientation = Literal["portrait", "landscape"]


def _text(value: str, field_name: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")


def _number(value: float, field_name: str, minimum: float | None = None) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{field_name} must be a finite number")
    if minimum is not None and value < minimum:
        raise ValueError(f"{field_name} must be at least {minimum}")


def _timestamp(value: str, field_name: str) -> None:
    _text(value, field_name)
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} must be an ISO timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{field_name} must include a UTC offset")


@dataclass(frozen=True)
class PanelArray:
    id: str
    scenario_id: str
    roof_id: str
    roof_zone_id: str
    module_id: str
    origin_x_m: float
    origin_y_m: float
    rows: int
    columns: int
    azimuth_deg: float
    tilt_deg: float
    orientation: Orientation
    module_width_m: float
    module_length_m: float
    module_efficiency_percent: float
    module_nominal_power_wp: float
    inter_panel_gap_m: float

    def __post_init__(self) -> None:
        for name in ("id", "scenario_id", "roof_id", "roof_zone_id", "module_id"):
            _text(getattr(self, name), name)
        for name in ("origin_x_m", "origin_y_m"):
            _number(getattr(self, name), name)
        for name in ("rows", "columns"):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValueError(f"{name} must be a positive integer")
        _number(self.azimuth_deg, "azimuth_deg")
        _number(self.tilt_deg, "tilt_deg")
        if not 0 <= self.azimuth_deg < 360:
            raise ValueError("azimuth_deg must be in [0, 360)")
        if not 0 <= self.tilt_deg <= 45:
            raise ValueError("tilt_deg must be in [0, 45]")
        if self.orientation not in ("portrait", "landscape"):
            raise ValueError("orientation must be portrait or landscape")
        for name in ("module_width_m", "module_length_m", "module_nominal_power_wp"):
            _number(getattr(self, name), name, 0.000001)
        _number(self.module_efficiency_percent, "module_efficiency_percent", 0)
        if self.module_efficiency_percent > 100:
            raise ValueError("module_efficiency_percent must not exceed 100")
        _number(self.inter_panel_gap_m, "inter_panel_gap_m", 0)


@dataclass(frozen=True)
class ScenarioInterval:
    timestamp: str
    ambient_temperature_c: float
    global_irradiance_w_m2: float
    predicted_demand_kw: float
    predicted_demand_energy_kwh: float
    generation_energy_kwh: float
    weather_source: str
    demand_quality: str

    def __post_init__(self) -> None:
        _timestamp(self.timestamp, "timestamp")
        _number(self.ambient_temperature_c, "ambient_temperature_c")
        for name in ("global_irradiance_w_m2", "predicted_demand_kw",
                     "predicted_demand_energy_kwh", "generation_energy_kwh"):
            _number(getattr(self, name), name, 0)
        _text(self.weather_source, "weather_source")
        _text(self.demand_quality, "demand_quality")


@dataclass(frozen=True)
class Scenario:
    id: str
    building_id: str
    name: str
    weather_preset: str
    created_at: str
    updated_at: str
    arrays: tuple[PanelArray, ...] = field(default_factory=tuple)
    intervals: tuple[ScenarioInterval, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        for name in ("id", "building_id", "name", "weather_preset"):
            _text(getattr(self, name), name)
        _timestamp(self.created_at, "created_at")
        _timestamp(self.updated_at, "updated_at")
        if any(item.scenario_id != self.id for item in self.arrays):
            raise ValueError("every panel array must reference its scenario")
        if len({item.id for item in self.arrays}) != len(self.arrays):
            raise ValueError("panel array IDs must be unique")
        if len({item.timestamp for item in self.intervals}) != len(self.intervals):
            raise ValueError("scenario interval timestamps must be unique")

    def to_dict(self) -> dict[str, Any]:
        """Return a Pydantic-compatible primitive mapping."""
        return asdict(self)
