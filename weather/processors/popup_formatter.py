# weather/processors/popup_formatter.py
"""
건물 클릭 팝업용 응답 포매터.

파이프라인 결과(run_pipeline_for_element)를 받아서
프론트엔드가 바로 렌더링할 수 있는 UI-ready 형태로 변환한다.

포함 정보
---------
- 건물 이름 / 타입 / zone
- 열환경 수치 (local_temp, feels_like, UTCI, WBGT)
- 위험도 + 색상 코드 (risk_color, risk_score)
- 미기후 주요 인자 정성 평가 (shade, vegetation, wind, radiation)
- 기준 기상 대비 델타 (temp_diff, utci_diff)
- 원인 설명 (reasons)
- 기준 기상 요약 (base_weather)
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from processors.materials import resolve_material_properties


# =========================================================
# 1. 위험도 → UI 매핑
# =========================================================

_RISK_UI: Dict[str, Dict[str, Any]] = {
    "위험":      {"score": 4, "color": "#D32F2F", "label_en": "Danger"},
    "매우 높음": {"score": 3, "color": "#F57C00", "label_en": "Very High"},
    "높음":      {"score": 2, "color": "#FBC02D", "label_en": "High"},
    "주의":      {"score": 1, "color": "#388E3C", "label_en": "Caution"},
    "낮음":      {"score": 0, "color": "#1976D2", "label_en": "Low"},
}

def _risk_ui(risk_level: str) -> Dict[str, Any]:
    return _RISK_UI.get(risk_level, {"score": 0, "color": "#9E9E9E", "label_en": "Unknown"})


# =========================================================
# 2. 미기후 인자 → 정성 평가
# =========================================================

def _factor_level(value: float, thresholds: tuple[float, float, float]) -> str:
    """
    thresholds = (낮음 상한, 보통 상한, 높음 상한)
    value < 낮음상한 → "낮음"
    value < 보통상한 → "보통"
    value < 높음상한 → "높음"
    그 이상         → "매우 높음"
    """
    lo, mid, hi = thresholds
    if value < lo:
        return "낮음"
    if value < mid:
        return "보통"
    if value < hi:
        return "높음"
    return "매우 높음"


def build_factors(microclimate: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    microclimate_features.json 의 microclimate dict 에서
    shade / vegetation / wind / radiation 정성 평가를 생성.

    각 항목은 { "level": str, "value": float } 형태.
    """
    material = resolve_material_properties(microclimate)
    shade_val  = microclimate.get("shade_factor",      0.0)
    veg_val    = microclimate.get("vegetation_ratio",  0.0)
    wind_val   = microclimate.get("ventilation_factor",0.0)
    sky_val    = microclimate.get("sky_view_factor",   0.0)  # 복사 노출 지표
    heat_val   = material.get("heat_storage_factor", 0.0)

    return {
        "shade": {
            "level": _factor_level(shade_val,  (0.15, 0.35, 0.55)),
            "value": round(shade_val, 3),
        },
        "vegetation": {
            "level": _factor_level(veg_val,    (0.15, 0.35, 0.60)),
            "value": round(veg_val, 3),
        },
        "wind": {
            "level": _factor_level(wind_val,   (0.45, 0.65, 0.85)),
            "value": round(wind_val, 3),
        },
        "radiation": {
            # sky_view_factor 높을수록 복사 노출 많음 → level 반전 없이 그대로
            "level": _factor_level(sky_val,    (0.45, 0.65, 0.85)),
            "value": round(sky_val, 3),
        },
        "material_heat": {
            "level": _factor_level(heat_val, (0.35, 0.55, 0.75)),
            "value": round(heat_val, 3),
        },
    }


# =========================================================
# 3. 기준 기상 대비 델타
# =========================================================

def build_delta(
    local_temp: float,
    utci: float,
    base_temp: float,
    base_utci: Optional[float] = None,
) -> Dict[str, Any]:
    temp_diff = round(local_temp - base_temp, 1)
    sign      = "+" if temp_diff >= 0 else ""
    label     = f"기준 기온 대비 {sign}{temp_diff}°C"

    result: Dict[str, Any] = {
        "temp":  temp_diff,
        "label": label,
    }
    if base_utci is not None:
        result["utci"] = round(utci - base_utci, 1)

    return result


# =========================================================
# 4. 최종 팝업 응답 조립
# =========================================================

def format_popup_response(
    element_id:     str,
    name:           str,
    zone_id:        str,
    element_type:   str,
    pipeline_result: Dict[str, Any],
    microclimate:    Dict[str, Any],
    weather:         Dict[str, Any],
    timestamp:       Optional[str] = None,
    base_utci:       Optional[float] = None,
) -> Dict[str, Any]:
    """
    파이프라인 결과 + 건물 메타 + 미기후 특성을 묶어 팝업 응답 dict 반환.
    """
    # 안전한 기본값 처리
    risk_level  = pipeline_result.get("risk_level", "낮음")
    local_temp  = pipeline_result.get("local_temp", weather.get("temperature", 25.0))
    utci        = pipeline_result.get("utci", 25.0)
    feels_like  = pipeline_result.get("feels_like", local_temp)
    wbgt        = pipeline_result.get("wbgt", 20.0)
    stress_category = pipeline_result.get("stress_category", "")
    reasons     = pipeline_result.get("reasons", [])
    
    base_temp   = weather.get("temperature", local_temp)
    ui          = _risk_ui(risk_level)
    material    = pipeline_result.get("material_detail") or resolve_material_properties(microclimate)

    thermal = {
        "local_temp":      round(float(local_temp), 1),
        "feels_like":      round(float(feels_like), 1),
        "utci":            round(float(utci), 1),
        "wbgt":            round(float(wbgt), 1),
        "risk_level":      risk_level,
        "stress_category": str(stress_category),
        "risk_color":      ui["color"],
        "risk_score":      ui["score"],
    }

    return {
        "element_id":   element_id,
        "name":         name,
        "zone_id":      zone_id,
        "element_type": element_type,
        "timestamp":    timestamp,
        "data_note": {
            "assumption_level": material.get("assumption_level", "estimated"),
            "material_source": material.get("material_source", "estimated_surface_library_v1"),
            "message": "현재 재질/복사 정보는 추정 기반 시뮬레이션 값이며, 추후 실측/정밀 모델로 교체될 수 있습니다.",
        },

        "thermal":  thermal,
        "factors":  build_factors(microclimate),
        "delta":    build_delta(local_temp, utci, base_temp, base_utci),
        "reasons":  list(reasons) if reasons else [],
        "material": {
            "surface_type": material.get("surface_type"),
            "albedo": material.get("albedo"),
            "surface_emissivity": material.get("surface_emissivity"),
            "thermal_conductivity": material.get("thermal_conductivity"),
            "volumetric_heat_capacity": material.get("volumetric_heat_capacity"),
            "moisture_availability": material.get("moisture_availability"),
        },

        "base_weather": {
            "temperature": weather.get("temperature"),
            "humidity":    weather.get("humidity"),
            "wind_speed":  weather.get("wind_speed"),
        },
    }
