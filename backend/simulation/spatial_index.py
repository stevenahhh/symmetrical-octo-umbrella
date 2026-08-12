from __future__ import annotations

import math
from collections import defaultdict
from typing import Dict, Iterable, Iterator, List, Tuple


class UniformSpatialGrid:
    """Dependency-free broad phase for nearby microscopic Agents."""

    def __init__(self, cell_size: float = 20.0) -> None:
        self.cell_size = max(1.0, float(cell_size))
        self.cells: Dict[Tuple[int, int], List[Dict]] = {}
        self.last_candidate_count = 0
        self.last_pair_count = 0

    def _cell(self, entity: Dict) -> Tuple[int, int]:
        return math.floor(float(entity["x"]) / self.cell_size), math.floor(float(entity["z"]) / self.cell_size)

    def pairs(self, entities: Iterable[Dict], radius: float) -> Iterator[Tuple[Dict, Dict]]:
        cells: Dict[Tuple[int, int], List[Dict]] = defaultdict(list)
        for entity in entities:
            cells[self._cell(entity)].append(entity)
        self.cells = dict(cells)
        reach = max(1, math.ceil(float(radius) / self.cell_size))
        radius_squared = float(radius) ** 2
        seen = set()
        candidates = pairs = 0
        for (cell_x, cell_z), members in cells.items():
            for offset_x in range(-reach, reach + 1):
                for offset_z in range(-reach, reach + 1):
                    for first in members:
                        for second in cells.get((cell_x + offset_x, cell_z + offset_z), ()):
                            if first is second:
                                continue
                            key = tuple(sorted((str(first["id"]), str(second["id"]))))
                            if key in seen:
                                continue
                            seen.add(key)
                            candidates += 1
                            dx = float(second["x"]) - float(first["x"])
                            dz = float(second["z"]) - float(first["z"])
                            if dx * dx + dz * dz <= radius_squared:
                                pairs += 1
                                yield first, second
        self.last_candidate_count = candidates
        self.last_pair_count = pairs
