from __future__ import annotations

import argparse
from pathlib import Path

from simulation.calibration import import_directional_csv, write_observations


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert the YOLO directional CSV into the shared observation schema.")
    parser.add_argument("csv", type=Path)
    parser.add_argument("--location", default="MAIN_GATE")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    observations = import_directional_csv(args.csv, args.location)
    write_observations(observations, args.output)
    print(f"OK: {len(observations)} observations -> {args.output}")


if __name__ == "__main__":
    main()
