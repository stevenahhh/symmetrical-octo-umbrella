# collectors/air_quality.py

import requests
from config import AIRKOREA_SERVICE_KEY, AIR_STATION_NAME


BASE_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"


def _parse_float(value):
    try:
        if value in (None, "", "-"):
            return None
        return float(value)
    except Exception:
        return None


def fetch_air_quality() -> dict:
    params = {
        "serviceKey": AIRKOREA_SERVICE_KEY,
        "returnType": "json",
        "numOfRows": 10,
        "pageNo": 1,
        "stationName": AIR_STATION_NAME,
        "dataTerm": "DAILY",
        "ver": "1.3",
    }

    response = requests.get(BASE_URL, params=params, timeout=15)
    response.raise_for_status()
    data = response.json()

    items = data.get("response", {}).get("body", {}).get("items", [])
    if not items:
        raise ValueError("에어코리아 응답에 측정 데이터가 없습니다.")

    item = items[0]

    return {
        "pm10": _parse_float(item.get("pm10Value")),
        "pm25": _parse_float(item.get("pm25Value")),
        "o3": _parse_float(item.get("o3Value")),
        "khai_value": _parse_float(item.get("khaiValue")),
        "khai_grade": str(item.get("khaiGrade", "")),
    }