from simulation.providers.internal_provider import InternalSimulationProvider
from simulation.providers.sumo_provider import SumoSimulationProvider
from simulation.traci_adapter import create_provider


def test_missing_sumo_binary_falls_back_to_internal(monkeypatch):
    monkeypatch.setenv("SIMULATION_PROVIDER", "sumo")
    monkeypatch.setenv("SUMO_BINARY", "definitely-not-a-sumo-binary")
    provider, message = create_provider()
    assert isinstance(provider, InternalSimulationProvider)
    assert "찾을 수 없습니다" in message


def test_missing_sumo_network_is_rejected_before_traci_import(monkeypatch, tmp_path):
    config = tmp_path / "campus.sumocfg"
    config.write_text(
        '<configuration><input><net-file value="campus.net.xml"/></input></configuration>',
        encoding="utf-8",
    )
    monkeypatch.setattr("simulation.providers.sumo_provider.shutil.which", lambda _: "/usr/bin/sumo")

    try:
        SumoSimulationProvider(config_path=str(config))
    except RuntimeError as exc:
        assert "SUMO network" in str(exc)
    else:
        raise AssertionError("존재하지 않는 SUMO network가 허용되었습니다.")
