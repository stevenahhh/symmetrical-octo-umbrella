# processors/summary.py

def build_summary(zones: list[dict], base_weather: dict) -> dict:
    if not zones:
        return {
            "overall_status": "정보 없음",
            "highest_risk_zone": None,
            "highest_risk_score": None,
            "average_heat_island_score": None,
            "air_quality_status": "정보 없음",
        }

    highest_zone = max(zones, key=lambda z: z["heat_island_score"])
    avg_score = round(sum(z["heat_island_score"] for z in zones) / len(zones), 1)

    if avg_score >= 70:
        overall_status = "위험"
    elif avg_score >= 40:
        overall_status = "주의"
    else:
        overall_status = "쾌적"

    khai_grade = str(base_weather.get("khai_grade", ""))
    air_quality_map = {
        "1": "좋음",
        "2": "보통",
        "3": "나쁨",
        "4": "매우 나쁨",
    }

    return {
        "overall_status": overall_status,
        "highest_risk_zone": highest_zone["zone_name"],
        "highest_risk_score": highest_zone["heat_island_score"],
        "average_heat_island_score": avg_score,
        "air_quality_status": air_quality_map.get(khai_grade, "정보 없음"),
    }