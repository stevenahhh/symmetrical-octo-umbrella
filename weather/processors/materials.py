from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


def _clamp(value: float | None, minimum: float, maximum: float, default: float) -> float:
    if value is None:
        return default

    try:
        value = float(value)
    except (TypeError, ValueError):
        return default

    return max(minimum, min(maximum, value))


def _positive(value: float | None, default: float) -> float:
    if value is None:
        return default

    try:
        value = float(value)
    except (TypeError, ValueError):
        return default

    return value if value > 0 else default


@dataclass(frozen=True)
class MaterialProfile:
    surface_type: str
    albedo: float
    surface_emissivity: float
    thermal_conductivity: float
    volumetric_heat_capacity: float
    moisture_availability: float
    facade_emissivity: float
    facade_heat_storage_factor: float
    heat_storage_factor: float


DEFAULT_MATERIALS: dict[str, MaterialProfile] = {
    "asphalt": MaterialProfile(
        surface_type="asphalt",
        albedo=0.12,
        surface_emissivity=0.94,
        thermal_conductivity=0.75,
        volumetric_heat_capacity=1_950_000.0,
        moisture_availability=0.02,
        facade_emissivity=0.91,
        facade_heat_storage_factor=0.82,
        heat_storage_factor=0.88,
    ),
    "concrete": MaterialProfile(
        surface_type="concrete",
        albedo=0.26,
        surface_emissivity=0.91,
        thermal_conductivity=1.35,
        volumetric_heat_capacity=2_050_000.0,
        moisture_availability=0.04,
        facade_emissivity=0.89,
        facade_heat_storage_factor=0.78,
        heat_storage_factor=0.80,
    ),
    "grass": MaterialProfile(
        surface_type="grass",
        albedo=0.20,
        surface_emissivity=0.97,
        thermal_conductivity=0.45,
        volumetric_heat_capacity=2_600_000.0,
        moisture_availability=0.72,
        facade_emissivity=0.95,
        facade_heat_storage_factor=0.42,
        heat_storage_factor=0.38,
    ),
    "soil": MaterialProfile(
        surface_type="soil",
        albedo=0.17,
        surface_emissivity=0.95,
        thermal_conductivity=0.60,
        volumetric_heat_capacity=1_850_000.0,
        moisture_availability=0.30,
        facade_emissivity=0.92,
        facade_heat_storage_factor=0.55,
        heat_storage_factor=0.56,
    ),
    "glass": MaterialProfile(
        surface_type="glass",
        albedo=0.18,
        surface_emissivity=0.90,
        thermal_conductivity=0.96,
        volumetric_heat_capacity=1_550_000.0,
        moisture_availability=0.01,
        facade_emissivity=0.84,
        facade_heat_storage_factor=0.58,
        heat_storage_factor=0.52,
    ),
    "paver": MaterialProfile(
        surface_type="paver",
        albedo=0.28,
        surface_emissivity=0.92,
        thermal_conductivity=1.10,
        volumetric_heat_capacity=1_900_000.0,
        moisture_availability=0.06,
        facade_emissivity=0.88,
        facade_heat_storage_factor=0.66,
        heat_storage_factor=0.68,
    ),
    "metal": MaterialProfile(
        surface_type="metal",
        albedo=0.35,
        surface_emissivity=0.78,
        thermal_conductivity=45.0,
        volumetric_heat_capacity=3_500_000.0,
        moisture_availability=0.0,
        facade_emissivity=0.72,
        facade_heat_storage_factor=0.72,
        heat_storage_factor=0.74,
    ),
}


def resolve_material_properties(microclimate: dict[str, Any]) -> dict[str, Any]:
    surface_type = str(microclimate.get("surface_type", "concrete") or "concrete").lower()
    base = DEFAULT_MATERIALS.get(surface_type, DEFAULT_MATERIALS["concrete"])

    albedo = _clamp(microclimate.get("albedo"), 0.0, 1.0, base.albedo)
    surface_emissivity = _clamp(
        microclimate.get("surface_emissivity", microclimate.get("emissivity")),
        0.6,
        1.0,
        base.surface_emissivity,
    )
    thermal_conductivity = _positive(
        microclimate.get("thermal_conductivity"),
        base.thermal_conductivity,
    )
    volumetric_heat_capacity = _positive(
        microclimate.get("volumetric_heat_capacity"),
        base.volumetric_heat_capacity,
    )
    moisture_availability = _clamp(
        microclimate.get("moisture_availability"),
        0.0,
        1.0,
        base.moisture_availability,
    )
    facade_emissivity = _clamp(
        microclimate.get("facade_emissivity"),
        0.6,
        1.0,
        base.facade_emissivity,
    )
    facade_heat_storage_factor = _clamp(
        microclimate.get("facade_heat_storage_factor"),
        0.1,
        1.0,
        base.facade_heat_storage_factor,
    )
    heat_storage_factor = _clamp(
        microclimate.get("heat_storage_factor"),
        0.1,
        1.0,
        base.heat_storage_factor,
    )

    solar_absorptivity = _clamp(
        microclimate.get("solar_absorptivity"),
        0.0,
        1.0,
        1.0 - albedo,
    )

    result = asdict(base)
    result.update(
        {
            "surface_type": surface_type,
            "albedo": round(albedo, 3),
            "surface_emissivity": round(surface_emissivity, 3),
            "thermal_conductivity": round(thermal_conductivity, 3),
            "volumetric_heat_capacity": round(volumetric_heat_capacity, 3),
            "moisture_availability": round(moisture_availability, 3),
            "facade_emissivity": round(facade_emissivity, 3),
            "facade_heat_storage_factor": round(facade_heat_storage_factor, 3),
            "heat_storage_factor": round(heat_storage_factor, 3),
            "solar_absorptivity": round(solar_absorptivity, 3),
            "material_source": microclimate.get(
                "material_source",
                "estimated_surface_library_v1",
            ),
            "assumption_level": microclimate.get(
                "assumption_level",
                "estimated",
            ),
        }
    )
    return result
