from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


class DataValidationError(ValueError):
    """Raised when a simulation data file is missing or malformed."""


def load_json(path: str | Path) -> Any:
    target = Path(path)
    if not target.exists():
        raise DataValidationError(f"데이터 파일을 찾을 수 없습니다: {target}")
    try:
        text = target.read_text(encoding="utf-8").strip()
        if not text:
            raise DataValidationError(f"데이터 파일이 비어 있습니다: {target}")
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise DataValidationError(f"올바르지 않은 JSON입니다: {target}: {exc}") from exc


def load_feature_collection(path: str | Path) -> Dict[str, Any]:
    payload = load_json(path)
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise DataValidationError("GeoJSON 루트는 FeatureCollection이어야 합니다.")
    if not isinstance(payload.get("features"), list):
        raise DataValidationError("GeoJSON features는 배열이어야 합니다.")
    return payload
