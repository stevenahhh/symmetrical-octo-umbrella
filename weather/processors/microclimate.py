from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, Any

from processors.radiation import calculate_radiation_from_dict
from processors.wind import calculate_wind_from_dict


def safe_float(value, default=0.0):
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@dataclass
class MicroclimateResult:
    element_id: str
    local_temp: float
    local_wind_speed: float
    radiation_load: float
    tmrt: float
    surface_heat_effect: float
    vegetation_cooling_effect: float
    wind_cooling_effect: float


def calculate_microclimate_for_element(
    weather: Dict[str, Any],
    element_feature: Dict[str, Any],
) -> Dict[str, Any]:
    """
    하나의 element에 대한 미기후 결과를 계산한다.

    입력:
    - weather: 정규화된 기상 데이터
    - element_feature: microclimate_features.json의 element 하나

    출력:
    - element 단위 미기후 결과
    """

    element_id = element_feature["element_id"]
    micro = element_feature.get("microclimate", {})

    base_temp = safe_float(weather.get("temperature"), 25.0)

    vegetation_ratio = safe_float(micro.get("vegetation_ratio"), 0.0)
    albedo = safe_float(micro.get("albedo"), 0.15)

    # 1. 복사 계산
    radiation = calculate_radiation_from_dict(weather, micro)
    radiation_load = safe_float(radiation.get("radiation_load"), 0.0)
    tmrt = safe_float(radiation.get("tmrt"), base_temp)

    # 2. 풍속 계산
    wind = calculate_wind_from_dict(weather, micro)
    local_wind_speed = safe_float(wind.get("local_wind_speed"), 0.2)

    # 3. 표면 열효과
    # 복사부하가 클수록 지표면 열효과 증가
    # albedo가 낮을수록 흡수율이 커지므로 열효과 증가
    absorbed_ratio = 1.0 - albedo
    surface_heat_effect = radiation_load * absorbed_ratio * 0.004

    # 4. 녹지 냉각효과
    # vegetation_ratio가 높을수록 냉각
    vegetation_cooling_effect = vegetation_ratio * 2.5

    # 5. 바람 냉각효과
    # local wind가 클수록 열 제거 효과 증가
    wind_cooling_effect = min(local_wind_speed * 0.4, 2.0)

    # 6. 최종 국지기온
    local_temp = (
        base_temp
        + surface_heat_effect
        - vegetation_cooling_effect
        - wind_cooling_effect
    )

    result = MicroclimateResult(
        element_id=element_id,
        local_temp=round(local_temp, 3),
        local_wind_speed=round(local_wind_speed, 3),
        radiation_load=round(radiation_load, 3),
        tmrt=round(tmrt, 3),
        surface_heat_effect=round(surface_heat_effect, 3),
        vegetation_cooling_effect=round(vegetation_cooling_effect, 3),
        wind_cooling_effect=round(wind_cooling_effect, 3),
    )

    return {
        **asdict(result),
        "radiation_detail": radiation,
        "wind_detail": wind,
    }


def calculate_microclimate_all(
    weather: Dict[str, Any],
    features: list[Dict[str, Any]],
) -> list[Dict[str, Any]]:
    """
    전체 element에 대해 미기후 계산.
    """

    results = []

    for feature in features:
        results.append(
            calculate_microclimate_for_element(
                weather=weather,
                element_feature=feature,
            )
        )

    return results


if __name__ == "__main__":
    sample_weather = {
        "temperature": 32.0,
        "humidity": 60.0,
        "wind_speed": 3.5,
        "wind_direction": 90.0,
        "solar_radiation": 850.0,
        "cloud_cover": 0.2,
        "solar_altitude": 65.0,
    }

    sample_feature = {
        "element_id": "RD_011",
        "zone_id": "zone_central",
        "microclimate": {
            "albedo": 0.12,
            "vegetation_ratio": 0.1,
            "shade_factor": 0.15,
            "ventilation_factor": 0.8,
            "building_density": 0.3,
            "facade_reflectivity": 0.2,
            "sky_view_factor": 0.85,
            "orientation": 90.0
        }
    }

    print(calculate_microclimate_for_element(sample_weather, sample_feature))