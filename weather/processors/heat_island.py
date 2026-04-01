# processors/heat_island.py

def _clamp(value: float, min_value: float = 10, max_value: float = 100) -> int:
    return int(max(min_value, min(max_value, round(value))))


def calculate_heat_island(
    estimated_temperature: float,
    humidity: float,
    wind_speed: float,
    zone_bias: float,
) -> int:
    """
    MVP용 열섬 점수.
    너무 시원한 날씨에서도 과도하게 튀지 않도록 temperature 영향 비중을 조정.
    """
    temp_component = max(0, (estimated_temperature - 20)) * 4.0
    humidity_component = max(0, (humidity - 50)) * 0.3
    wind_component = max(0, (2.0 - wind_speed)) * 8.0
    bias_component = zone_bias * 1.5

    score = temp_component + humidity_component + wind_component + bias_component
    return _clamp(score)