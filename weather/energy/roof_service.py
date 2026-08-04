"""Typed access to persisted roof geometry for editor clients."""
from __future__ import annotations

import json
from contextlib import closing
from dataclasses import dataclass

from .persistence import Database


@dataclass(frozen=True)
class RoofPoint:
    x_meters: float
    y_meters: float


@dataclass(frozen=True)
class RoofZone:
    id: str
    polygon_meters: tuple[RoofPoint, ...]


@dataclass(frozen=True)
class RoofObstacle:
    id: str
    roof_zone_id: str
    polygon_meters: tuple[RoofPoint, ...]


@dataclass(frozen=True)
class Roof:
    id: str
    zones: tuple[RoofZone, ...]
    obstacles: tuple[RoofObstacle, ...]


def _points(raw: str) -> tuple[RoofPoint, ...]:
    return tuple(RoofPoint(x_meters=point["xMeters"], y_meters=point["yMeters"])
                 for point in json.loads(raw))


def building_roofs(database: Database, building_id: str) -> tuple[Roof, ...]:
    """Load seeded/persisted roof zones and obstacles with deterministic ordering."""
    with closing(database.connect()) as connection:
        zone_rows = connection.execute(
            "SELECT id, roof_id, polygon_json FROM roof_zones "
            "WHERE building_id=? ORDER BY roof_id, id", (building_id,),
        ).fetchall()
        obstacle_rows = connection.execute(
            "SELECT o.id, o.roof_id, o.roof_zone_id, o.polygon_json "
            "FROM roof_obstacles o JOIN roof_zones z ON z.id=o.roof_zone_id "
            "WHERE z.building_id=? ORDER BY o.roof_id, o.id", (building_id,),
        ).fetchall()

    roof_ids = tuple(dict.fromkeys(row["roof_id"] for row in zone_rows))
    return tuple(Roof(
        id=roof_id,
        zones=tuple(RoofZone(id=row["id"], polygon_meters=_points(row["polygon_json"]))
                    for row in zone_rows if row["roof_id"] == roof_id),
        obstacles=tuple(RoofObstacle(
            id=row["id"], roof_zone_id=row["roof_zone_id"],
            polygon_meters=_points(row["polygon_json"]),
        ) for row in obstacle_rows if row["roof_id"] == roof_id),
    ) for roof_id in roof_ids)
