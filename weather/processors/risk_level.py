# processors/risk_level.py

def determine_risk_level(heat_island_score: int) -> str:
    if heat_island_score >= 80:
        return "매우 높음"
    if heat_island_score >= 60:
        return "높음"
    if heat_island_score >= 30:
        return "주의"
    return "낮음"