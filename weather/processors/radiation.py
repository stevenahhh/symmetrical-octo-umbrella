from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from typing import Any

from processors.materials import resolve_material_properties


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
    humidity: float = 50.0

    shade_factor: float = 0.0
    sky_view_factor: float = 1.0
    albedo: float = 0.15
    facade_reflectivity: float = 0.0
    surface_emissivity: float = 0.92
    thermal_conductivity: float = 1.0
    volumetric_heat_capacity: float = 2000000.0
    moisture_availability: float = 0.1
    facade_emissivity: float = 0.9
    heat_storage_factor: float = 0.7
    facade_heat_storage_factor: float = 0.65
    solar_absorptivity: float = 0.85
    material_source: str = "estimated_surface_library_v1"
    assumption_level: str = "estimated"
    surface_type: str = "concrete"


@dataclass
class RadiationResult:
    direct_radiation: float
    diffuse_radiation: float
    ground_reflection: float
    facade_reflection: float
    longwave_sky: float
    longwave_ground: float
    longwave_facade: float
    net_longwave_exchange: float
    absorbed_shortwave: float
    absorbed_longwave: float
    net_radiation_balance: float
    surface_temperature: float
    facade_temperature: float
    material_heat_storage: float
    evaporative_cooling_offset: float
    radiation_load: float
    tmrt: float

    cloud_factor: float
    altitude_factor: float
    sky_temperature: float
    material_source: str
    assumption_level: str


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

    sigma = 5.670374419e-8

    solar_radiation = max(0.0, float(data.solar_radiation))
    cloud_cover = clamp(data.cloud_cover, 0.0, 1.0, 0.0)
    solar_altitude = clamp(data.solar_altitude, 0.0, 90.0, 45.0)
    humidity = clamp(data.humidity, 0.0, 100.0, 50.0)

    shade_factor = clamp(data.shade_factor, 0.0, 1.0, 0.0)
    sky_view_factor = clamp(data.sky_view_factor, 0.0, 1.0, 1.0)

    material = resolve_material_properties(
        {
            "surface_type": data.surface_type,
            "albedo": data.albedo,
            "surface_emissivity": data.surface_emissivity,
            "thermal_conductivity": data.thermal_conductivity,
            "volumetric_heat_capacity": data.volumetric_heat_capacity,
            "moisture_availability": data.moisture_availability,
            "facade_emissivity": data.facade_emissivity,
            "heat_storage_factor": data.heat_storage_factor,
            "facade_heat_storage_factor": data.facade_heat_storage_factor,
            "solar_absorptivity": data.solar_absorptivity,
            "material_source": data.material_source,
            "assumption_level": data.assumption_level,
            "facade_reflectivity": data.facade_reflectivity,
        }
    )
    albedo = clamp(material.get("albedo"), 0.0, 1.0, 0.15)
    facade_reflectivity = clamp(data.facade_reflectivity, 0.0, 1.0, 0.0)
    surface_emissivity = clamp(material.get("surface_emissivity"), 0.6, 1.0, 0.92)
    thermal_conductivity = max(0.05, float(material.get("thermal_conductivity", 1.0)))
    volumetric_heat_capacity = max(100000.0, float(material.get("volumetric_heat_capacity", 2000000.0)))
    moisture_availability = clamp(material.get("moisture_availability"), 0.0, 1.0, 0.1)
    facade_emissivity = clamp(material.get("facade_emissivity"), 0.6, 1.0, 0.9)
    heat_storage_factor = clamp(material.get("heat_storage_factor"), 0.1, 1.0, 0.7)
    facade_heat_storage_factor = clamp(material.get("facade_heat_storage_factor"), 0.1, 1.0, 0.65)
    solar_absorptivity = clamp(material.get("solar_absorptivity"), 0.0, 1.0, 1.0 - albedo)

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

    humidity_factor = humidity / 100.0
    sky_emissivity = clamp(0.72 + 0.18 * humidity_factor + 0.08 * cloud_cover, 0.65, 1.0, 0.85)
    sky_temperature = temperature - (8.0 * (1.0 - cloud_cover)) - (2.0 * (1.0 - humidity_factor))

    absorbed_shortwave = (
        direct_radiation
        + diffuse_radiation
        + ground_reflection
        + facade_reflection
    ) * solar_absorptivity

    radiative_exposure = 0.35 + (0.65 * sky_view_factor)
    storage_modifier = 0.4 + (0.6 * heat_storage_factor)
    conduction_modifier = min(1.2, 0.55 + (thermal_conductivity / 4.0))
    capacity_modifier = min(1.2, 0.6 + (volumetric_heat_capacity / 3_000_000.0))
    evaporative_cooling_offset = absorbed_shortwave * moisture_availability * 0.14
    material_heat_storage = (
        absorbed_shortwave
        * storage_modifier
        * conduction_modifier
        * capacity_modifier
        * (1.0 - 0.55 * moisture_availability)
    )

    surface_radiative_gain = material_heat_storage * (0.30 + 0.35 * radiative_exposure)
    surface_temperature = temperature + (surface_radiative_gain / 35.0) - (evaporative_cooling_offset / 18.0)

    facade_radiative_gain = (
        (direct_radiation * 0.18) + facade_reflection + (material_heat_storage * 0.08)
    ) * facade_heat_storage_factor
    facade_temperature = temperature + (facade_radiative_gain / 28.0)

    longwave_sky = sky_view_factor * sky_emissivity * sigma * ((sky_temperature + 273.15) ** 4)
    longwave_ground = (1.0 - sky_view_factor * 0.45) * surface_emissivity * sigma * ((surface_temperature + 273.15) ** 4)
    longwave_facade = (1.0 - sky_view_factor) * facade_emissivity * sigma * ((facade_temperature + 273.15) ** 4)

    absorbed_longwave = (longwave_sky * 0.70) + (longwave_ground * 0.22) + (longwave_facade * 0.30)
    emitted_longwave = surface_emissivity * sigma * ((temperature + 273.15) ** 4)
    net_longwave_exchange = absorbed_longwave - emitted_longwave

    net_radiation_balance = absorbed_shortwave + net_longwave_exchange

    # 7. 총 복사 부하
    radiation_load = (
        direct_radiation
        + diffuse_radiation
        + ground_reflection
        + facade_reflection
        + max(0.0, net_longwave_exchange * 0.12)
    )

    # 8. 평균복사온도 근사
    # 흡수 복사 플럭스 기반 등가 평균복사온도 근사.
    person_absorptivity = 0.95
    baseline_longwave = sigma * ((temperature + 273.15) ** 4)
    mrt_flux = baseline_longwave + max(-120.0, net_radiation_balance) / max(0.35, person_absorptivity)
    mrt_flux = max(1.0, mrt_flux)
    tmrt = (mrt_flux / sigma) ** 0.25 - 273.15

    return RadiationResult(
        direct_radiation=round(direct_radiation, 3),
        diffuse_radiation=round(diffuse_radiation, 3),
        ground_reflection=round(ground_reflection, 3),
        facade_reflection=round(facade_reflection, 3),
        longwave_sky=round(longwave_sky, 3),
        longwave_ground=round(longwave_ground, 3),
        longwave_facade=round(longwave_facade, 3),
        net_longwave_exchange=round(net_longwave_exchange, 3),
        absorbed_shortwave=round(absorbed_shortwave, 3),
        absorbed_longwave=round(absorbed_longwave, 3),
        net_radiation_balance=round(net_radiation_balance, 3),
        surface_temperature=round(surface_temperature, 3),
        facade_temperature=round(facade_temperature, 3),
        material_heat_storage=round(material_heat_storage, 3),
        evaporative_cooling_offset=round(evaporative_cooling_offset, 3),
        radiation_load=round(radiation_load, 3),
        tmrt=round(tmrt, 3),
        cloud_factor=round(cloud_factor, 3),
        altitude_factor=round(altitude_factor, 3),
        sky_temperature=round(sky_temperature, 3),
        material_source=str(material.get("material_source", "estimated_surface_library_v1")),
        assumption_level=str(material.get("assumption_level", "estimated")),
    )


