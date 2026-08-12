import pytest

from simulation.calibration import metric_pair
from simulation.simulation_engine import SimulationEngine


def test_calibration_metrics_are_exact():
    metrics = metric_pair([10, 20], [12, 18])
    assert metrics["mae"] == 2
    assert metrics["rmse"] == 2
    assert metrics["mean_relative_error"] == pytest.approx(0.15)


def test_od_weights_are_normalized_and_routable():
    engine = SimulationEngine(seed=1)
    assert engine.od.validation["valid"] is True
    for profile in engine.od.validation["profiles"].values():
        assert all(value["normalized_probability_sum"] == pytest.approx(1) for value in profile.values())
