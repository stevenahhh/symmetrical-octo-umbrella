from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path
from xml.etree.ElementTree import Element, ElementTree, SubElement

from simulation.network_schema import iter_features, load_feature_collection


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SUMO = ROOT / "sumo"


def write_xml(root: Element, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def prepare(network: dict, output: Path) -> dict:
    node_features = {feature.feature_id: feature for feature in iter_features(network, "node")}
    nodes = Element("nodes")
    for node_id, feature in node_features.items():
        SubElement(nodes, "node", id=node_id, x=str(feature.coordinates[0]), y=str(feature.coordinates[1]), type="priority")
    edges_xml = Element("edges")
    included = []
    for feature in iter_features(network, "edge"):
        props = feature.properties
        if props.get("derived") or not props.get("authoritative", False):
            continue
        allowed = set(props.get("allowed_types") or ())
        if not allowed:
            continue
        sumo_allow = []
        if "car" in allowed: sumo_allow.append("passenger")
        if "person" in allowed: sumo_allow.append("pedestrian")
        if "scooter" in allowed: sumo_allow.append("bicycle")
        attributes = {
            "id": feature.feature_id, "from": str(props["from_node"]), "to": str(props["to_node"]),
            "numLanes": "1", "speed": str(float(props.get("speed_limit") or 10) / 3.6),
            "allow": " ".join(sumo_allow),
            "shape": " ".join(f"{point[0]},{point[1]}" for point in feature.coordinates),
        }
        SubElement(edges_xml, "edge", **attributes)
        included.append(feature.feature_id)
    write_xml(nodes, output / "campus.nod.xml")
    write_xml(edges_xml, output / "campus.edg.xml")

    routes = Element("routes")
    SubElement(routes, "vType", id="car_cautious", vClass="passenger", accel="1.5", decel="3.2", emergencyDecel="6.0", minGap="7.0", tau="1.8")
    SubElement(routes, "vType", id="car_normal", vClass="passenger", accel="2.0", decel="4.5", emergencyDecel="7.0", minGap="6.0", tau="1.4")
    SubElement(routes, "vType", id="car_aggressive", vClass="passenger", accel="2.6", decel="5.0", emergencyDecel="8.0", minGap="4.0", tau="1.0")
    SubElement(routes, "vType", id="e_scooter_safe", vClass="bicycle", accel="1.3", decel="3.0", emergencyDecel="5.5", length="1.2", width="0.65", minGap="2.5", maxSpeed="5.5")
    SubElement(routes, "vType", id="e_scooter_normal", vClass="bicycle", accel="1.7", decel="3.2", emergencyDecel="6.0", length="1.2", width="0.65", minGap="2.0", maxSpeed="6.94")
    SubElement(routes, "vType", id="e_scooter_aggressive", vClass="bicycle", accel="2.2", decel="3.8", emergencyDecel="7.0", length="1.2", width="0.65", minGap="1.4", maxSpeed="8.3")
    write_xml(routes, output / "campus.rou.xml")
    write_xml(Element("routes"), output / "campus.person.xml")
    write_xml(Element("additional"), output / "campus.add.xml")
    write_xml(Element("additional"), output / "detectors.add.xml")
    write_xml(Element("additional"), output / "traffic_lights.add.xml")

    netconvert = shutil.which("netconvert")
    net_path = output / "campus.net.xml"
    built = False
    error = None
    if netconvert and included:
        result = subprocess.run([netconvert, "--node-files", str(output / "campus.nod.xml"), "--edge-files", str(output / "campus.edg.xml"), "--output-file", str(net_path)], capture_output=True, text=True)
        built = result.returncode == 0
        error = None if built else result.stderr.strip()
    config = Element("configuration")
    input_node = SubElement(config, "input")
    SubElement(input_node, "net-file", value="campus.net.xml")
    SubElement(input_node, "route-files", value="campus.rou.xml,campus.person.xml")
    SubElement(input_node, "additional-files", value="campus.add.xml,detectors.add.xml,traffic_lights.add.xml")
    time_node = SubElement(config, "time")
    SubElement(time_node, "begin", value="0")
    SubElement(time_node, "step-length", value="0.1")
    write_xml(config, output / "campus.sumocfg")
    status = {
        "authoritative_edges_exported": len(included), "netconvert_available": bool(netconvert),
        "campus_net_built": built, "error": error,
        "ready": built and net_path.exists(),
        "note": "Derived/unapproved geometry is deliberately excluded from SUMO network generation.",
    }
    (output / "generation_status.json").write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return status


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare SUMO inputs from authoritative transport-network features.")
    parser.add_argument("--network", type=Path, default=DATA / "campus_transport_network.geojson")
    parser.add_argument("--output", type=Path, default=SUMO)
    args = parser.parse_args()
    status = prepare(load_feature_collection(args.network), args.output)
    print(json.dumps(status, ensure_ascii=False))
    raise SystemExit(0 if status["ready"] else 2)


if __name__ == "__main__":
    main()
