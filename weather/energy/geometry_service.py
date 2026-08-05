"""Roof-local geometry validation for API scenario arrays."""
from __future__ import annotations
import json
import math
from contextlib import closing
from .models import PanelArray
from .persistence import Database

def _corners(array: PanelArray) -> tuple[tuple[float, float], ...]:
    across = array.module_width_m if array.orientation == "portrait" else array.module_length_m
    slope = array.module_length_m if array.orientation == "portrait" else array.module_width_m
    width = array.columns * across + (array.columns - 1) * array.inter_panel_gap_m
    depth = array.rows * slope * math.cos(math.radians(array.tilt_deg)) + (array.rows - 1) * array.inter_panel_gap_m
    angle = math.radians(array.azimuth_deg)
    ax, ay = math.cos(angle), -math.sin(angle)
    fx, fy = math.sin(angle), math.cos(angle)
    return tuple((array.origin_x_m + sx * width * ax / 2 + sy * depth * fx / 2,
                  array.origin_y_m + sx * width * ay / 2 + sy * depth * fy / 2)
                 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)))

def _bounds(points) -> tuple[float, float, float, float]:
    return min(x for x, _ in points), max(x for x, _ in points), min(y for _, y in points), max(y for _, y in points)

def _overlap(first, second) -> bool:
    for polygon in (first, second):
        for index in range(4):
            x1, y1 = polygon[index]; x2, y2 = polygon[(index + 1) % 4]
            axis = (-(y2 - y1), x2 - x1)
            left = [x * axis[0] + y * axis[1] for x, y in first]
            right = [x * axis[0] + y * axis[1] for x, y in second]
            if max(left) <= min(right) or max(right) <= min(left):
                return False
    return True

def validate_geometry(database: Database, building_id: str, arrays: tuple[PanelArray, ...]) -> list[dict]:
    violations = []
    footprints = []
    with closing(database.connect()) as connection:
        for array in arrays:
            zone = connection.execute("SELECT building_id, polygon_json, edge_margin_m FROM roof_zones WHERE roof_id=? AND id=?", (array.roof_id, array.roof_zone_id)).fetchone()
            if zone is None:
                violations.append({"code": "UNKNOWN_ROOF_ZONE", "array_id": array.id,
                    "message_en": "Array references an unknown roof zone.",
                    "message_ko": "\ubc30\uc5f4\uc774 \uc874\uc7ac\ud558\uc9c0 \uc54a\ub294 \uc625\uc0c1 \uad6c\uc5ed\uc744 \ucc38\uc870\ud569\ub2c8\ub2e4."})
                continue
            if zone["building_id"] != building_id:
                violations.append({"code": "ROOF_BUILDING_MISMATCH", "array_id": array.id,
                    "message_en": "Array roof zone belongs to another building.",
                    "message_ko": "배열의 옥상 구역이 선택한 건물에 속하지 않습니다."})
                continue
            polygon = json.loads(zone["polygon_json"])
            zone_bounds = _bounds([(point["xMeters"], point["yMeters"]) for point in polygon])
            footprint = _corners(array); footprints.append((array, footprint))
            margin = zone["edge_margin_m"]
            left, right, bottom, top = _bounds(footprint)
            if left < zone_bounds[0] + margin or right > zone_bounds[1] - margin or bottom < zone_bounds[2] + margin or top > zone_bounds[3] - margin:
                violations.append({"code": "ROOF_EDGE_MARGIN", "array_id": array.id,
                    "message_en": f"Array must remain at least {margin:.2f} m from the roof edge.",
                    "message_ko": f"\ubc30\uc5f4\uc740 \uc625\uc0c1 \uac00\uc7a5\uc790\ub9ac\uc5d0\uc11c {margin:.2f}m \uc774\uc0c1 \ub5a8\uc5b4\uc838\uc57c \ud569\ub2c8\ub2e4."})
            obstacles = connection.execute("SELECT id, polygon_json, clearance_m FROM roof_obstacles WHERE roof_id=? AND roof_zone_id=?", (array.roof_id, array.roof_zone_id)).fetchall()
            for obstacle in obstacles:
                points = json.loads(obstacle["polygon_json"])
                ox1, ox2, oy1, oy2 = _bounds([(p["xMeters"], p["yMeters"]) for p in points])
                clearance = obstacle["clearance_m"]
                if left < ox2 + clearance and right > ox1 - clearance and bottom < oy2 + clearance and top > oy1 - clearance:
                    violations.append({"code": "OBSTACLE_CLEARANCE", "array_id": array.id, "obstacle_id": obstacle["id"],
                        "message_en": "Array violates obstacle clearance.",
                        "message_ko": "\ubc30\uc5f4\uc774 \uc7a5\uc560\ubb3c \uc548\uc804 \uac70\ub9ac\ub97c \uce68\ubc94\ud569\ub2c8\ub2e4."})
    for index, (array, footprint) in enumerate(footprints):
        for other, other_footprint in footprints[index + 1:]:
            if _overlap(footprint, other_footprint):
                violations.append({"code": "ARRAY_OVERLAP", "array_id": array.id, "other_array_id": other.id,
                    "message_en": "Panel arrays overlap.", "message_ko": "\ud328\ub110 \ubc30\uc5f4\uc774 \uc11c\ub85c \uacb9\uce69\ub2c8\ub2e4."})
    return violations
