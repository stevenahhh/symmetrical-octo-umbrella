import json
import pytest

from simulation.conflict_area import ConflictAreaManager


def test_pet_is_time_between_exit_and_next_entry(tmp_path):
    path = tmp_path / "areas.json"
    path.write_text(json.dumps({"conflict_areas": [{
        "conflict_area_id": "CA_1",
        "geometry": {"type": "Polygon", "coordinates": [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]},
    }]}))
    manager = ConflictAreaManager(path)
    first = {"id": "car_1", "x": 0, "z": 0, "active": True, "visible": True}
    second = {"id": "person_1", "x": 3, "z": 0, "active": True, "visible": True}
    manager.update([first, second], 1.0)
    first["x"] = 3
    manager.update([first, second], 2.0)
    second["x"] = 0
    manager.update([first, second], 2.8)
    assert second["current_pet"] == pytest.approx(0.8)
    assert second["conflict_area_id"] == "CA_1"


def test_overlap_pet_is_zero(tmp_path):
    path = tmp_path / "areas.json"
    path.write_text(json.dumps({"conflict_areas": [{"conflict_area_id": "CA", "geometry": {"type": "Polygon", "coordinates": [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]}}]}))
    manager = ConflictAreaManager(path)
    entities = [{"id": value, "x": 0, "z": 0, "active": True, "visible": True} for value in ("a", "b")]
    manager.update(entities, 1)
    assert all(entity["current_pet"] == 0 for entity in entities)
