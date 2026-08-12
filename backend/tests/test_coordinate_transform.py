import math

import pytest

from simulation.coordinate_transform import CoordinateTransform


def test_coordinate_round_trip_with_rotation_and_inversion():
    transform = CoordinateTransform(origin={"x": 10, "y": 2, "z": -4}, scale=2, rotation_degrees=30, invert_z=True)
    three = transform.simulation_to_three(3, 1, -7)
    restored = transform.three_to_simulation(*three)
    assert restored == pytest.approx((3, 1, -7))


def test_rejects_nan_coordinates():
    transform = CoordinateTransform()
    with pytest.raises(ValueError):
        transform.simulation_to_three(math.nan, 0, 0)


def test_wgs84_and_sumo_round_trips():
    transform = CoordinateTransform(
        wgs84_reference={"longitude": 127.4764043, "latitude": 34.9700548},
        sumo_origin={"x": 12.5, "z": -7.25},
    )
    simulation = transform.wgs84_to_simulation(127.477, 34.971)
    assert transform.simulation_to_wgs84(*simulation) == pytest.approx((127.477, 34.971))
    assert transform.sumo_to_simulation(*transform.simulation_to_sumo(30, -20)) == pytest.approx((30, -20))


def test_similarity_calibration_requires_independent_acceptance_separately():
    source = [(0, 0), (10, 0), (0, 10), (10, 10), (5, 3)]
    pairs = [
        {"simulation": point, "three": [2 + point[0] * 2, 0, -3 + point[1] * 2]}
        for point in source
    ]
    transform, metrics = CoordinateTransform.fit_similarity(pairs)
    assert transform.scale == pytest.approx(2)
    assert transform.origin["x"] == pytest.approx(2)
    assert transform.origin["z"] == pytest.approx(-3)
    assert metrics["rmse"] < 1e-9
