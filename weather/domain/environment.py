# domain/environment.py

from processors.feels_like import calculate_feels_like
from processors.heat_island import calculate_heat_island
from processors.risk_level import determine_risk_level
from processors.reasons import generate_reasons
from processors.summary import build_summary


def build_zone_result(base_weather: dict, zone: dict) -> dict:
    estimated_temperature = round(
        base_weather["temperature"] + (zone["risk_bias"] * 0.3), 1
    )

    feels_like = calculate_feels_like(
        temperature=estimated_temperature,
        humidity=base_weather["humidity"],
    )

    heat_island_score = calculate_heat_island(
        estimated_temperature=estimated_temperature,
        humidity=base_weather["humidity"],
        wind_speed=base_weather["wind_speed"],
        zone_bias=zone["risk_bias"],
    )

    risk_level = determine_risk_level(heat_island_score)

    reasons = generate_reasons(
        zone_type=zone["zone_type"],
        estimated_temperature=estimated_temperature,
        humidity=base_weather["humidity"],
        wind_speed=base_weather["wind_speed"],
        heat_island_score=heat_island_score,
    )

    return {
        "zone_id": zone["zone_id"],
        "zone_name": zone["zone_name"],
        "zone_type": zone["zone_type"],
        "estimated_temperature": estimated_temperature,
        "feels_like": feels_like,
        "heat_island_score": heat_island_score,
        "risk_level": risk_level,
        "reasons": reasons,
    }


def build_environment_result(base_weather: dict, zones: list[dict]) -> dict:
    zone_results = [build_zone_result(base_weather, zone) for zone in zones]
    summary = build_summary(zone_results, base_weather)

    return {
        "timestamp": base_weather["timestamp"],
        "summary": summary,
        "base_weather": base_weather,
        "zones": zone_results,
    }