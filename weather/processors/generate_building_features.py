# weather/processors/generate_building_features.py
"""
건물(BLD_*) microclimate feature 임의값 생성기.

전략:
1. 건물 archetype (유형별 기본 프로파일) 결정
2. 건물명 키워드 기반 세부 보정
3. zone 별 보정 (공대 고밀도, 외곽 zone 녹지 증가 등)
4. 소량의 무작위 노이즈 (±0.025) 추가 → 너무 균일하지 않게

실행:
    python3 processors/generate_building_features.py          # 실제 저장
    python3 processors/generate_building_features.py --dry-run  # 미리보기만
"""

from __future__ import annotations

import json
import random
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


# =========================================================
# 공통 유틸
# =========================================================

def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return round(max(lo, min(hi, v)), 3)


def contains(text: str, keywords: list[str]) -> bool:
    return any(k in text for k in keywords)


def noise(scale: float = 0.025) -> float:
    return round(random.uniform(-scale, scale), 3)


# =========================================================
# 1. Archetype 기본 프로파일
# =========================================================

ARCHETYPES = {
    "academic": {
        "surface_type": "concrete",
        "albedo": 0.25,
        "surface_emissivity": 0.91,
        "thermal_conductivity": 1.35,
        "volumetric_heat_capacity": 2050000.0,
        "moisture_availability": 0.04,
        "vegetation_ratio": 0.12,
        "shade_factor": 0.28,
        "ventilation_factor": 0.70,
        "building_density": 0.42,
        "facade_reflectivity": 0.22,
        "facade_emissivity": 0.89,
        "heat_storage_factor": 0.8,
        "facade_heat_storage_factor": 0.78,
        "sky_view_factor": 0.65,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "engineering": {
        "surface_type": "concrete",
        "albedo": 0.22,
        "surface_emissivity": 0.91,
        "thermal_conductivity": 1.45,
        "volumetric_heat_capacity": 2150000.0,
        "moisture_availability": 0.03,
        "vegetation_ratio": 0.06,
        "shade_factor": 0.38,
        "ventilation_factor": 0.65,
        "building_density": 0.62,
        "facade_reflectivity": 0.28,
        "facade_emissivity": 0.88,
        "heat_storage_factor": 0.86,
        "facade_heat_storage_factor": 0.84,
        "sky_view_factor": 0.52,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "dormitory": {
        "surface_type": "concrete",
        "albedo": 0.24,
        "surface_emissivity": 0.91,
        "thermal_conductivity": 1.30,
        "volumetric_heat_capacity": 2050000.0,
        "moisture_availability": 0.04,
        "vegetation_ratio": 0.18,
        "shade_factor": 0.32,
        "ventilation_factor": 0.62,
        "building_density": 0.55,
        "facade_reflectivity": 0.20,
        "facade_emissivity": 0.89,
        "heat_storage_factor": 0.8,
        "facade_heat_storage_factor": 0.76,
        "sky_view_factor": 0.58,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "library_memorial": {
        "surface_type": "concrete",
        "albedo": 0.30,
        "surface_emissivity": 0.90,
        "thermal_conductivity": 1.45,
        "volumetric_heat_capacity": 2200000.0,
        "moisture_availability": 0.03,
        "vegetation_ratio": 0.14,
        "shade_factor": 0.22,
        "ventilation_factor": 0.72,
        "building_density": 0.38,
        "facade_reflectivity": 0.28,
        "facade_emissivity": 0.88,
        "heat_storage_factor": 0.82,
        "facade_heat_storage_factor": 0.8,
        "sky_view_factor": 0.68,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "life_science": {
        "surface_type": "concrete",
        "albedo": 0.23,
        "surface_emissivity": 0.92,
        "thermal_conductivity": 1.10,
        "volumetric_heat_capacity": 2100000.0,
        "moisture_availability": 0.10,
        "vegetation_ratio": 0.30,
        "shade_factor": 0.22,
        "ventilation_factor": 0.78,
        "building_density": 0.30,
        "facade_reflectivity": 0.18,
        "facade_emissivity": 0.89,
        "heat_storage_factor": 0.7,
        "facade_heat_storage_factor": 0.68,
        "sky_view_factor": 0.72,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "greenhouse": {
        "surface_type": "glass",
        "albedo": 0.18,
        "surface_emissivity": 0.90,
        "thermal_conductivity": 0.96,
        "volumetric_heat_capacity": 1550000.0,
        "moisture_availability": 0.18,
        "vegetation_ratio": 0.75,
        "shade_factor": 0.40,
        "ventilation_factor": 0.90,
        "building_density": 0.12,
        "facade_reflectivity": 0.30,
        "facade_emissivity": 0.84,
        "heat_storage_factor": 0.52,
        "facade_heat_storage_factor": 0.58,
        "sky_view_factor": 0.78,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "gymnasium": {
        "surface_type": "concrete",
        "albedo": 0.22,
        "surface_emissivity": 0.91,
        "thermal_conductivity": 1.25,
        "volumetric_heat_capacity": 2150000.0,
        "moisture_availability": 0.03,
        "vegetation_ratio": 0.10,
        "shade_factor": 0.15,
        "ventilation_factor": 0.80,
        "building_density": 0.20,
        "facade_reflectivity": 0.18,
        "facade_emissivity": 0.88,
        "heat_storage_factor": 0.78,
        "facade_heat_storage_factor": 0.72,
        "sky_view_factor": 0.80,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "open_facility": {
        "surface_type": "grass",
        "albedo": 0.18,
        "surface_emissivity": 0.97,
        "thermal_conductivity": 0.45,
        "volumetric_heat_capacity": 2600000.0,
        "moisture_availability": 0.72,
        "vegetation_ratio": 0.45,
        "shade_factor": 0.05,
        "ventilation_factor": 0.95,
        "building_density": 0.05,
        "facade_reflectivity": 0.05,
        "facade_emissivity": 0.95,
        "heat_storage_factor": 0.38,
        "facade_heat_storage_factor": 0.42,
        "sky_view_factor": 0.95,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
    "support": {
        "surface_type": "concrete",
        "albedo": 0.22,
        "surface_emissivity": 0.91,
        "thermal_conductivity": 1.20,
        "volumetric_heat_capacity": 2000000.0,
        "moisture_availability": 0.04,
        "vegetation_ratio": 0.10,
        "shade_factor": 0.25,
        "ventilation_factor": 0.70,
        "building_density": 0.40,
        "facade_reflectivity": 0.18,
        "facade_emissivity": 0.88,
        "heat_storage_factor": 0.76,
        "facade_heat_storage_factor": 0.7,
        "sky_view_factor": 0.65,
        "material_source": "estimated_surface_library_v1",
        "assumption_level": "estimated",
    },
}


# =========================================================
# 2. Zone 보정값
# =========================================================

ZONE_ADJ = {
    "zone_A": {"vegetation_ratio": +0.02},
    "zone_B": {"vegetation_ratio": +0.04, "building_density": -0.03, "sky_view_factor": +0.03},
    "zone_C": {"vegetation_ratio": +0.06, "building_density": -0.05, "sky_view_factor": +0.04, "ventilation_factor": +0.03},
    "zone_D": {"building_density": +0.05, "vegetation_ratio": -0.03, "sky_view_factor": -0.04, "ventilation_factor": -0.03},
    "zone_E": {"vegetation_ratio": +0.01, "building_density": +0.02},
    "zone_F": {"vegetation_ratio": +0.05, "building_density": -0.06, "sky_view_factor": +0.05, "ventilation_factor": +0.04},
}


# =========================================================
# 3. Archetype 결정
# =========================================================

def select_archetype(element_id: str, name: str, element_type: str) -> str:
    # 시설(facility)
    if element_type == "facility":
        if contains(name, ["운동장", "테니스장", "광장", "정문", "남문", "북문", "후문"]):
            return "open_facility"
        return "support"

    # 건물(building)
    if contains(name, ["온실"]):
        return "greenhouse"
    if contains(name, ["체육관"]):
        return "gymnasium"
    if contains(name, ["도서관", "기념관", "박물관"]):
        return "library_memorial"

    # 기숙사: "학생생활관" 포함 또는 명시적 목록
    DORMITORY_NAMES = {
        "학생생활관 부속동", "학생생활관 진리관", "학생생활관 창조관",
        "학생생활관 관리동", "학생생활관 향림관", "학생생활관 청운관",
    }
    if contains(name, ["학생생활관", "기숙사"]) or name in DORMITORY_NAMES:
        return "dormitory"

    if contains(name, ["공과대", "공학", "창업보육"]):
        return "engineering"
    if contains(name, ["생명", "농업", "산학", "실습관"]):
        return "life_science"
    if contains(name, ["공급실", "학군단", "인재관", "우정원", "웅지"]):
        return "support"

    return "academic"


# =========================================================
# 4. 건물명 키워드 보정
# =========================================================

def apply_name_overrides(f: dict[str, Any], name: str) -> dict[str, Any]:
    f = dict(f)

    # 유리 커튼월 (국제관, 미래창조, 산학협력, 창업보육)
    if contains(name, ["국제문화", "미래창조", "산학협력", "창업보육"]):
        f["facade_reflectivity"] = clamp(f["facade_reflectivity"] + 0.08)
        f["albedo"] = clamp(f["albedo"] + 0.04)
        f["facade_emissivity"] = clamp(f["facade_emissivity"] - 0.03)

    # 오래된 석재 건물 (대학본부, 박물관)
    if contains(name, ["대학본부", "박물관"]):
        f["albedo"] = clamp(f["albedo"] + 0.05)
        f["facade_reflectivity"] = clamp(f["facade_reflectivity"] - 0.02)
        f["heat_storage_factor"] = clamp(f["heat_storage_factor"] + 0.05)

    # 녹지 특화 (농업, 생명대)
    if contains(name, ["친환경농업", "생명산업"]):
        f["vegetation_ratio"] = clamp(f["vegetation_ratio"] + 0.08)
        f["moisture_availability"] = clamp(f["moisture_availability"] + 0.08)

    # 호관 건물 (1호관, 2호관, 3호관 → 고밀도)
    if contains(name, ["1호관", "2호관", "3호관"]):
        f["sky_view_factor"] = clamp(f["sky_view_factor"] - 0.05)
        f["building_density"] = clamp(f["building_density"] + 0.04)

    # 생활관 관리동/부속동 (밀집)
    if contains(name, ["관리동", "부속동"]):
        f["building_density"] = clamp(f["building_density"] + 0.06)
        f["sky_view_factor"] = clamp(f["sky_view_factor"] - 0.06)

    # 도서관 (독립 건물, 개방적)
    if contains(name, ["도서관"]):
        f["sky_view_factor"] = clamp(f["sky_view_factor"] + 0.05)
        f["building_density"] = clamp(f["building_density"] - 0.05)

    return f


# =========================================================
# 5. 단일 건물 feature 생성
# =========================================================

def generate_building_feature(
    element_id: str,
    name: str,
    zone_id: str,
    element_type: str,
    add_noise: bool = True,
) -> dict[str, Any]:
    arch = select_archetype(element_id, name, element_type)
    f = deepcopy(ARCHETYPES[arch])

    # zone 보정
    for key, delta in ZONE_ADJ.get(zone_id, {}).items():
        if key in f and isinstance(f[key], float):
            f[key] = clamp(float(f[key]) + float(delta))

    # 건물명 보정
    f = apply_name_overrides(f, name)

    # 노이즈
    if add_noise:
        for k in ["vegetation_ratio", "shade_factor", "ventilation_factor",
                  "building_density", "facade_reflectivity", "sky_view_factor",
                  "surface_emissivity", "facade_emissivity", "moisture_availability",
                  "heat_storage_factor", "facade_heat_storage_factor"]:
            if k in f and isinstance(f[k], float):
                f[k] = clamp(f[k] + noise())

    # 최종 반올림
    for k, v in f.items():
        if isinstance(v, float):
            f[k] = round(v, 3)

    return f


# =========================================================
# 6. JSON 업데이트
# =========================================================

def update_features_json(features_path: Path, elements_path: Path, dry_run: bool = False) -> None:
    # 건물 이름 조회
    with open(elements_path, encoding="utf-8") as fp:
        content = fp.read()
    parts = content.strip().split("\n\n")
    common = json.loads(parts[1] if len(parts) > 1 else parts[0])
    name_map = {e["element_id"]: (e["name"], e["element_type"]) for e in common.get("elements", [])}

    with open(features_path, encoding="utf-8") as fp:
        data = json.load(fp)

    updated = 0
    for feat in data["features"]:
        eid = feat["element_id"]
        if not eid.startswith("BLD_"):
            continue
        name, etype = name_map.get(eid, ("", "building"))
        zone_id = feat.get("zone_id", "zone_A")
        generated = generate_building_feature(eid, name, zone_id, etype)
        feat["microclimate"] = generated
        updated += 1

        arch = select_archetype(eid, name, etype)
        if dry_run:
            print(
                f"[{eid:10s}] {name:22s} | {arch:18s} "
                f"| veg={generated['vegetation_ratio']:.2f} "
                f"| density={generated['building_density']:.2f} "
                f"| svf={generated['sky_view_factor']:.2f} "
                f"| albedo={generated['albedo']:.2f}"
            )

    if not dry_run:
        with open(features_path, "w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False, indent=2)

    print(f"\n{'[DRY RUN]' if dry_run else '[저장 완료]'} BLD_* {updated}개 처리 → {features_path.name}")


# =========================================================
# 실행
# =========================================================

if __name__ == "__main__":
    BASE = Path(__file__).resolve().parent.parent
    FEATURES = BASE / "data" / "microclimate_features.json"
    ELEMENTS = BASE.parent / "common" / "data" / "common_elemetns.json"

    is_dry = "--dry-run" in sys.argv

    random.seed(42)

    print("=" * 72)
    print("  건물 microclimate feature 생성기")
    print(f"  mode: {'DRY RUN (저장 안 함)' if is_dry else '실제 저장'}")
    print("=" * 72)

    update_features_json(FEATURES, ELEMENTS, dry_run=is_dry)
