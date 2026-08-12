from __future__ import annotations

import argparse
from pathlib import Path

from simulation.route_manager import RouteManager


def main() -> None:
    parser = argparse.ArgumentParser(description="시뮬레이션 routes.geojson 형식을 검사합니다.")
    parser.add_argument("path", type=Path, help="검사할 routes.geojson 경로")
    args = parser.parse_args()

    manager = RouteManager(args.path)
    counts = {
        entity_type: len(manager.for_type(entity_type))
        for entity_type in ("car", "person", "scooter")
    }
    print(f"OK: {len(manager.routes)}개 경로를 읽었습니다.")
    print(" / ".join(f"{key}={value}" for key, value in counts.items()))


if __name__ == "__main__":
    main()
