# weather/processors/radiation.py

from __future__ import annotations

import math
from typing import Dict, Any


def clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    return max(min_value, min(value, max_value))


def estimate_radiation(
    temperature: float,
    solar_radiation: float,
    cloud_cover: float,
    solar_altitude: float,
    shade_factor: float,
    sky_view_factor: float,
    albedo: float,
    facade_reflectivity: float,
) -> Dict[str, Any]:
    """
    Estimate pedestrian-level radiation load and mean radiant temperature.

    Parameters
    ----------
    temperature:
        Air temperature in Celsius.
    solar_radiation:
        Global solar radiation in W/m².
    cloud_cover:
        Cloud cover ratio, 0~1.
    solar_altitude:
        Solar altitude angle in degrees.
    shade_factor:
        Shading ratio, 0~1.
    sky_view_factor:
        Sky view factor, 0~1.
    albedo:
        Ground surface reflectance, 0~1.
    facade_reflectivity:
        Building facade reflectance, 0~1.

    Returns
    -------
    dict:
        Radiation components and estimated Tmrt.
    """

    cloud_cover = clamp(cloud_cover)
    shade_factor = clamp(shade_factor)
    sky_view_factor = clamp(sky_view_factor)
    albedo = clamp(albedo)
    facade_reflectivity = clamp(facade_reflectivity)

    solar_radiation = max(0.0, solar_radiation)

    # 1. Cloud correction
    cloud_factor = 1.0 - 0.65 * cloud_cover
    effective_solar = solar_radiation * cloud_factor

    # 2. Solar altitude correction
    altitude_rad = math.radians(max(0.0, solar_altitude))
    altitude_factor = math.sin(altitude_rad)

    altitude_adjusted_solar = effective_solar * altitude_factor

    # 3. Direct solar radiation after shade
    direct_radiation = altitude_adjusted_solar * (1.0 - shade_factor)

    # 4. Diffuse sky radiation
    diffuse_radiation = effective_solar * 0.2 * sky_view_factor

    # 5. Ground reflected radiation
    reflected_radiation = effective_solar * albedo * 0.3

    # 6. Facade reflected radiation
    facade_radiation = (
        effective_solar
        * facade_reflectivity
        * (1.0 - sky_view_factor)
        * 0.25
    )

    # 7. Total radiation load
    radiation_load = (
        direct_radiation
        + diffuse_radiation
        + reflected_radiation
        + facade_radiation
    )

    # 8. Approximate mean radiant temperature
    tmrt = temperature + radiation_load * 0.015

    return {
        "direct_radiation": round(direct_radiation, 3),
        "diffuse_radiation": round(diffuse_radiation, 3),
        "reflected_radiation": round(reflected_radiation, 3),
        "facade_radiation": round(facade_radiation, 3),
        "radiation_load": round(radiation_load, 3),
        "tmrt": round(tmrt, 3),
        "debug": {
            "cloud_factor": round(cloud_factor, 3),
            "altitude_factor": round(altitude_factor, 3),
            "effective_solar": round(effective_solar, 3),
        },
    }