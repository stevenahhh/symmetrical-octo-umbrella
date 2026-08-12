from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from xml.etree import ElementTree

from simulation.calibration import metric_pair


def load_custom(path: Path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    events = payload.get("events", payload) if isinstance(payload, dict) else payload
    return [float(event["ttc"]) for event in events if event.get("ttc") is not None]


def load_ssm(path: Path):
    root = ElementTree.parse(path).getroot()
    values = []
    for element in root.iter():
        for key in ("minTTC", "ttc", "TTC"):
            if element.get(key) is not None:
                value = float(element.get(key))
                if math.isfinite(value): values.append(value)
                break
    return values


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare ordered custom TTC events with SUMO SSM TTC output.")
    parser.add_argument("custom_events", type=Path)
    parser.add_argument("sumo_ssm", type=Path)
    parser.add_argument("--output", type=Path, default=Path("simulation/experiments/results/ssm_comparison.json"))
    args = parser.parse_args()
    custom, ssm = load_custom(args.custom_events), load_ssm(args.sumo_ssm)
    count = min(len(custom), len(ssm))
    if not count:
        raise SystemExit("비교 가능한 TTC 값이 없습니다.")
    payload = {
        "matching": "ordered comparison; configure stable event IDs before research validation",
        "pair_count": count, "custom_ttc": custom[:count], "sumo_ssm_ttc": ssm[:count],
        "metrics": metric_pair(custom[:count], ssm[:count]),
        "scope_note": "SUMO SSM pedestrian coverage is not assumed.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {args.output}")


if __name__ == "__main__":
    main()
