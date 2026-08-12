from __future__ import annotations

import argparse
import json
from pathlib import Path

from simulation.coordinate_transform import CoordinateTransform


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def calibrate(payload: dict) -> dict:
    points = payload.get("control_points") or []
    if len(points) < 5:
        raise ValueError("alignment 검증에는 기준점이 최소 5개 필요합니다.")
    candidates = [CoordinateTransform.fit_similarity(points, False), CoordinateTransform.fit_similarity(points, True)]
    transform, metrics = min(candidates, key=lambda item: item[1]["rmse"])
    independent = all(item.get("independent", False) for item in points)
    threshold = float(payload.get("acceptance_rmse_meters", 2.0))
    return {
        "transform": transform.as_dict(),
        "metrics": {**metrics, "acceptance_rmse_meters": threshold},
        "independent_control_points": independent,
        "alignment_accepted": independent and metrics["rmse"] <= threshold,
        "note": "Low RMSE is not survey validation unless every control point is independent.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fit and validate simulation↔Three.js alignment from 5+ control points.")
    parser.add_argument("points", nargs="?", type=Path, default=DATA / "coordinate_control_points.json")
    parser.add_argument("--output", type=Path, default=DATA / "coordinate_alignment_report.json")
    args = parser.parse_args()
    report = calibrate(json.loads(args.points.read_text(encoding="utf-8")))
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(0 if report["alignment_accepted"] else 2)


if __name__ == "__main__":
    main()
