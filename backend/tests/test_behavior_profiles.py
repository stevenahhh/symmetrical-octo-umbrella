import json
import random
from pathlib import Path

from simulation.behavior_manager import BehaviorManager


CONFIG = Path(__file__).resolve().parents[1] / "simulation" / "config" / "behavior_profiles.json"


def test_behavior_profiles_have_required_agent_variants():
    payload = json.loads(CONFIG.read_text(encoding="utf-8"))
    assert set(payload["car"]) == {"cautious", "normal", "aggressive"}
    assert set(payload["scooter"]) == {"safe", "normal", "aggressive"}
    assert set(payload["person"]) >= {"student", "staff", "visitor", "group", "distracted_pedestrian"}
    profile = BehaviorManager(CONFIG, random.Random(3)).choose("car", {})
    assert profile["name"] in payload["car"]
    assert profile["parameter_source"] == "implementation_specific"
