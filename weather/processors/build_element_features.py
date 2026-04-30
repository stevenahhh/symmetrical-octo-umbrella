from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import List, Dict, Any
import json


# =========================
# 1. DATA MODEL
# =========================

@dataclass
class RawElement:
    element_id: str
    name: str
    description: str


@dataclass
class ElementFeature:
    element_id: str
    name: str
    element_type: str   # road / crosswalk / intersection

    surface_type: str   # asphalt / concrete / mixed
    albedo: float
    surface_emissivity: float
    thermal_conductivity: float
    volumetric_heat_capacity: float
    moisture_availability: float

    vegetation_ratio: float
    shade_factor: float
    ventilation_factor: float
    building_density: float

    facade_reflectivity: float
    facade_emissivity: float
    heat_storage_factor: float
    facade_heat_storage_factor: float
    sky_view_factor: float
    material_source: str
    assumption_level: str


# =========================
# 2. BASE TYPE RULES
# =========================

BASE_FEATURES: Dict[str, Dict[str, Any]] = {
    "road": {
        "surface_type": "asphalt",
        "albedo": 0.12,
        "surface_emissivity": 0.94,
        "thermal_conductivity": 0.75,
        "volumetric_heat_capacity": 1950000.0,
        "moisture_availability": 0.02,
        "vegetation_ratio": 0.05,
        "shade_factor": 0.15,
        "ventilation_factor": 0.75,
        "building_density": 0.30,
        "facade_reflectivity": 0.20,
        "facade_emissivity": 0.91,
        "heat_storage_factor": 0.88,
        "facade_heat_storage_factor": 0.82,
        "sky_view_factor": 0.75,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "crosswalk": {
        "surface_type": "concrete",
        "albedo": 0.30,
        "surface_emissivity": 0.91,
        "thermal_conductivity": 1.35,
        "volumetric_heat_capacity": 2050000.0,
        "moisture_availability": 0.04,
        "vegetation_ratio": 0.08,
        "shade_factor": 0.20,
        "ventilation_factor": 0.70,
        "building_density": 0.35,
        "facade_reflectivity": 0.20,
        "facade_emissivity": 0.89,
        "heat_storage_factor": 0.72,
        "facade_heat_storage_factor": 0.7,
        "sky_view_factor": 0.70,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "intersection": {
        "surface_type": "asphalt",
        "albedo": 0.12,
        "surface_emissivity": 0.94,
        "thermal_conductivity": 0.75,
        "volumetric_heat_capacity": 1950000.0,
        "moisture_availability": 0.02,
        "vegetation_ratio": 0.03,
        "shade_factor": 0.10,
        "ventilation_factor": 0.85,
        "building_density": 0.25,
        "facade_reflectivity": 0.15,
        "facade_emissivity": 0.9,
        "heat_storage_factor": 0.84,
        "facade_heat_storage_factor": 0.78,
        "sky_view_factor": 0.85,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
}


# =========================
# 3. PREFIX → TYPE
# =========================

def infer_element_type(element_id: str) -> str:
    if element_id.startswith("RD_"):
        return "road"
    if element_id.startswith("CW_"):
        return "crosswalk"
    if element_id.startswith("ND_"):
        return "intersection"
    raise ValueError(f"Unknown element id prefix: {element_id}")


# =========================
# 4. TEXT RULE HELPERS
# =========================

def _contains_any(text: str, keywords: List[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    return max(min_value, min(max_value, round(value, 3)))


# =========================
# 5. FEATURE ADJUSTMENT RULES
# =========================

def apply_text_rules(base: Dict[str, Any], name: str, description: str) -> Dict[str, Any]:
    """
    이름/설명 키워드로 feature를 조정한다.
    규칙은 해석 가능하고, 나중에 수동 보정 가능하게 단순하고 일관되게 유지.
    """
    f = dict(base)
    text = f"{name} {description}"

    # -------------------------
    # 5-1. 도로 규모 / 개방감
    # -------------------------
    if _contains_any(text, ["대로", "메인", "중심", "관통"]):
        f["ventilation_factor"] += 0.10
        f["sky_view_factor"] += 0.08
        f["building_density"] -= 0.05
        f["shade_factor"] -= 0.05

    if _contains_any(text, ["샛길", "좁은 길", "측면", "후면"]):
        f["ventilation_factor"] -= 0.15
        f["sky_view_factor"] -= 0.12
        f["building_density"] += 0.10
        f["shade_factor"] += 0.12

    if _contains_any(text, ["초입", "진입", "입구"]):
        f["ventilation_factor"] += 0.03
        f["sky_view_factor"] += 0.03

    # -------------------------
    # 5-2. 건물 전면 / 후면 / 측면
    # -------------------------
    if _contains_any(text, ["정면", "전면", "앞길", "앞보도"]):
        f["building_density"] += 0.08
        f["facade_reflectivity"] += 0.08
        f["shade_factor"] += 0.05

    if _contains_any(text, ["후면", "뒷길", "뒷보도"]):
        f["building_density"] += 0.12
        f["shade_factor"] += 0.12
        f["sky_view_factor"] -= 0.10
        f["ventilation_factor"] -= 0.08

    if _contains_any(text, ["동측", "서측", "남측", "북측"]):
        f["building_density"] += 0.05
        f["shade_factor"] += 0.05

    # -------------------------
    # 5-3. 보행 / 횡단 / 교차 특성
    # -------------------------
    if _contains_any(text, ["횡단보도", "보도"]):
        f["surface_type"] = "concrete"
        f["albedo"] = 0.30
        f["surface_emissivity"] = 0.91
        f["thermal_conductivity"] = 1.35
        f["volumetric_heat_capacity"] = 2050000.0
        f["moisture_availability"] = max(f["moisture_availability"], 0.04)
        f["vegetation_ratio"] += 0.03

    if _contains_any(text, ["교차로", "사거리", "삼거리", "교차점"]):
        f["ventilation_factor"] += 0.08
        f["sky_view_factor"] += 0.10
        f["shade_factor"] -= 0.05

    # -------------------------
    # 5-4. 건물군 주변 특성
    # -------------------------
    if _contains_any(text, ["공대", "사범대", "도서관", "학생회관", "대학본부", "기념관", "박물관"]):
        f["building_density"] += 0.06
        f["facade_reflectivity"] += 0.04

    # -------------------------
    # 5-5. 운동장 / 광장 / 주차장 주변
    # -------------------------
    if _contains_any(text, ["대운동장", "구령대", "광장"]):
        f["sky_view_factor"] += 0.10
        f["ventilation_factor"] += 0.05
        f["shade_factor"] -= 0.05

    if _contains_any(text, ["주차장"]):
        f["surface_type"] = "asphalt"
        f["albedo"] = 0.12
        f["surface_emissivity"] = 0.94
        f["thermal_conductivity"] = 0.75
        f["volumetric_heat_capacity"] = 1950000.0
        f["vegetation_ratio"] -= 0.03
        f["shade_factor"] -= 0.03
        f["sky_view_factor"] += 0.05

    # -------------------------
    # 5-6. 녹지 / 외곽 / 후문
    # -------------------------
    if _contains_any(text, ["외곽", "후문", "생명대", "농업센터"]):
        f["vegetation_ratio"] += 0.10
        f["shade_factor"] += 0.05
        f["building_density"] -= 0.05
        f["moisture_availability"] += 0.08

    # -------------------------
    # 5-7. 값 정리
    # -------------------------
    f["albedo"] = round(f["albedo"], 3)
    f["vegetation_ratio"] = clamp(f["vegetation_ratio"])
    f["shade_factor"] = clamp(f["shade_factor"])
    f["ventilation_factor"] = clamp(f["ventilation_factor"])
    f["building_density"] = clamp(f["building_density"])
    f["facade_reflectivity"] = clamp(f["facade_reflectivity"])
    f["facade_emissivity"] = clamp(f["facade_emissivity"])
    f["heat_storage_factor"] = clamp(f["heat_storage_factor"])
    f["facade_heat_storage_factor"] = clamp(f["facade_heat_storage_factor"])
    f["sky_view_factor"] = clamp(f["sky_view_factor"])
    f["moisture_availability"] = clamp(f["moisture_availability"])

    return f


# =========================
# 6. MAIN CONVERTER
# =========================

def build_element_feature(raw: RawElement) -> ElementFeature:
    element_type = infer_element_type(raw.element_id)
    base = BASE_FEATURES[element_type]
    adjusted = apply_text_rules(base, raw.name, raw.description)

    return ElementFeature(
        element_id=raw.element_id,
        name=raw.name,
        element_type=element_type,
        surface_type=adjusted["surface_type"],
        albedo=adjusted["albedo"],
        surface_emissivity=adjusted["surface_emissivity"],
        thermal_conductivity=adjusted["thermal_conductivity"],
        volumetric_heat_capacity=adjusted["volumetric_heat_capacity"],
        moisture_availability=adjusted["moisture_availability"],
        vegetation_ratio=adjusted["vegetation_ratio"],
        shade_factor=adjusted["shade_factor"],
        ventilation_factor=adjusted["ventilation_factor"],
        building_density=adjusted["building_density"],
        facade_reflectivity=adjusted["facade_reflectivity"],
        facade_emissivity=adjusted["facade_emissivity"],
        heat_storage_factor=adjusted["heat_storage_factor"],
        facade_heat_storage_factor=adjusted["facade_heat_storage_factor"],
        sky_view_factor=adjusted["sky_view_factor"],
        material_source=adjusted["material_source"],
        assumption_level=adjusted["assumption_level"],
    )


def build_element_features(raw_elements: List[RawElement]) -> List[ElementFeature]:
    return [build_element_feature(item) for item in raw_elements]


# =========================
# 7. EXPORT
# =========================

def export_to_json(features: List[ElementFeature], output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump([asdict(item) for item in features], f, ensure_ascii=False, indent=2)


# =========================
# 8. EXAMPLE RUN
# =========================

if __name__ == "__main__":
    raw_elements = [
        RawElement("RD_011", "중앙로", "캠퍼스 외곽 메인 중앙로"),
        RawElement("RD_012", "기념관앞길", "70주년기념관 정면"),
        RawElement("CW_005", "기념관앞보도", "70주년기념관 정문 앞 보도"),
        RawElement("ND_006", "중앙교차로", "캠퍼스 중심부 메인 교차로"),
        RawElement("RD_078", "사범대샛길", "사범대와 도서관 사이 좁은 길"),
    ]

    features = build_element_features(raw_elements)

    for item in features:
        print(asdict(item))

    export_to_json(features, "element_features.sample.json")
