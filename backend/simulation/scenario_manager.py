from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Dict, List

try:
    from .data_loader import DataValidationError, load_json
except ImportError:
    from data_loader import DataValidationError, load_json


class ScenarioManager:
    def __init__(self, path: str | Path) -> None:
        payload = load_json(path)
        scenarios = payload.get("scenarios") if isinstance(payload, dict) else None
        if not isinstance(scenarios, dict) or not scenarios:
            raise DataValidationError("scenario 설정에 scenarios 객체가 필요합니다.")
        self._scenarios: Dict[str, Dict] = scenarios
        self.default = payload.get("default", next(iter(scenarios)))

    def names(self) -> List[str]:
        return list(self._scenarios)

    def get(self, name: str) -> Dict:
        if name not in self._scenarios:
            raise KeyError(f"알 수 없는 시나리오입니다: {name}")
        return deepcopy(self._scenarios[name])
