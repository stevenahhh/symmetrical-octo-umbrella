# collectors/kma_current.py
"""
KMA 초단기실황(getUltraSrtNcst) 수집기.

반환 필드
---------
timestamp          : "YYYYMMDDTHHmm" 문자열
temperature        : T1H  — 기온 (°C)
humidity           : REH  — 상대습도 (%)
wind_speed         : WSD  — 풍속 (m/s)
wind_direction     : VEC  — 풍향 (°, 0‒360)
precipitation_type : PTY  — 강수형태 (0=없음, 1=비, 2=비/눈, 3=눈, 5=빗방울, 6=빗방울/눈날림, 7=눈날림)
solar_altitude     : 위경도+시각으로 계산한 태양고도 (°)  ← KMA API 미제공, 직접 계산
cloud_cover        : PTY 기반 추정 운량 (0.0‒1.0)         ← KMA API 미제공, 추정
solar_radiation    : 태양고도+운량으로 추정 일사량 (W/m²)  ← KMA API 미제공, 추정
"""

from __future__ import annotations

import math
from datetime import datetime, timezone, timedelta

import requests

from config import KMA_SERVICE_KEY, KMA_NX, KMA_NY, CAMPUS_LAT, CAMPUS_LON


BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"

# 한국 표준시 UTC+9
KST = timezone(timedelta(hours=9))


# =========================================================
# 보조: 기준시각 계산
# =========================================================

def get_latest_base_datetime(now: datetime | None = None) -> tuple[str, str]:
    if now is None:
        now = datetime.now()
    base = now - timedelta(hours=1)
    base = base.replace(minute=0, second=0, microsecond=0)
    return base.strftime("%Y%m%d"), base.strftime("%H00")


# =========================================================
# 보조: 태양고도 계산 (위경도 + UTC 시각)
# =========================================================

def calc_solar_altitude(lat_deg: float, lon_deg: float, utc_dt: datetime) -> float:
    """
    간이 천문 공식으로 태양고도(°)를 반환.
    음수이면 야간(일몰 후) → 0.0 으로 클램프.

    참조: NOAA Solar Calculator 공식 (Spencer, 1971 / Iqbal, 1983 간략화 버전)
    """
    # 연간 각도 (rad)
    day_of_year = utc_dt.timetuple().tm_yday
    B = math.radians((360.0 / 365.0) * (day_of_year - 81))

    # 균시차 (분)
    EqT = (9.87 * math.sin(2 * B) - 7.53 * math.cos(B) - 1.5 * math.sin(B))

    # 태양 적위 (rad)
    decl = math.radians(23.45 * math.sin(B))

    # 현지 태양시 (시간 단위)
    utc_hour = utc_dt.hour + utc_dt.minute / 60.0 + utc_dt.second / 3600.0
    local_solar_time = utc_hour + lon_deg / 15.0 + EqT / 60.0

    # 시간각 (rad, 정오=0, 오전=음수, 오후=양수)
    hour_angle = math.radians((local_solar_time - 12.0) * 15.0)

    # 태양고도
    lat_rad = math.radians(lat_deg)
    sin_alt = (
        math.sin(lat_rad) * math.sin(decl)
        + math.cos(lat_rad) * math.cos(decl) * math.cos(hour_angle)
    )
    altitude_deg = math.degrees(math.asin(max(-1.0, min(1.0, sin_alt))))
    return max(0.0, round(altitude_deg, 2))


# =========================================================
# 보조: PTY → 운량 추정
# =========================================================

_PTY_TO_CLOUD: dict[int, float] = {
    0: 0.1,   # 강수 없음 → 맑음/약간 흐림 (낮은 기본값, 이후 계절 보정 가능)
    1: 0.85,  # 비 → 두꺼운 운층
    2: 0.90,  # 비/눈 → 두꺼운 운층
    3: 0.80,  # 눈 → 두꺼운 운층
    5: 0.60,  # 빗방울
    6: 0.70,  # 빗방울/눈날림
    7: 0.65,  # 눈날림
}

def pty_to_cloud_cover(pty: int) -> float:
    return _PTY_TO_CLOUD.get(int(pty), 0.3)


# =========================================================
# 보조: 태양고도 + 운량 → 일사량 추정 (W/m²)
# =========================================================

def estimate_solar_radiation(solar_alt_deg: float, cloud_cover: float) -> float:
    """
    간이 추정:
      1) 맑은 하늘 일사량: Gsc (태양상수) × sin(고도) × 대기투과율 (≈0.75)
      2) 운량 감쇄: × (1 - 0.75 * cloud_cover²)
    야간(solar_alt_deg=0)이면 0 반환.
    """
    if solar_alt_deg <= 0.0:
        return 0.0
    GSC = 1361.0          # 태양상수 (W/m²)
    transmittance = 0.75  # 대기 평균 투과율
    clear_sky = GSC * math.sin(math.radians(solar_alt_deg)) * transmittance
    attenuation = 1.0 - 0.75 * (cloud_cover ** 2)
    return round(max(0.0, clear_sky * attenuation), 1)


# =========================================================
# 메인: KMA 초단기실황 수집
# =========================================================

def fetch_kma_current(now: datetime | None = None) -> dict:
    if now is None:
        now = datetime.now()

    base_date, base_time = get_latest_base_datetime(now)

    params = {
        "serviceKey": KMA_SERVICE_KEY,
        "pageNo": 1,
        "numOfRows": 100,
        "dataType": "JSON",
        "base_date": base_date,
        "base_time": base_time,
        "nx": KMA_NX,
        "ny": KMA_NY,
    }

    response = requests.get(BASE_URL, params=params, timeout=15)
    response.raise_for_status()
    data = response.json()

    items = data["response"]["body"]["items"]["item"]

    result: dict = {
        "timestamp":          f"{base_date}T{base_time}",
        "temperature":        None,
        "humidity":           None,
        "wind_speed":         None,
        "wind_direction":     None,
        "precipitation_type": 0,
    }

    for item in items:
        category = item["category"]
        value    = item["obsrValue"]

        if   category == "T1H":
            result["temperature"]        = float(value)
        elif category == "REH":
            result["humidity"]           = float(value)
        elif category == "WSD":
            result["wind_speed"]         = float(value)
        elif category == "VEC":
            result["wind_direction"]     = float(value)
        elif category == "PTY":
            result["precipitation_type"] = int(float(value))

    # ----- 계산·추정 필드 -----
    # UTC 시각으로 변환 (KST = UTC+9)
    utc_now = now.replace(tzinfo=None) - timedelta(hours=9)  # 입력이 KST 로컬시 가정
    # 보다 안전하게: KST aware 가 아닌 경우도 처리
    try:
        utc_now = now.astimezone(timezone.utc).replace(tzinfo=None)
    except (ValueError, OSError):
        utc_now = now - timedelta(hours=9)

    solar_alt  = calc_solar_altitude(CAMPUS_LAT, CAMPUS_LON, utc_now)
    cloud      = pty_to_cloud_cover(result["precipitation_type"])
    solar_rad  = estimate_solar_radiation(solar_alt, cloud)

    result["solar_altitude"]   = solar_alt
    result["cloud_cover"]      = cloud
    result["solar_radiation"]  = solar_rad

    return result
