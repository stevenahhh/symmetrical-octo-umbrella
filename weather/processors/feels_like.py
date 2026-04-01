# processors/feels_like.py

def calculate_feels_like(temperature: float, humidity: float) -> float:
    """
    MVP용 단순 체감온도 계산.
    실제 공식 대체가 아니라 규칙 기반 추정값.
    """
    feels_like = temperature + (humidity * 0.1)
    return round(feels_like, 1)