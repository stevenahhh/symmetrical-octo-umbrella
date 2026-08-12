from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Sequence


@dataclass(frozen=True)
class Observation:
    timestamp: str
    location: str
    type: str
    direction: str
    count: float
    source: str
    world_x: float | None = None
    world_z: float | None = None


def load_observations(path: str | Path) -> List[Observation]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    values = payload.get("observations", payload) if isinstance(payload, dict) else payload
    observations = []
    for item in values:
        observations.append(Observation(
            timestamp=str(item["timestamp"]), location=str(item["location"]), type=str(item["type"]),
            direction=str(item["direction"]), count=float(item["count"]), source=str(item["source"]),
            world_x=None if item.get("world_x") is None else float(item["world_x"]),
            world_z=None if item.get("world_z") is None else float(item["world_z"]),
        ))
    return observations


def import_directional_csv(path: str | Path, location: str = "MAIN_GATE") -> List[Observation]:
    values = []
    with Path(path).open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            event = str(row.get("이벤트", ""))
            values.append(Observation(
                timestamp=str(row.get("시간") or ""), location=location, type="car",
                direction="in" if event == "입차" else "out" if event == "출차" else "unknown",
                count=1.0, source="yolo", world_x=None, world_z=None,
            ))
    return values


def metric_pair(observed: Sequence[float], simulated: Sequence[float]) -> Dict[str, float]:
    if len(observed) != len(simulated) or not observed:
        raise ValueError("observed/simulated 값은 길이가 같고 비어 있지 않아야 합니다.")
    errors = [float(simulated_value) - float(observed_value) for observed_value, simulated_value in zip(observed, simulated)]
    absolute = [abs(value) for value in errors]
    relative = [abs(error) / max(abs(float(observed_value)), 1e-9) for error, observed_value in zip(errors, observed)]
    return {
        "mae": sum(absolute) / len(absolute),
        "rmse": math.sqrt(sum(value * value for value in errors) / len(errors)),
        "mean_relative_error": sum(relative) / len(relative),
    }


def write_observations(observations: Iterable[Observation], path: str | Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"observations": [asdict(item) for item in observations]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
