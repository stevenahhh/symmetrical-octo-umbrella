# collectors/kma_forecast.py

import requests
from datetime import datetime, timedelta

from config import KMA_SERVICE_KEY, KMA_NX, KMA_NY


BASE_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"

SKY_MAP = {
    "1": "맑음",
    "3": "구름많음",
    "4": "흐림",
}


def get_latest_forecast_base_datetime(now: datetime | None = None) -> tuple[str, str]:
    if now is None:
        now = datetime.now()

    base_times = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"]
    candidates = []
    today = now.strftime("%Y%m%d")

    for bt in base_times:
        bt_dt = datetime.strptime(f"{today}{bt}", "%Y%m%d%H%M")
        available_dt = bt_dt + timedelta(minutes=10)
        if now >= available_dt:
            candidates.append(bt)

    if candidates:
        return today, candidates[-1]

    yesterday = (now - timedelta(days=1)).strftime("%Y%m%d")
    return yesterday, "2300"


def fetch_kma_forecast() -> list[dict]:
    base_date, base_time = get_latest_forecast_base_datetime()

    params = {
        "serviceKey": KMA_SERVICE_KEY,
        "pageNo": 1,
        "numOfRows": 1000,
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

    forecast_map = {}

    for item in items:
        fcst_date = item["fcstDate"]
        fcst_time = item["fcstTime"]
        category = item["category"]
        value = item["fcstValue"]

        key = (fcst_date, fcst_time)

        if key not in forecast_map:
            forecast_map[key] = {
                "fcst_date": fcst_date,
                "fcst_time": fcst_time,
                "temperature": None,
                "humidity": None,
                "wind_speed": None,
                "sky": None,
            }

        if category == "TMP":
            forecast_map[key]["temperature"] = float(value)
        elif category == "REH":
            forecast_map[key]["humidity"] = float(value)
        elif category == "WSD":
            forecast_map[key]["wind_speed"] = float(value)
        elif category == "SKY":
            forecast_map[key]["sky"] = SKY_MAP.get(str(value), str(value))

    forecast_list = list(forecast_map.values())
    forecast_list.sort(key=lambda x: (x["fcst_date"], x["fcst_time"]))

    return forecast_list[:12]