# weather/processors/pipeline.py
"""
미기후 분석 전체 파이프라인.

흐름:
    WeatherInput (기상 데이터)
        +
    ElementFeature (공간 특성 JSON)
        ↓
    microclimate.calculate_microclimate_for_element()
        → local_temp, local_wind_speed, radiation_load, tmrt
        ↓
    thermal_index.calculate_thermal_index_from_microclimate()
        → feels_like, UTCI, WBGT, risk_level, reasons
        ↓
    ElementResult (최종 element 단위 결과)

사용 예:
    from processors.pipeline import run_pipeline_for_element, run_pipeline_all

    result = run_pipeline_for_element(weather, element_feature)
    results = run_pipeline_all(weather, element_features)
"""

from __future__ import annotations

from typing import Any, Dict, List

from processors.microclimate import calculate_microclimate_for_element
from processors.thermal_index import calculate_thermal_index_from_microclimate


RISK_ORDER = {"낮음": 0, "주의": 1, "높음": 2, "매우 높음": 3, "위험": 4}


def risk_level_to_score(risk_level: str) -> int:
    return RISK_ORDER.get(risk_level, 0)


# =========================================================
# 단일 element 파이프라인
# =========================================================

def run_pipeline_for_element(
    weather: Dict[str, Any],
    element_feature: Dict[str, Any],
    include_detail: bool = False,
) -> Dict[str, Any]:
    """
    하나의 element에 대해 미기후 계산 → 체감 지표 계산 순서로 실행.

    Parameters
    ----------
    weather         : 정규화된 기상 데이터 dict
                      필수 키: temperature, humidity, wind_speed, wind_direction,
                               solar_radiation, cloud_cover, solar_altitude
    element_feature : microclimate_features.json 의 element 하나
                      필수 키: element_id, microclimate (dict)
    include_detail  : True이면 microclimate 세부 계산값도 포함

    Returns
    -------
    {
        element_id      : str,
        zone_id         : str | None,

        # 미기후 결과
        local_temp      : float,
        local_wind_speed: float,
        radiation_load  : float,
        tmrt            : float,

        # 체감 지표
        feels_like      : float,
        utci            : float,
        wbgt            : float,
        risk_level      : str,
        stress_category : str,
        reasons         : list[str],

        # (선택) 세부 계산값
        microclimate_detail : dict  (include_detail=True 일 때만)
    }
    """
    # 1. 미기후 계산
    micro_result = calculate_microclimate_for_element(weather, element_feature)

    # 2. 체감 지표 계산
    thermal_result = calculate_thermal_index_from_microclimate(micro_result, weather)

    # 3. 결합
    output: Dict[str, Any] = {
        "element_id":       micro_result["element_id"],
        "zone_id":          element_feature.get("zone_id"),

        # 미기후 핵심값
        "local_temp":       micro_result["local_temp"],
        "local_wind_speed": micro_result["local_wind_speed"],
        "radiation_load":   micro_result["radiation_load"],
        "tmrt":             micro_result["tmrt"],

        # 체감 지표
        "feels_like":       thermal_result["feels_like"],
        "utci":             thermal_result["utci"],
        "wbgt":             thermal_result["wbgt"],
        "risk_level":       thermal_result["risk_level"],
        "stress_category":  thermal_result["stress_category"],
        "reasons":          thermal_result["reasons"],
    }

    if include_detail:
        output["microclimate_detail"] = {
            "surface_heat_effect":       micro_result.get("surface_heat_effect"),
            "vegetation_cooling_effect": micro_result.get("vegetation_cooling_effect"),
            "wind_cooling_effect":       micro_result.get("wind_cooling_effect"),
            "material_heat_retention":   micro_result.get("material_heat_retention"),
            "evaporative_cooling_effect": micro_result.get("evaporative_cooling_effect"),
            "material_detail":           micro_result.get("material_detail"),
            "radiation_detail":          micro_result.get("radiation_detail"),
            "wind_detail":               micro_result.get("wind_detail"),
        }

    return output


# =========================================================
# 전체 element 파이프라인
# =========================================================

