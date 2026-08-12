import json
from pathlib import Path

import pytest

from simulation.data_loader import DataValidationError
from simulation.route_manager import RouteManager


DATA = Path(__file__).resolve().parents[1] / "simulation" / "data"


def test_loads_routes_by_entity_type():
    manager = RouteManager(DATA / "routes.geojson")
    assert len(manager.for_type("car")) >= 3
    assert len(manager.for_type("person")) >= 3
    assert len(manager.for_type("scooter")) >= 3


def test_interpolates_non_loop_centerline_without_return_segment():
    manager = RouteManager(DATA / "routes.geojson")
    route = manager.get("campus_rz-001")
    x, z, heading, segment = manager.interpolate(route.route_id, route.total_length * 0.55)
    assert all(map(lambda value: isinstance(value, float), (x, z, heading)))
    assert segment == 0
    assert route.loop is False
    assert route.points[0] != route.points[-1]


def test_routes_use_team_road_centerlines_in_local_meters():
    payload = json.loads((DATA / "routes.geojson").read_text(encoding="utf-8"))
    assert payload["metadata"]["coordinate_status"] == "local_metric_centerlines_derived_from_team_road_polygons"
    assert len(payload["features"]) == 92
    assert all(feature["geometry"]["type"] == "LineString" for feature in payload["features"])
    assert any(
        str(location_id).startswith("CW_")
        for feature in payload["features"]
        for location_id in feature["properties"]["road_ids"]
    )


def test_rejects_invalid_geojson(tmp_path):
    path = tmp_path / "bad.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": [{"geometry": None}]}), encoding="utf-8")
    with pytest.raises(DataValidationError):
        RouteManager(path)
