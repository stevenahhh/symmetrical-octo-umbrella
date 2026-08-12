from __future__ import annotations

import math
from pathlib import Path
from typing import Dict, Iterable, Tuple

try:
    from .data_loader import load_json
except ImportError:  # uvicorn main:app from simulation/
    from data_loader import load_json


class CoordinateTransform:
    """Reversible 2D simulation ↔ Three.js X/Z transform."""

    def __init__(
        self,
        origin: Dict[str, float] | None = None,
        scale: float = 1.0,
        rotation_degrees: float = 0.0,
        invert_z: bool = False,
        wgs84_reference: Dict[str, float] | None = None,
        sumo_origin: Dict[str, float] | None = None,
    ) -> None:
        self.origin = {"x": 0.0, "y": 0.0, "z": 0.0, **(origin or {})}
        self.scale = float(scale)
        if not math.isfinite(self.scale) or self.scale == 0:
            raise ValueError("좌표 scale은 0이 아닌 유한값이어야 합니다.")
        self.rotation_degrees = float(rotation_degrees)
        self.invert_z = bool(invert_z)
        self.wgs84_reference = dict(wgs84_reference or {})
        self.sumo_origin = {"x": 0.0, "z": 0.0, **(sumo_origin or {})}

    @classmethod
    def from_file(cls, path: str | Path) -> "CoordinateTransform":
        config = load_json(path)
        return cls(
            origin=config.get("origin"),
            scale=config.get("scale", 1),
            rotation_degrees=config.get("rotation_degrees", 0),
            invert_z=config.get("invert_z", False),
            wgs84_reference=config.get("wgs84_reference"),
            sumo_origin=config.get("sumo_origin"),
        )

    @classmethod
    def fit_similarity(cls, pairs: Iterable[Dict], invert_z: bool = False) -> Tuple["CoordinateTransform", Dict]:
        """Fit simulation→Three.js scale/rotation/translation and report RMSE."""
        values = list(pairs)
        if len(values) < 2:
            raise ValueError("좌표 calibration에는 기준점이 최소 2개 필요합니다.")
        simulation = [(float(item["simulation"][0]), float(item["simulation"][1])) for item in values]
        three = [(float(item["three"][0]), float(item["three"][2])) for item in values]
        if invert_z:
            simulation = [(x, -z) for x, z in simulation]
        sx = sum(x for x, _ in simulation) / len(simulation)
        sz = sum(z for _, z in simulation) / len(simulation)
        tx = sum(x for x, _ in three) / len(three)
        tz = sum(z for _, z in three) / len(three)
        a = sum((x - sx) * (u - tx) + (z - sz) * (v - tz) for (x, z), (u, v) in zip(simulation, three))
        b = sum((x - sx) * (v - tz) - (z - sz) * (u - tx) for (x, z), (u, v) in zip(simulation, three))
        denominator = sum((x - sx) ** 2 + (z - sz) ** 2 for x, z in simulation)
        if denominator <= 1e-12:
            raise ValueError("서로 다른 위치의 calibration 기준점이 필요합니다.")
        real, imag = a / denominator, b / denominator
        scale = math.hypot(real, imag)
        rotation = math.degrees(math.atan2(imag, real))
        angle = math.radians(rotation)
        rx = (sx * math.cos(angle) - sz * math.sin(angle)) * scale
        rz = (sx * math.sin(angle) + sz * math.cos(angle)) * scale
        transform = cls(
            origin={"x": tx - rx, "y": 0.0, "z": tz - rz}, scale=scale,
            rotation_degrees=rotation, invert_z=invert_z,
        )
        residuals = []
        for item in values:
            x, _, z = transform.simulation_to_three(item["simulation"][0], 0, item["simulation"][1])
            expected = item["three"]
            residuals.append(math.hypot(x - float(expected[0]), z - float(expected[2])))
        return transform, {
            "point_count": len(values), "rmse": math.sqrt(sum(value * value for value in residuals) / len(residuals)),
            "max_error": max(residuals), "residuals": residuals,
        }

    def simulation_to_three(self, x: float, y: float = 0.0, z: float = 0.0) -> Tuple[float, float, float]:
        x, y, z = self._finite(x, y, z)
        local_z = -z if self.invert_z else z
        angle = math.radians(self.rotation_degrees)
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        rx = x * cos_a - local_z * sin_a
        rz = x * sin_a + local_z * cos_a
        return (
            rx * self.scale + self.origin["x"],
            y * self.scale + self.origin["y"],
            rz * self.scale + self.origin["z"],
        )

    def three_to_simulation(self, x: float, y: float = 0.0, z: float = 0.0) -> Tuple[float, float, float]:
        x, y, z = self._finite(x, y, z)
        x = (x - self.origin["x"]) / self.scale
        y = (y - self.origin["y"]) / self.scale
        z = (z - self.origin["z"]) / self.scale
        angle = math.radians(-self.rotation_degrees)
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        sx = x * cos_a - z * sin_a
        sz = x * sin_a + z * cos_a
        if self.invert_z:
            sz = -sz
        return sx, y, sz

    def wgs84_to_simulation(self, longitude: float, latitude: float) -> Tuple[float, float]:
        if not {"longitude", "latitude"} <= self.wgs84_reference.keys():
            raise ValueError("wgs84_reference가 설정되지 않았습니다.")
        radius = 6_378_137.0
        reference_lon = float(self.wgs84_reference["longitude"])
        reference_lat = float(self.wgs84_reference["latitude"])
        x = math.radians(float(longitude) - reference_lon) * radius * math.cos(math.radians(reference_lat))
        z = math.radians(float(latitude) - reference_lat) * radius
        return x, z

    def simulation_to_wgs84(self, x: float, z: float) -> Tuple[float, float]:
        if not {"longitude", "latitude"} <= self.wgs84_reference.keys():
            raise ValueError("wgs84_reference가 설정되지 않았습니다.")
        radius = 6_378_137.0
        reference_lon = float(self.wgs84_reference["longitude"])
        reference_lat = float(self.wgs84_reference["latitude"])
        longitude = reference_lon + math.degrees(float(x) / (radius * math.cos(math.radians(reference_lat))))
        latitude = reference_lat + math.degrees(float(z) / radius)
        return longitude, latitude

    def sumo_to_simulation(self, x: float, z: float) -> Tuple[float, float]:
        return float(x) + self.sumo_origin["x"], float(z) + self.sumo_origin["z"]

    def simulation_to_sumo(self, x: float, z: float) -> Tuple[float, float]:
        return float(x) - self.sumo_origin["x"], float(z) - self.sumo_origin["z"]

    def as_dict(self) -> Dict:
        return {
            "origin": dict(self.origin), "scale": self.scale,
            "rotation_degrees": self.rotation_degrees, "invert_z": self.invert_z,
            "wgs84_reference": dict(self.wgs84_reference), "sumo_origin": dict(self.sumo_origin),
        }

    @staticmethod
    def _finite(*values: float) -> Tuple[float, ...]:
        converted = tuple(float(v) for v in values)
        if not all(math.isfinite(v) for v in converted):
            raise ValueError("NaN 또는 무한 좌표는 변환할 수 없습니다.")
        return converted