def calculate_radiation_from_dict(weather: dict[str, Any], microclimate: dict[str, Any]) -> dict[str, Any]:
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

    precipitation_type_raw = weather.get("precipitation_type", 0)
    try:
        precipitation_type = int(float(precipitation_type_raw))
    except (TypeError, ValueError):
        precipitation_type = 0

    base_moisture = float(microclimate.get("moisture_availability", 0.1))
    wet_surface_boost = 0.18 if precipitation_type != 0 else 0.0

    albedo = microclimate.get("albedo")
    if albedo is None:
        albedo = 0.15

    radiation_input = RadiationInput(
        temperature=weather.get("temperature", 25.0),
        solar_radiation=weather.get("solar_radiation", 0.0),
        cloud_cover=weather.get("cloud_cover", 0.0),
        solar_altitude=weather.get("solar_altitude", 45.0),
        humidity=weather.get("humidity", 50.0),
        shade_factor=microclimate.get("shade_factor", 0.0),
        sky_view_factor=microclimate.get("sky_view_factor", 1.0),
        albedo=albedo,
        facade_reflectivity=microclimate.get("facade_reflectivity", 0.0),
        surface_emissivity=microclimate.get("surface_emissivity", microclimate.get("emissivity", 0.92)),
        thermal_conductivity=microclimate.get("thermal_conductivity", 1.0),
        volumetric_heat_capacity=microclimate.get("volumetric_heat_capacity", 2000000.0),
        moisture_availability=min(1.0, max(0.0, base_moisture + wet_surface_boost)),
        facade_emissivity=microclimate.get("facade_emissivity", 0.9),
        heat_storage_factor=microclimate.get("heat_storage_factor", 0.7),
        facade_heat_storage_factor=microclimate.get("facade_heat_storage_factor", 0.65),
        solar_absorptivity=microclimate.get("solar_absorptivity", 1.0 - albedo),
        material_source=microclimate.get("material_source", "estimated_surface_library_v1"),
        assumption_level=microclimate.get("assumption_level", "estimated"),
        surface_type=microclimate.get("surface_type", "concrete"),
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
