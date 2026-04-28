# weather/processors/thermal_index.py
"""
체감 환경 지표(Thermal Comfort Index) 계산 모듈.

입력: local_temp, humidity, local_wind_speed, tmrt  (microclimate 계산 결과)
출력: feels_like, UTCI, WBGT, risk_level, stress_category, reasons

지표 설명
---------
feels_like     : 체감온도 (Heat Index / Wind Chill 통합)
UTCI           : Universal Thermal Climate Index — 사람이 느끼는 열 스트레스 종합 지수
WBGT (outdoor) : Wet Bulb Globe Temperature — 야외 작업·운동 기준 열 위험 지수
risk_level     : UTCI 기반 위험 등급 (낮음 / 주의 / 높음 / 매우 높음 / 위험)
stress_category: UTCI 등급 텍스트 설명
reasons        : 위험 요인 자연어 설명 목록
"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict, field
from typing import List


# =========================================================
# 공통 유틸
# =========================================================

def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _vapor_pressure_hpa(temp_c: float, rh: float) -> float:
    """
    수증기압 계산 (단위: hPa).
    Magnus 공식 기반.
    """
    temp_c = _clamp(temp_c, -60.0, 60.0)
    rh = _clamp(rh, 0.0, 100.0)
    return (rh / 100.0) * 6.105 * math.exp(17.27 * temp_c / (237.7 + temp_c))


# =========================================================
# 1. 체감온도 (Feels Like / Apparent Temperature)
# =========================================================

def calculate_feels_like(ta: float, rh: float, va: float) -> float:
    """
    체감온도 계산.

    조건별 공식 선택:
    - 고온 (ta >= 27°C, rh >= 40%): Rothfusz Heat Index
    - 저온 (ta <= 10°C, va >= 1.3 m/s): WMO Wind Chill
    - 그 외: 간단한 체감 보정

    Parameters
    ----------
    ta  : 기온 (°C)
    rh  : 상대습도 (%)
    va  : 풍속 (m/s)
    """
    rh = _clamp(rh, 0.0, 100.0)
    va = max(0.0, va)

    if ta >= 27.0 and rh >= 40.0:
        # Rothfusz Regression (원래 °F 기준, 변환 처리)
        T_f = ta * 9.0 / 5.0 + 32.0
        hi_f = (
            -42.379
            + 2.04901523 * T_f
            + 10.14333127 * rh
            - 0.22475541 * T_f * rh
            - 6.83783e-3 * T_f ** 2
            - 5.481717e-2 * rh ** 2
            + 1.22874e-3 * T_f ** 2 * rh
            + 8.5282e-4 * T_f * rh ** 2
            - 1.99e-6 * T_f ** 2 * rh ** 2
        )
        return round((hi_f - 32.0) * 5.0 / 9.0, 1)

    elif ta <= 10.0 and va >= 1.3:
        # WMO Wind Chill (2001 개정판)
        wci = (
            13.12
            + 0.6215 * ta
            - 11.37 * va ** 0.16
            + 0.3965 * ta * va ** 0.16
        )
        return round(wci, 1)

    else:
        # 중간 범위: 습도 기여만 반영
        return round(ta + (rh - 50.0) * 0.04, 1)


# =========================================================
# 2. UTCI (Universal Thermal Climate Index)
# =========================================================

def calculate_utci(ta: float, tmrt: float, va: float, rh: float) -> float:
    """
    UTCI 간소화 근사 계산.

    Bröde et al. (2012) 논문의 핵심 물리 관계를 반영한 실용 근사식.
    (전체 210항 다항식 대신, 주요 효과만 사용)

    주요 효과:
    1. 기온 (기본값)
    2. ΔTmrt = Tmrt - Ta : 복사열 스트레스 (+)
    3. 풍속 : 냉각 효과 (-)
    4. 수증기압 : 고습 환경에서 열 스트레스 증가 (+)
    5. 복사 × 습도 교호작용

    Parameters
    ----------
    ta   : 기온 (°C)
    tmrt : 평균복사온도 (°C)
    va   : 풍속 (m/s), 내부에서 최소 0.5 적용
    rh   : 상대습도 (%)
    """
    va = max(0.5, va)           # UTCI 표준 최소 기준 풍속
    d_tmrt = tmrt - ta
    pa = _vapor_pressure_hpa(ta, rh) / 10.0   # hPa → kPa (UTCI 관례)

    # 각 항 기여
    radiation_term  =  0.0715 * d_tmrt
    wind_term       = -3.21   * (math.log(va) - math.log(0.5))   # 0.5 m/s 기준
    humidity_term   =  0.058  * pa * ta / 20.0                   # 고온 고습 효과
    interact_term   =  0.0027 * pa * d_tmrt                      # 복사-습도 교호

    utci = ta + radiation_term + wind_term + humidity_term + interact_term
    return round(utci, 1)


# =========================================================
# 3. WBGT (Wet Bulb Globe Temperature, 야외)
# =========================================================

def _wet_bulb_temp(ta: float, rh: float) -> float:
    """
    자연 습구온도 추정 (Stull 2011 근사).
    오차 ±1°C 수준.
    """
    rh = _clamp(rh, 5.0, 99.0)
    twb = (
        ta * math.atan(0.151977 * (rh + 8.313659) ** 0.5)
        + math.atan(ta + rh)
        - math.atan(rh - 1.676331)
        + 0.00391838 * rh ** 1.5 * math.atan(0.023101 * rh)
        - 4.686035
    )
    return twb


def calculate_wbgt_outdoor(ta: float, tmrt: float, va: float, rh: float) -> float:
    """
    야외 WBGT 계산 (ISO 7243 기반 간소화).

    WBGT = 0.7 * Twb + 0.2 * Tg + 0.1 * Ta

    Twb : 자연 습구온도  (Stull 2011)
    Tg  : 흑구온도 추정  (Tmrt + 풍속 냉각 보정)
    Ta  : 기온

    Parameters
    ----------
    ta   : 기온 (°C)
    tmrt : 평균복사온도 (°C)
    va   : 풍속 (m/s)
    rh   : 상대습도 (%)
    """
    twb = _wet_bulb_temp(ta, rh)

    # 흑구온도: Tmrt 기반 근사, 풍속이 강할수록 Tmrt → Ta 로 수렴
    va_eff = max(0.1, va)
    tg = ta + (tmrt - ta) * 0.25 / (1.0 + 0.6 * va_eff)

    wbgt = 0.7 * twb + 0.2 * tg + 0.1 * ta
    return round(wbgt, 1)


# =========================================================
# 4. 위험도 분류 (UTCI 기준)
# =========================================================

# UTCI 공식 등급 (ISO 15743 / Bröde 2012)
_UTCI_LEVELS = [
    (46.0,  "위험",      "극한 열 스트레스"),
    (38.0,  "매우 높음", "매우 강한 열 스트레스"),
    (32.0,  "높음",      "강한 열 스트레스"),
    (26.0,  "주의",      "중간 열 스트레스"),
    (9.0,   "낮음",      "열 스트레스 없음"),
    (-13.0, "낮음",      "약한 냉각 스트레스"),
    (float("-inf"), "주의", "중간 냉각 스트레스"),
]


def determine_risk(utci: float) -> tuple[str, str]:
    """
    UTCI 값으로 위험도 등급과 설명 텍스트를 반환.

    Returns
    -------
    (risk_level, stress_category)
    """
    for threshold, level, category in _UTCI_LEVELS:
        if utci >= threshold:
            return level, category
    return "주의", "강한 냉각 스트레스"


# =========================================================
# 5. 원인 설명 생성 (reasons)
# =========================================================

def generate_reasons(
    ta: float,
    rh: float,
    va: float,
    tmrt: float,
    utci: float,
    wbgt: float,
) -> List[str]:
    """
    체감 환경 원인을 자연어로 설명하는 목록 생성.

    각 요인별 독립적으로 평가 후 합산.
    """
    reasons: List[str] = []
    d_tmrt = tmrt - ta

    # --- 기온 ---
    if ta >= 35.0:
        reasons.append(f"기온 {ta:.1f}°C — 매우 높은 기온")
    elif ta >= 30.0:
        reasons.append(f"기온 {ta:.1f}°C — 높은 기온")
    elif ta <= 0.0:
        reasons.append(f"기온 {ta:.1f}°C — 영하권 기온")

    # --- 복사열 (Tmrt - Ta) ---
    if d_tmrt >= 25.0:
        reasons.append(f"복사열 과부하 (+{d_tmrt:.0f}°C) — 직달 일사가 매우 강함")
    elif d_tmrt >= 15.0:
        reasons.append(f"복사열 높음 (+{d_tmrt:.0f}°C) — 직달 일사의 영향")
    elif d_tmrt >= 8.0:
        reasons.append(f"복사열 다소 높음 (+{d_tmrt:.0f}°C)")

    # --- 습도 ---
    if rh >= 80.0:
        reasons.append(f"습도 {rh:.0f}% — 매우 높아 땀 증발이 거의 안 됨")
    elif rh >= 65.0:
        reasons.append(f"습도 {rh:.0f}% — 높아 체감 더위 증가")
    elif rh >= 55.0:
        reasons.append(f"습도 {rh:.0f}% — 다소 높음")

    # --- 풍속 ---
    if va <= 0.3:
        reasons.append("풍속 거의 없음 — 열 체류")
    elif va <= 1.0:
        reasons.append(f"풍속 {va:.1f} m/s — 낮아 냉각 효과 제한")
    elif va >= 8.0:
        reasons.append(f"풍속 {va:.1f} m/s — 강풍으로 냉각 효과 큼")

    # --- WBGT 기준 행동 지침 ---
    if wbgt >= 33.0:
        reasons.append(f"WBGT {wbgt:.1f}°C — 야외 활동 중지 권고 수준")
    elif wbgt >= 31.0:
        reasons.append(f"WBGT {wbgt:.1f}°C — 야외 격렬한 활동 자제 권고")
    elif wbgt >= 28.0:
        reasons.append(f"WBGT {wbgt:.1f}°C — 야외 활동 주의 필요")

    # 아무 이유가 없으면 양호 메시지
    if not reasons:
        reasons.append("현재 열 환경은 쾌적한 수준입니다")

    return reasons


# =========================================================
# 6. 통합 계산 인터페이스
# =========================================================

@dataclass
class ThermalIndexResult:
    element_id:      str
    feels_like:      float
    utci:            float
    wbgt:            float
    risk_level:      str
    stress_category: str
    reasons:         List[str] = field(default_factory=list)


def calculate_thermal_index(
    element_id: str,
    local_temp: float,
    humidity: float,
    local_wind_speed: float,
    tmrt: float,
) -> dict:
    """
    element 단위 체감 지표를 모두 계산하여 dict 반환.

    Parameters
    ----------
    element_id       : 공간 식별자
    local_temp       : 공간별 기온 (°C)   — microclimate 결과
    humidity         : 상대습도 (%)       — 기상 데이터
    local_wind_speed : 공간별 풍속 (m/s) — microclimate 결과
    tmrt             : 평균복사온도 (°C)  — microclimate 결과
    """
    feels_like = calculate_feels_like(local_temp, humidity, local_wind_speed)
    utci       = calculate_utci(local_temp, tmrt, local_wind_speed, humidity)
    wbgt       = calculate_wbgt_outdoor(local_temp, tmrt, local_wind_speed, humidity)
    risk_level, stress_category = determine_risk(utci)
    reasons    = generate_reasons(local_temp, humidity, local_wind_speed, tmrt, utci, wbgt)

    result = ThermalIndexResult(
        element_id      = element_id,
        feels_like      = feels_like,
        utci            = utci,
        wbgt            = wbgt,
        risk_level      = risk_level,
        stress_category = stress_category,
        reasons         = reasons,
    )
    return asdict(result)


def calculate_thermal_index_from_microclimate(
    microclimate: dict,
    weather: dict,
) -> dict:
    """
    microclimate 결과 dict + 기상 데이터 dict 에서 바로 사용하는 래퍼.

    Parameters
    ----------
    microclimate : calculate_microclimate_for_element() 의 출력 dict
    weather      : 기상 데이터 (humidity 필드 포함)
    """
    return calculate_thermal_index(
        element_id       = microclimate["element_id"],
        local_temp       = microclimate["local_temp"],
        humidity         = weather.get("humidity", 50.0),
        local_wind_speed = microclimate["local_wind_speed"],
        tmrt             = microclimate["tmrt"],
    )


# =========================================================
# 7. 간단한 실행 테스트
# =========================================================

if __name__ == "__main__":
    import json

    test_cases = [
        {
            "label": "한여름 뙤약볕 아스팔트 (극한 더위)",
            "element_id": "RD_011",
            "local_temp": 36.0,
            "humidity": 65.0,
            "local_wind_speed": 0.3,
            "tmrt": 62.0,
        },
        {
            "label": "그늘진 녹지 (쾌적)",
            "element_id": "GR_020",
            "local_temp": 27.0,
            "humidity": 50.0,
            "local_wind_speed": 2.5,
            "tmrt": 32.0,
        },
        {
            "label": "겨울 강풍 도로",
            "element_id": "RD_055",
            "local_temp": 2.0,
            "humidity": 40.0,
            "local_wind_speed": 8.0,
            "tmrt": -2.0,
        },
    ]

    for tc in test_cases:
        label = tc.pop("label")
        result = calculate_thermal_index(**tc)
        print(f"\n=== {label} ===")
        print(json.dumps(result, ensure_ascii=False, indent=2))
