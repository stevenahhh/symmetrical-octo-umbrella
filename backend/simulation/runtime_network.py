from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Tuple

try:
    from .data_loader import load_json
    from .network_schema import load_feature_collection, load_policy
except ImportError:
    from data_loader import load_json
    from network_schema import load_feature_collection, load_policy


def load_runtime_graph(data_dir: Path, mode: str | None = None) -> Tuple[Dict, Dict]:
    """Build the runtime Graph from the transport Source of Truth.

    transport-derived is the development default. Research mode refuses to
    start without approved geometry instead of silently using derived lines.
    """
    selected = str(mode or os.getenv("SIMULATION_NETWORK_MODE", "transport-derived")).strip().lower()
    if selected == "legacy":
        graph = load_json(data_dir / "mobility_graph.json")
        return graph, {"mode": selected, "valid": True, "source": "mobility_graph.json", "derived_allowed": True}
    if selected not in {"transport-derived", "transport-authoritative", "research"}:
        raise ValueError(f"알 수 없는 SIMULATION_NETWORK_MODE입니다: {selected}")

    network_path = data_dir / "campus_transport_network.geojson"
    policy_path = data_dir.parent / "config" / "mobility_policy.json"
    try:
        from .tools.build_graph import build
        from .tools.validate_network import validate
    except ImportError:
        from tools.build_graph import build
        from tools.validate_network import validate
    network = load_feature_collection(network_path)
    policy = load_policy(policy_path)
    report = validate(network, policy)
    if not report["valid"]:
        raise ValueError(f"통합 교통망 검증에 실패했습니다: {report['errors']}")
    authoritative_only = selected in {"transport-authoritative", "research"}
    graph = build(network, policy, authoritative_only=authoritative_only)
    if not graph["edges"]:
        raise ValueError(
            "승인된(authoritative=true) Runtime Edge가 없습니다. "
            "연구 모드에서는 파생 경로로 실행하지 않습니다."
        )
    graph["metadata"].update({
        "runtime_mode": selected,
        "derived_allowed": not authoritative_only,
        "validation_errors": len(report["errors"]),
        "validation_warnings": len(report["warnings"]),
    })
    return graph, {"mode": selected, "valid": True, "source": str(network_path.name), "derived_allowed": not authoritative_only, "quality": report["summary"]}
