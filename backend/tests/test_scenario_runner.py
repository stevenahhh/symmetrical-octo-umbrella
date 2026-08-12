from simulation.experiments.run import aggregate_runs, run_once


def test_seeded_scenario_runner_and_aggregate():
    first = run_once("normal", seed=9, duration=0.2, step=0.1, counts_scale=0.01)
    second = run_once("normal", seed=10, duration=0.2, step=0.1, counts_scale=0.01)
    aggregate = aggregate_runs([first, second])
    assert first["seed"] == 9
    assert aggregate["conflict_count"]["mean"] is not None
    assert aggregate["conflict_count"]["ci95_low"] is not None
