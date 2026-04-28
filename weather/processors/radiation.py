from __future__ import annotations

import math
from dataclasses import dataclass, asdict


def clamp(value: float | None, min_value: float, max_value: float, default: float) -> float:
    """
    값이 None이거나 범위를 벗어나면 안전하게 보정한다.
    """
    if value is None:
        return default

    try:
        value = float(value)
    except (TypeError, ValueError):
        return default

    return max(min_value, min(value, max_value))


@dataclass
class RadiationInput:
    temperature: float
    solar_radiation: float
    cloud_cover: float = 0.0
    solar_altitude: float = 45.0

    shade_factor: float = 0.0
    sky_view_factor: float = 1.0
    albedo: float = 0.15
    facade_reflectivity: float = 0.0


@dataclass
class RadiationResult:
    direct_radiation: float
    diffuse_radiation: float
    ground_reflection: float
    facade_reflection: float
    radiation_load: float
    tmrt: float

    cloud_factor: float
    altitude_factor: float


def calculate_radiation(data: RadiationInput) -> RadiationResult:
    """
    element 단위 복사 부하와 Tmrt를 계산한다.

    계산 논리:
    1. 운량으로 일사량 감소
    2. 태양 고도각으로 실제 입사 효과 보정
    3. 그늘로 직달복사 감소
    4. 하늘 개방도로 산란복사 조정
    5. 바닥 반사와 외벽 반사 추가
    6. radiation_load를 기반으로 Tmrt 추정
    """

    temperature = float(data.temperature)

    solar_radiation = max(0.0, float(data.solar_radiation))
    cloud_cover = clamp(data.cloud_cover, 0.0, 1.0, 0.0)
    solar_altitude = clamp(data.solar_altitude, 0.0, 90.0, 45.0)

    shade_factor = clamp(data.shade_factor, 0.0, 1.0, 0.0)
    sky_view_factor = clamp(data.sky_view_factor, 0.0, 1.0, 1.0)
    albedo = clamp(data.albedo, 0.0, 1.0, 0.15)
    facade_reflectivity = clamp(data.facade_reflectivity, 0.0, 1.0, 0.0)

    # 1. 구름 보정
    # 구름이 많으면 직사광 영향이 줄어든다.
    cloud_factor = 1.0 - (0.65 * cloud_cover)
    effective_solar = solar_radiation * cloud_factor

    # 2. 태양 고도 보정
    # 태양이 높을수록 보행자와 지표면에 들어오는 복사 영향이 커진다.
    altitude_factor = math.sin(math.radians(solar_altitude))
    altitude_factor = max(0.0, altitude_factor)

    altitude_adjusted_solar = effective_solar * altitude_factor

    # 3. 직달복사
    # 그늘이 많을수록 직접 들어오는 햇빛은 줄어든다.
    direct_radiation = altitude_adjusted_solar * (1.0 - shade_factor)

    # 4. 산란복사
    # 그늘이어도 하늘이 열려 있으면 산란광은 들어온다.
    diffuse_radiation = effective_solar * 0.20 * sky_view_factor

    # 5. 바닥 반사
    # 밝은 포장재일수록 반사광이 커진다.
    ground_reflection = effective_solar * albedo * 0.30

    # 6. 외벽 반사
    # 하늘 개방도가 낮다는 것은 주변 건물이 많을 가능성이 높다는 뜻.
    # 따라서 1 - sky_view_factor를 외벽 영향의 간단한 근사값으로 사용한다.
    facade_reflection = effective_solar * facade_reflectivity * (1.0 - sky_view_factor) * 0.25

    # 7. 총 복사 부하
    radiation_load = (
        direct_radiation
        + diffuse_radiation
        + ground_reflection
        + facade_reflection
    )

    # 8. 평균복사온도 근사
    # radiation_load가 커질수록 사람이 받는 복사열이 증가하므로 Tmrt가 상승한다.
    tmrt = temperature + (radiation_load * 0.015)

    return RadiationResult(
        direct_radiation=round(direct_radiation, 3),
        diffuse_radiation=round(diffuse_radiation, 3),
        ground_reflection=round(ground_reflection, 3),
        facade_reflection=round(facade_reflection, 3),
        radiation_load=round(radiation_load, 3),
        tmrt=round(tmrt, 3),
        cloud_factor=round(cloud_factor, 3),
        altitude_factor=round(altitude_factor, 3),
    )


def calculate_radiation_from_dict(weather: dict, microclimate: dict) -> dict:
    """
    프로젝트 JSON 구조에서 바로 사용할 수 있는 wrapper.

    weather 예:
    {
        "temperature": 32,
        "solar_radiation": 850,
        "cloud_cover": 0.2,
        "solar_altitude": 65
    }

    microclimate 예:
    {
        "shade_factor": 0.2,
        "sky_view_factor": 0.85,
        "albedo": 0.12,
        "facade_reflectivity": 0.2
    }
    """

    radiation_input = RadiationInput(
        temperature=weather.get("temperature", 25.0),
        solar_radiation=weather.get("solar_radiation", 0.0),
        cloud_cover=weather.get("cloud_cover", 0.0),
        solar_altitude=weather.get("solar_altitude", 45.0),
        shade_factor=microclimate.get("shade_factor", 0.0),
        sky_view_factor=microclimate.get("sky_view_factor", 1.0),
        albedo=microclimate.get("albedo", 0.15),
        facade_reflectivity=microclimate.get("facade_reflectivity", 0.0),
    )

    result = calculate_radiation(radiation_input)
    return asdict(result)


if __name__ == "__main__":
    sample_weather = {
        "temperature": 32.0,
        "solar_radiation": 850.0,
        "cloud_cover": 0.2,
        "solar_altitude": 65.0,
    }

    sample_microclimate = {
        "shade_factor": 0.1,
        "sky_view_factor": 0.85,
        "albedo": 0.12,
        "facade_reflectivity": 0.2,
    }

    result = calculate_radiation_from_dict(sample_weather, sample_microclimate)
    print(result)