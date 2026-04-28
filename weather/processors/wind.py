# weather/processors/wind.py

from __future__ import annotations

import math
from dataclasses import dataclass, asdict


def clamp(value, min_v, max_v, default):
    if value is None:
        return default
    try:
        value = float(value)
    except:
        return default
    return max(min_v, min(value, max_v))


@dataclass
class WindInput:
    wind_speed: float
    wind_direction: float

    ventilation_factor: float = 1.0
    building_density: float = 0.0
    element_orientation: float = 0.0


@dataclass
class WindResult:
    local_wind_speed: float
    alignment_factor: float
    density_factor: float


def calculate_wind(data: WindInput) -> WindResult:
    """
    외부 풍속을 공간별 풍속으로 보정한다.
    """

    wind_speed = max(0.0, data.wind_speed)
    wind_direction = clamp(data.wind_direction, 0, 360, 0)

    ventilation_factor = clamp(data.ventilation_factor, 0, 1, 1)
    building_density = clamp(data.building_density, 0, 1, 0)
    element_orientation = clamp(data.element_orientation, 0, 360, 0)

    # 1. 풍향 정렬도 계산
    angle_diff = abs(wind_direction - element_orientation)
    angle_diff = min(angle_diff, 360 - angle_diff)  # 0~180으로 변환

    alignment_factor = abs(math.cos(math.radians(angle_diff)))

    # 2. 건물 밀도 감쇠
    density_factor = 1 - (0.6 * building_density)

    # 3. 최종 풍속 계산
    local_wind = (
        wind_speed
        * ventilation_factor
        * density_factor
        * (0.5 + 0.5 * alignment_factor)
    )

    # 4. 최소 풍속 보정
    local_wind = max(0.2, local_wind)

    return WindResult(
        local_wind_speed=round(local_wind, 3),
        alignment_factor=round(alignment_factor, 3),
        density_factor=round(density_factor, 3),
    )


def calculate_wind_from_dict(weather: dict, micro: dict) -> dict:
    data = WindInput(
        wind_speed=weather.get("wind_speed", 0.0),
        wind_direction=weather.get("wind_direction", 0.0),
        ventilation_factor=micro.get("ventilation_factor", 1.0),
        building_density=micro.get("building_density", 0.0),
        element_orientation=micro.get("orientation", 0.0),
    )

    return asdict(calculate_wind(data))


if __name__ == "__main__":
    weather = {
        "wind_speed": 3.5,
        "wind_direction": 90
    }

    micro = {
        "ventilation_factor": 0.8,
        "building_density": 0.3,
        "orientation": 90
    }

    print(calculate_wind_from_dict(weather, micro))