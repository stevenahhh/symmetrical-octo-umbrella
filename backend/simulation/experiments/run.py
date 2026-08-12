from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from pathlib import Path
from typing import Dict, Iterable, List

from simulation.simulation_engine import SimulationEngine


def summarize(values: Iterable[float]) -> Dict[str, float | None]:
    numbers = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    if not numbers:
        return {"mean": None, "std": None, "median": None, "ci95_low": None, "ci95_high": None}
    mean = statistics.fmean(numbers)
    std = statistics.stdev(numbers) if len(numbers) > 1 else 0.0
    margin = 1.96 * std / math.sqrt(len(numbers))
    return {"mean": mean, "std": std, "median": statistics.median(numbers), "ci95_low": mean - margin, "ci95_high": mean + margin}


def run_once(scenario: str, seed: int, duration: float, step: float, counts_scale: float = 1.0) -> Dict:
    engine = SimulationEngine(seed=seed)
    base = engine.scenarios.get(scenario)["counts"]
    counts = {key: max(0, int(round(value * counts_scale))) for key, value in base.items()}
    engine.configure(scenario, counts)
    engine.start()
    while engine.simulation_time < duration:
        engine.step(min(step, duration - engine.simulation_time))
    events = engine.risk_engine.recent_events(200)
    ttc = [event["ttc"] for event in events if event.get("ttc") is not None]
    pet = [event["pet"] for event in events if event.get("pet") is not None]
    aggregate = engine.statistics()
    active_metrics = [entity["metrics"] for entity in engine.entities.values() if entity.get("active")]
    by_type = {
        agent_type: [entity["metrics"] for entity in engine.entities.values() if entity.get("active") and entity["type"] == agent_type]
        for agent_type in ("car", "person", "scooter")
    }
    return {
        "seed": seed, "scenario": scenario, "duration": duration,
        "mean_ttc": statistics.fmean(ttc) if ttc else None, "min_ttc": min(ttc) if ttc else None,
        "mean_pet": statistics.fmean(pet) if pet else None, "min_pet": min(pet) if pet else None,
        "near_miss_count": aggregate["near_miss_count"],
        "conflict_count": len(events), "collision_count": sum(event.get("safety_event") == "COLLISION" for event in events),
        "average_travel_time": statistics.fmean(metric["travel_time"] for metric in active_metrics) if active_metrics else 0,
        "average_waiting_time": statistics.fmean(metric["waiting_time"] for metric in active_metrics) if active_metrics else 0,
        "completed_trips": sum(aggregate["completed_trips"].values()),
        "agent_metrics": {
            agent_type: {
                "count": len(metrics),
                "average_speed": statistics.fmean(value["average_speed"] for value in metrics) if metrics else 0,
                "average_waiting_time": statistics.fmean(value["waiting_time"] for value in metrics) if metrics else 0,
                "near_miss_count": sum(value["near_miss_count"] for value in metrics),
                "conflict_count": sum(value["conflict_count"] for value in metrics),
                "hard_brake_count": sum(value["hard_brake_count"] for value in metrics),
            }
            for agent_type, metrics in by_type.items()
        },
    }


def aggregate_runs(runs: List[Dict]) -> Dict:
    metric_names = ["mean_ttc", "min_ttc", "mean_pet", "min_pet", "near_miss_count", "conflict_count", "collision_count", "average_travel_time", "average_waiting_time", "completed_trips"]
    return {name: summarize(run[name] for run in runs) for name in metric_names}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run repeatable campus simulation experiments.")
    parser.add_argument("--scenario", default="normal")
    parser.add_argument("--runs", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--duration", type=float, default=300)
    parser.add_argument("--step", type=float, default=0.2)
    parser.add_argument("--counts-scale", type=float, default=1.0)
    parser.add_argument("--output", type=Path, default=Path("simulation/experiments/results"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    runs = [run_once(args.scenario, args.seed + index, args.duration, args.step, args.counts_scale) for index in range(args.runs)]
    payload = {"scenario": args.scenario, "runs": runs, "aggregate": aggregate_runs(runs)}
    json_path = args.output / f"{args.scenario}.json"
    csv_path = args.output / f"{args.scenario}.csv"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        flat_runs = [{**run, "agent_metrics": json.dumps(run["agent_metrics"], ensure_ascii=False)} for run in runs]
        writer = csv.DictWriter(handle, fieldnames=list(flat_runs[0]))
        writer.writeheader(); writer.writerows(flat_runs)
    print(f"OK: {len(runs)} runs -> {json_path}, {csv_path}")


if __name__ == "__main__":
    main()
