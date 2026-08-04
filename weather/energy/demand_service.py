"""Deterministic demand calculation from the confirmed SQLite fixture."""
from __future__ import annotations
from contextlib import closing
from datetime import date, datetime, time, timedelta, timezone
from .persistence import Database

KST = timezone(timedelta(hours=9))
WEEKDAYS = ("\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08", "\ud1a0", "\uc77c")


def building_demand(database: Database, building_id: str, day: date) -> dict | None:
    with closing(database.connect()) as connection:
        if connection.execute("SELECT 1 FROM buildings WHERE id=?", (building_id,)).fetchone() is None:
            return None
        rooms = connection.execute("""
            SELECT r.id, r.room_size, r.room_type, r.computer_count, r.has_large_screen,
                   r.hvac_unit_count, p.standby_kw, p.occupied_plug_kw,
                   p.lighting_small_kw, p.lighting_medium_kw, p.lighting_large_kw,
                   p.computer_kw_each, p.large_screen_kw, p.occupied_hvac_kw_each,
                   p.server_hvac_kw_each
            FROM rooms r JOIN load_profiles p ON p.id=r.load_profile_id
            WHERE r.building_id=? ORDER BY r.id
        """, (building_id,)).fetchall()
        events = connection.execute("""
            SELECT e.room_id, e.weekday, e.start_minute, e.duration_minutes
            FROM timetable_events e JOIN rooms r ON r.id=e.room_id WHERE r.building_id=?
        """, (building_id,)).fetchall()
    by_room: dict[str, list] = {}
    for event in events:
        by_room.setdefault(event["room_id"], []).append(event)
    intervals = []
    start = datetime.combine(day, time.min, tzinfo=KST)
    weekday = WEEKDAYS[day.weekday()]
    for index in range(96):
        minute = index * 15
        power = 0.0
        for room in rooms:
            server = room["room_type"] == "server"
            occupied = server or any(
                event["weekday"] == weekday
                and event["start_minute"] <= minute < event["start_minute"] + event["duration_minutes"]
                for event in by_room.get(room["id"], ())
            )
            lighting = room[f"lighting_{room['room_size']}_kw"] if occupied and not server else 0
            power += room["standby_kw"] + lighting
            if occupied and not server:
                power += room["occupied_plug_kw"] + room["computer_count"] * room["computer_kw_each"]
                power += room["has_large_screen"] * room["large_screen_kw"]
                power += room["hvac_unit_count"] * room["occupied_hvac_kw_each"]
            if server:
                power += room["hvac_unit_count"] * room["server_hvac_kw_each"]
        intervals.append({
            "timestamp": (start + timedelta(minutes=minute)).isoformat(),
            "predicted_demand_kw": power, "predicted_demand_energy_kwh": power / 4,
            "power_unit": "kW", "energy_unit": "kWh", "quality": "predicted",
        })
    return {
        "building_id": building_id, "date": day, "interval_minutes": 15,
        "timezone": "Asia/Seoul", "quality": "predicted",
        "assumption": {"type": "simulation-assumption", "quality": "predicted",
                       "calibration": "not-engineering-calibrated"},
        "intervals": intervals,
        "total_energy_kwh": sum(item["predicted_demand_energy_kwh"] for item in intervals),
    }
