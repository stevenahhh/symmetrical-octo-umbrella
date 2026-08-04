from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from config import KMA_SERVICE_KEY, KMA_NX, KMA_NY


BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
KST = timezone(timedelta(hours=9))

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


def _parse_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_int(value: Any) -> int | None:
    parsed = _parse_float(value)
    if parsed is None:
        return None
    return int(parsed)


def _extract_numeric_values(text: str) -> list[float]:
    return [float(match) for match in re.findall(r"\d+(?:\.\d+)?", text)]


def parse_precipitation_amount(value: Any) -> tuple[float | None, str | None]:
    if value is None:
        return None, None

    raw = str(value).strip()
    if not raw:
        return None, None

    normalized = raw.replace(" ", "")
    if raw == "강수없음":
        return 0.0, raw

    numbers = _extract_numeric_values(normalized)
    if not numbers:
        return None, raw

    if "미만" in normalized:
        return round(numbers[0] / 2.0, 3), raw
    if "~" in normalized or "-" in normalized:
        sample = numbers[:2]
        return round(sum(sample) / len(sample), 3), raw

    return round(numbers[0], 3), raw


def _forecast_timestamp(fcst_date: str, fcst_time: str) -> tuple[str, datetime]:
    dt_kst = datetime.strptime(f"{fcst_date}{fcst_time}", "%Y%m%d%H%M").replace(tzinfo=KST)
    return dt_kst.strftime("%Y%m%dT%H%M"), dt_kst


def _forecast_lead_hour(fcst_dt_kst: datetime, now: datetime) -> int:
    if now.tzinfo is None:
        now = now.replace(tzinfo=KST)
    else:
        now = now.astimezone(KST)

    bucket_now = now.replace(minute=0, second=0, microsecond=0)
    return int((fcst_dt_kst - bucket_now).total_seconds() // 3600)


def fetch_kma_forecast(limit: int | None = 12, now: datetime | None = None) -> list[dict]:
    if now is None:
        now = datetime.now(KST)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=KST)
    else:
        now = now.astimezone(KST)

    base_date, base_time = get_latest_forecast_base_datetime(now.replace(tzinfo=None))

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
    forecast_map: dict[tuple[str, str], dict[str, Any]] = {}

    for item in items:
        fcst_date = item["fcstDate"]
        fcst_time = item["fcstTime"]
        category = item["category"]
        value = item["fcstValue"]
        key = (fcst_date, fcst_time)

        if key not in forecast_map:
            timestamp, fcst_dt_kst = _forecast_timestamp(fcst_date, fcst_time)
            forecast_map[key] = {
                "base_date": base_date,
                "base_time": base_time,
                "fcst_date": fcst_date,
                "fcst_time": fcst_time,
                "timestamp": timestamp,
                "lead_hour": _forecast_lead_hour(fcst_dt_kst, now),
                "temperature": None,
                "humidity": None,
                "wind_speed": None,
                "wind_direction": None,
                "sky": None,
                "sky_code": None,
                "precipitation_probability": None,
                "precipitation_amount": None,
                "precipitation_amount_text": None,
                "precipitation_type": None,
            }

        row = forecast_map[key]

        if category == "TMP":
            row["temperature"] = _parse_float(value)
        elif category == "REH":
            row["humidity"] = _parse_float(value)
        elif category == "WSD":
            row["wind_speed"] = _parse_float(value)
        elif category == "VEC":
            row["wind_direction"] = _parse_float(value)
        elif category == "SKY":
            row["sky_code"] = _parse_int(value)
            row["sky"] = SKY_MAP.get(str(value), str(value))
        elif category == "POP":
            row["precipitation_probability"] = _parse_int(value)
        elif category == "PCP":
            amount, raw = parse_precipitation_amount(value)
            row["precipitation_amount"] = amount
            row["precipitation_amount_text"] = raw
        elif category == "PTY":
            row["precipitation_type"] = _parse_int(value)

    forecast_list = list(forecast_map.values())
    forecast_list.sort(key=lambda item: (item["fcst_date"], item["fcst_time"]))

    if limit is None:
        return forecast_list
    return forecast_list[:limit]
