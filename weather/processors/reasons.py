# processors/reasons.py

def generate_reasons(
    zone_type: str,
    estimated_temperature: float,
    humidity: float,
    wind_speed: float,
    heat_island_score: int,
) -> list[str]:
    reasons = []

    if estimated_temperature >= 33:
        reasons.append("구역 추정 온도가 높음")
    elif estimated_temperature >= 28:
        reasons.append("구역 추정 온도가 다소 높음")

    if humidity >= 70:
        reasons.append("습도가 높아 체감 더위가 커질 수 있음")
    elif humidity >= 60:
        reasons.append("습도가 다소 높음")

    if wind_speed <= 1.0:
        reasons.append("풍속이 낮아 열이 머물 가능성이 있음")

    if zone_type == "parking":
        reasons.append("포장면 특성으로 주변보다 열이 조금 더 머물 수 있음")
    elif zone_type == "road":
        reasons.append("도로 포장 특성으로 주변보다 열이 조금 더 머물 수 있음")
    elif zone_type == "green":
        reasons.append("녹지 특성으로 열이 완화되는 경향이 있음")
    elif zone_type == "building_dense":
        reasons.append("건물 밀집 특성으로 열 순환이 다소 제한될 수 있음")
    elif zone_type == "playground":
        reasons.append("운동장 노출면 특성의 영향을 받을 수 있음")

    # 아주 낮은 점수인데 과한 이유가 많지 않도록 조정
    if heat_island_score <= 15 and reasons:
        filtered = []
        for reason in reasons:
            if reason in {
                "포장면 특성으로 주변보다 열이 조금 더 머물 수 있음",
                "도로 포장 특성으로 주변보다 열이 조금 더 머물 수 있음",
                "녹지 특성으로 열이 완화되는 경향이 있음",
                "건물 밀집 특성으로 열 순환이 다소 제한될 수 있음",
                "운동장 노출면 특성의 영향을 받을 수 있음",
            }:
                filtered.append(reason)
        reasons = filtered

    return reasons