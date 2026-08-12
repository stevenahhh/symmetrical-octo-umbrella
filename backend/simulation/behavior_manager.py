from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Dict


class BehaviorManager:
    def __init__(self, path: str | Path, random_source: random.Random) -> None:
        self.config = json.loads(Path(path).read_text(encoding="utf-8"))
        self.random = random_source

    def choose(self, agent_type: str, scenario: Dict) -> Dict:
        profiles = self.config[agent_type]
        names = list(profiles)
        weights = [float(profiles[name].get("weight", 1)) for name in names]
        if agent_type == "scooter" and scenario.get("scooter", {}).get("aggressive_ratio") is not None:
            ratio = float(scenario["scooter"]["aggressive_ratio"])
            weights = [ratio if name == "aggressive" else (1 - ratio) / max(1, len(names) - 1) for name in names]
        name = self.random.choices(names, weights=weights, k=1)[0]
        values = {key: value for key, value in profiles[name].items() if key != "weight"}
        if "group_size" in values:
            low, high = values["group_size"]
            values["group_size"] = self.random.randint(int(low), int(high))
        return {"name": name, **values, "parameter_source": "implementation_specific"}
