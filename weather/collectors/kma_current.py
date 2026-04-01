# collectors/kma_current.py

from datetime import datetime, timedelta
import requests

from config import KMA_SERVICE_KEY, KMA_NX, KMA_NY


BASE_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"


def get_latest_base_datetime(now: datetime | None = None) -> tuple[str, str]:
    if now is None:
        now = datetime.now()

    base = now - timedelta(hours=1)
    base = base.replace(minute=0, second=0, microsecond=0)
    return base.strftime("%Y%m%d"), base.strftime("%H00")


def fetch_kma_current() -> dict:
    base_date, base_time = get_latest_base_datetime()

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

    result = {
        "timestamp": f"{base_date}T{base_time}",
        "temperature": None,
        "humidity": None,
        "wind_speed": None,
    }

    for item in items:
        category = item["category"]
        value = item["obsrValue"]

        if category == "T1H":
            result["temperature"] = float(value)
        elif category == "REH":
            result["humidity"] = float(value)
        elif category == "WSD":
            result["wind_speed"] = float(value)

    return result