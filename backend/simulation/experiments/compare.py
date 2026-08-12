from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare aggregate metrics from two experiment result files.")
    parser.add_argument("baseline", type=Path)
    parser.add_argument("intervention", type=Path)
    parser.add_argument("--output", type=Path, default=Path("simulation/experiments/results/comparison.json"))
    args = parser.parse_args()
    first = json.loads(args.baseline.read_text(encoding="utf-8"))
    second = json.loads(args.intervention.read_text(encoding="utf-8"))
    comparison = {}
    for metric, baseline in first["aggregate"].items():
        intervention = second["aggregate"].get(metric, {})
        a, b = baseline.get("mean"), intervention.get("mean")
        comparison[metric] = {"baseline_mean": a, "intervention_mean": b, "difference": None if a is None or b is None else b - a}
    payload = {"baseline": first.get("scenario"), "intervention": second.get("scenario"), "metrics": comparison}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {args.output}")


if __name__ == "__main__":
    main()
