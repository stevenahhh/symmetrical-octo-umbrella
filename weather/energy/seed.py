"""Deterministic D4 seed data, with typed extension records for more buildings."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import Iterable

_SEED_TIMESTAMP = "2026-01-01T00:00:00+09:00"
_WEEKDAYS = ("\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08")
_SUBJECTS = ("\ucea1\uc2a4\ud1a4\ub514\uc790\uc778", "\uc790\ub8cc\uad6c\uc870", "\ucef4\ud4e8\ud130\ub124\ud2b8\uc6cc\ud06c",
             "\ub514\uc9c0\ud138\ub17c\ub9ac\ud68c\ub85c", "\uc778\uacf5\uc9c0\ub2a5", "\uc804\ub825\uc2dc\uc2a4\ud15c",
             "\uc18c\ud504\ud2b8\uc6e8\uc5b4\uacf5\ud559", "\uacf5\ud559\uc218\ud559")
_ROOM_NUMBERS = {
    1: tuple(str(value) for value in range(101, 115)),
    2: tuple(str(value) for value in range(201, 217)),
    3: tuple(str(value) for value in range(301, 318)),
    4: tuple(str(value) for value in range(401, 415)),
    5: tuple(str(value) for value in range(501, 508)),
    6: ("601",),
}
_SPECIAL = {
    "108": ("computer_lab", "medium", 34, True),
    "204": ("lab", "medium", 0, False),
    "305": ("server", "small", 0, False),
    "401": ("faculty", "small", 0, False),
    "410": ("faculty", "small", 0, False),
    "501": ("lab", "medium", 0, True),
    "601": ("lab", "large", 0, True),
}


@dataclass(frozen=True)
class SeedEvent:
    id: str
    weekday: str
    start_minute: int
    duration_minutes: int
    subject: str
    professor_id: str


@dataclass(frozen=True)
class SeedRoom:
    id: str
    room_number: str
    floor_number: int
    wing_id: str
    room_size: str
    room_type: str
    computer_count: int
    has_large_screen: bool
    hvac_unit_count: int
    events: tuple[SeedEvent, ...]


@dataclass(frozen=True)
class SeedRoofZone:
    id: str
    roof_id: str
    polygon: tuple[dict[str, float], ...]
    edge_margin_m: float = 0.5


@dataclass(frozen=True)
class SeedBuilding:
    id: str
    display_name: str
    rooms: tuple[SeedRoom, ...]
    roof_zones: tuple[SeedRoofZone, ...]


def _events(room_id: str, room_number: str, index: int) -> tuple[SeedEvent, ...]:
    if (int(room_number) >= 500 and room_number != "601") or room_number == "305":
        return ()
    raw = (
        (index % 5, 9 + index % 5, 3 if index % 3 == 0 else 2, index % 8, index % 9),
        ((index + 2) % 5, 13 + index % 4, 2, (index + 3) % 8, (index + 3) % 9),
    )
    return tuple(SeedEvent(
        id=f"{room_id}-event-{event_index + 1}", weekday=_WEEKDAYS[weekday_index],
        start_minute=start_hour * 60, duration_minutes=duration_hours * 60,
        subject=_SUBJECTS[subject_index], professor_id=f"P-{professor_index + 1:02d}",
    ) for event_index, (weekday_index, start_hour, duration_hours,
                        subject_index, professor_index) in enumerate(raw))


def _d4_rooms() -> tuple[SeedRoom, ...]:
    rooms: list[SeedRoom] = []
    for floor, room_numbers in _ROOM_NUMBERS.items():
        for room_index, number in enumerate(room_numbers):
            room_id = f"d4-{number}"
            room_type, special_size, computers, screen = _SPECIAL.get(
                number, ("classroom", "", 0, room_index % 3 == 0))
            size = special_size or ("large" if room_index % 5 == 0 else
                                    "medium" if room_index % 2 == 0 else "small")
            rooms.append(SeedRoom(
                id=room_id, room_number=number, floor_number=floor,
                wing_id="right" if number == "601" or room_index % 2 else "left",
                room_size=size, room_type=room_type, computer_count=computers,
                has_large_screen=screen,
                hvac_unit_count=2 if room_type == "server" or room_index % 4 == 0 else 1,
                events=_events(room_id, number, floor * 20 + room_index),
            ))
    return tuple(rooms)


D4_BUILDINGS = (SeedBuilding(
    id="D4", display_name="D4 / \uacf5\ub300 3\ud638\uad00", rooms=_d4_rooms(),
    roof_zones=(SeedRoofZone(
        id="D4-roof-west-main", roof_id="D4-roof-west",
        polygon=({"xMeters": 0, "yMeters": 0}, {"xMeters": 31, "yMeters": 0},
                 {"xMeters": 31, "yMeters": 51.2}, {"xMeters": 0, "yMeters": 51.2}),
    ),),
),)


def _comparison_room(building_id: str, room_number: str, room_type: str = "classroom") -> SeedRoom:
    room_id = f"{building_id.lower()}-{room_number}"
    return SeedRoom(
        id=room_id, room_number=room_number, floor_number=1, wing_id="main",
        room_size="medium", room_type=room_type, computer_count=0,
        has_large_screen=True, hvac_unit_count=1,
        events=(SeedEvent(
            id=f"{room_id}-event-1", weekday="\uc6d4", start_minute=540,
            duration_minutes=180, subject="\ucea0\ud37c\uc2a4 \uc5d0\ub108\uc9c0", professor_id="P-01",
        ),),
    )


def _rectangular_building(building_id: str, display_name: str, width: float, length: float) -> SeedBuilding:
    roof_id = f"{building_id}-roof-main"
    return SeedBuilding(
        id=building_id, display_name=display_name,
        rooms=(_comparison_room(building_id, "101"),),
        roof_zones=(SeedRoofZone(
            id=f"{roof_id}-zone", roof_id=roof_id,
            polygon=({"xMeters": 0, "yMeters": 0}, {"xMeters": width, "yMeters": 0},
                     {"xMeters": width, "yMeters": length}, {"xMeters": 0, "yMeters": length}),
        ),),
    )


CAMPUS_BUILDINGS = D4_BUILDINGS + (
    _rectangular_building("D2", "D2 / \uacf5\ub300 1\ud638\uad00", 28, 42),
    _rectangular_building("D3", "D3 / \uacf5\ub300 2\ud638\uad00", 30, 46),
    _rectangular_building("D1", "D1 / \ucc3d\uc5c5\ubcf4\uc721\uc13c\ud130", 24, 36),
    SeedBuilding(id="C1", display_name="C1 / \ub3c4\uc11c\uad00", rooms=(_comparison_room("C1", "101"),), roof_zones=()),
)

D4_SEED_COUNTS = {
    "buildings": 5, "rooms": 73, "timetable_events": 126, "load_profiles": 5,
    "roof_zones": 4, "roof_obstacles": 1, "scenarios": 4,
    "panel_arrays": 4, "scenario_intervals": 0,
}


def _seed_profiles(connection: sqlite3.Connection) -> None:
    profiles = (("classroom", .2, .4), ("computer_lab", .8, .8),
                ("lab", 1., 2.), ("faculty", .4, .8), ("server", 6., 0.))
    connection.executemany(
        "INSERT OR IGNORE INTO load_profiles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ((f"load-profile-{kind}-v1", kind, standby, plug, .6, 1., 1.5, .15,
          .3, 2.5, 1.25, "predicted", "simulation-assumption",
          "not-engineering-calibrated") for kind, standby, plug in profiles),
    )


def _seed_building(connection: sqlite3.Connection, building: SeedBuilding) -> None:
    connection.execute(
        "INSERT OR IGNORE INTO buildings VALUES (?,?,?,?,?,?)",
        (building.id, building.display_name, "Asia/Seoul", "predicted",
         "simulation-assumption", _SEED_TIMESTAMP),
    )
    for room in building.rooms:
        connection.execute(
            "INSERT OR IGNORE INTO rooms VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (room.id, building.id, f"load-profile-{room.room_type}-v1",
             room.room_number, room.floor_number, room.wing_id, room.room_size,
             room.room_type, room.computer_count, int(room.has_large_screen),
             room.hvac_unit_count, "predicted"),
        )
        connection.executemany(
            "INSERT OR IGNORE INTO timetable_events VALUES (?,?,?,?,?,?,?)",
            ((event.id, room.id, event.weekday, event.start_minute,
              event.duration_minutes, event.subject, event.professor_id)
             for event in room.events),
        )
    for zone in building.roof_zones:
        connection.execute(
            "INSERT OR IGNORE INTO roof_zones VALUES (?,?,?,?,?,?)",
            (zone.id, zone.roof_id, building.id, "roof-local-meters",
             json.dumps(zone.polygon, ensure_ascii=False, separators=(",", ":")),
             zone.edge_margin_m),
        )


def _seed_comparison_scenarios(connection: sqlite3.Connection) -> None:
    fixtures = (
        ("D1", 2, 5, 20.0),
        ("D2", 2, 6, 22.0),
        ("D3", 2, 7, 30.0),
    )
    for building_id, rows, columns, tilt in fixtures:
        scenario_id = f"{building_id}-scenario-campus-baseline"
        roof_id = f"{building_id}-roof-main"
        connection.execute(
            "INSERT OR IGNORE INTO scenarios VALUES (?,?,?,?,?,?)",
            (scenario_id, building_id, f"{building_id} campus baseline", "clear", _SEED_TIMESTAMP, _SEED_TIMESTAMP),
        )
        connection.execute(
            "INSERT OR IGNORE INTO panel_arrays VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (f"{building_id}-array-baseline", scenario_id, roof_id, f"{roof_id}-zone",
             "module-default-441wp", 12., 10., rows, columns, 180., tilt,
             "portrait", 1.05, 2.1, 20., 441., .02),
        )


def _seed_d4_fixture(connection: sqlite3.Connection) -> None:
    polygon = ({"xMeters": 2, "yMeters": 20}, {"xMeters": 6, "yMeters": 20},
               {"xMeters": 6, "yMeters": 26}, {"xMeters": 2, "yMeters": 26})
    connection.execute(
        "INSERT OR IGNORE INTO roof_obstacles VALUES (?,?,?,?,?)",
        ("D4-roof-west-stairwell", "D4-roof-west", "D4-roof-west-main",
         json.dumps(polygon, separators=(",", ":")), 1.0),
    )
    connection.execute(
        "INSERT OR IGNORE INTO scenarios VALUES (?,?,?,?,?,?)",
        ("D4-scenario-south-2x8", "D4", "D4 south 2x8 fixture", "clear",
         _SEED_TIMESTAMP, _SEED_TIMESTAMP),
    )
    connection.execute(
        "INSERT OR IGNORE INTO panel_arrays VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("D4-array-south-2x8", "D4-scenario-south-2x8", "D4-roof-west",
         "D4-roof-west-main", "module-default-441wp", 10., 10., 2, 8, 180.,
         25., "portrait", 1.05, 2.1, 20., 441., .02),
    )


def seed_buildings(
    connection: sqlite3.Connection,
    buildings: Iterable[SeedBuilding] = D4_BUILDINGS,
) -> None:
    """Idempotently add typed building fixtures; pass more records to extend campus seed."""
    with connection:
        _seed_profiles(connection)
        for building in buildings:
            _seed_building(connection, building)
        ids = {building.id for building in buildings}
        if "D4" in ids:
            _seed_d4_fixture(connection)
        if {"D1", "D2", "D3"} <= ids:
            _seed_comparison_scenarios(connection)
