# main.py

import json

from collectors.kma_current import fetch_kma_current
from collectors.air_quality import fetch_air_quality
from collectors.kma_forecast import fetch_kma_forecast
from domain.environment import build_environment_result
from domain.zones import ZONES


def main():
    weather = fetch_kma_current()
    air_quality = fetch_air_quality()
    weather.update(air_quality)

    environment_result = build_environment_result(weather, ZONES)
    forecast = fetch_kma_forecast()

    final_result = {
        **environment_result,
        "forecast": forecast,
    }

    print(json.dumps(final_result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()