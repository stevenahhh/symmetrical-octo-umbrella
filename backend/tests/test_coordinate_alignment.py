import json
from pathlib import Path

from simulation.tools.calibrate_coordinates import calibrate


DATA = Path(__file__).resolve().parents[1] / "simulation" / "data"


def test_derived_control_points_do_not_claim_independent_alignment():
    report = calibrate(json.loads((DATA / "coordinate_control_points.json").read_text(encoding="utf-8")))
    assert report["metrics"]["point_count"] == 5
    assert report["metrics"]["rmse"] < 1e-6
    assert report["independent_control_points"] is False
    assert report["alignment_accepted"] is False