def run_pipeline_all(
    weather: Dict[str, Any],
    element_features: List[Dict[str, Any]],
    include_detail: bool = False,
) -> List[Dict[str, Any]]:
    """
    모든 element에 대해 파이프라인을 실행하고 결과 리스트 반환.

    Parameters
    ----------
    weather          : 기상 데이터 dict
    element_features : element feature dict 리스트
    include_detail   : 세부 계산값 포함 여부

    Returns
    -------
    element 결과 dict 리스트
    """
    return [
        run_pipeline_for_element(weather, feature, include_detail)
        for feature in element_features
    ]


# =========================================================
# zone 집계 (heatmap용)
# =========================================================

def aggregate_by_zone(
    element_results: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """
    element 결과를 zone 단위로 집계 (평균값 + 최악 risk).

    Returns
    -------
    {
        zone_id: {
            zone_id        : str,
            element_count  : int,
            avg_local_temp : float,
            avg_utci       : float,
            avg_wbgt       : float,
            max_risk_level : str,
            elements       : [element_id, ...]
        },
        ...
    }
    """
    zones: Dict[str, Any] = {}

    for elem in element_results:
        zid = elem.get("zone_id") or "unknown"

        if zid not in zones:
            zones[zid] = {
                "zone_id":        zid,
                "element_count":  0,
                "_sum_temp":      0.0,
                "_sum_utci":      0.0,
                "_sum_wbgt":      0.0,
                "_max_risk_ord":  0,
                "max_risk_level": "낮음",
                "elements":       [],
            }

        z = zones[zid]
        z["element_count"]  += 1
        z["_sum_temp"]      += elem["local_temp"]
        z["_sum_utci"]      += elem["utci"]
        z["_sum_wbgt"]      += elem["wbgt"]
        z["elements"].append(elem["element_id"])

        risk_ord = risk_level_to_score(elem["risk_level"])
        if risk_ord > z["_max_risk_ord"]:
            z["_max_risk_ord"]  = risk_ord
            z["max_risk_level"] = elem["risk_level"]

    # 집계 정리
    result: Dict[str, Dict[str, Any]] = {}
    for zid, z in zones.items():
        n = z["element_count"]
        result[zid] = {
            "zone_id":        zid,
            "element_count":  n,
            "avg_local_temp": round(z["_sum_temp"] / n, 2),
            "avg_utci":       round(z["_sum_utci"] / n, 2),
            "avg_wbgt":       round(z["_sum_wbgt"] / n, 2),
            "max_risk_level": z["max_risk_level"],
            "elements":       z["elements"],
        }

    return result


# =========================================================
# 실행 테스트
# =========================================================

if __name__ == "__main__":
    import json

    sample_weather = {
        "temperature":     33.0,
        "humidity":        62.0,
        "wind_speed":      2.0,
        "wind_direction":  180.0,
        "solar_radiation": 900.0,
        "cloud_cover":     0.1,
        "solar_altitude":  68.0,
    }

    sample_features = [
        {
            "element_id": "RD_011",
            "zone_id":    "zone_central",
            "microclimate": {
                "albedo":              0.12,
                "vegetation_ratio":    0.05,
                "shade_factor":        0.10,
                "ventilation_factor":  0.75,
                "building_density":    0.30,
                "facade_reflectivity": 0.20,
                "sky_view_factor":     0.80,
                "orientation":         180.0,
            },
        },
        {
            "element_id": "GR_020",
            "zone_id":    "zone_green",
            "microclimate": {
                "albedo":              0.20,
                "vegetation_ratio":    0.60,
                "shade_factor":        0.50,
                "ventilation_factor":  0.85,
                "building_density":    0.10,
                "facade_reflectivity": 0.05,
                "sky_view_factor":     0.70,
                "orientation":         0.0,
            },
        },
        {
            "element_id": "ND_006",
            "zone_id":    "zone_central",
            "microclimate": {
                "albedo":              0.12,
                "vegetation_ratio":    0.03,
                "shade_factor":        0.05,
                "ventilation_factor":  0.90,
                "building_density":    0.20,
                "facade_reflectivity": 0.15,
                "sky_view_factor":     0.90,
                "orientation":         0.0,
            },
        },
    ]

    print("=== 전체 파이프라인 실행 ===\n")
    results = run_pipeline_all(sample_weather, sample_features)

    for r in results:
        print(json.dumps(r, ensure_ascii=False, indent=2))
        print()

    print("=== Zone 집계 ===\n")
    zone_agg = aggregate_by_zone(results)
    print(json.dumps(zone_agg, ensure_ascii=False, indent=2))
