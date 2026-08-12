import fs from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

const material = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });

function mesh(geometry, color, position, rotation = [0, 0, 0], roughness) {
  const value = new THREE.Mesh(geometry, material(color, roughness));
  value.position.set(...position);
  value.rotation.set(...rotation);
  value.castShadow = true;
  return value;
}

function car(bodyColor = "#25636b", ringColor = null) {
  const group = new THREE.Group();
  group.add(mesh(new THREE.BoxGeometry(1.35, 0.75, 2.6), bodyColor, [0, 0.48, 0]));
  group.add(mesh(new THREE.BoxGeometry(1.12, 0.45, 1.2), "#d7e4e5", [0, 0.95, -0.15], [0, 0, 0], 0.35));
  for (const position of [[-0.72, 0.25, -0.75], [0.72, 0.25, -0.75], [-0.72, 0.25, 0.78], [0.72, 0.25, 0.78]]) {
    group.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 12), "#172029", position, [0, 0, Math.PI / 2]));
  }
  if (ringColor) {
    group.add(mesh(new THREE.TorusGeometry(1.55, 0.07, 8, 48), ringColor, [0, 0.07, 0], [Math.PI / 2, 0, 0]));
  }
  return group;
}

function scooter() {
  const group = new THREE.Group();
  group.add(mesh(new THREE.BoxGeometry(0.28, 0.12, 1.25), "#16866f", [0, 0.18, 0]));
  group.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.2, 8), "#263238", [0, 0.75, -0.48]));
  group.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.62, 8), "#263238", [0, 1.32, -0.48], [0, 0, Math.PI / 2]));
  for (const z of [-0.48, 0.48]) {
    group.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.09, 12), "#172029", [0, 0.18, z], [0, 0, Math.PI / 2]));
  }
  return group;
}

function person() {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CapsuleGeometry(0.22, 0.72, 5, 10), "#5b4b8a", [0, 0.72, 0]));
  group.add(mesh(new THREE.SphereGeometry(0.25, 12, 12), "#dfb69d", [0, 1.45, 0]));
  return group;
}

async function exportBinary(object, output) {
  const result = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true });
  await fs.writeFile(output, Buffer.from(result));
}

const outputDirectory = path.resolve("public/traffic");
await fs.mkdir(outputDirectory, { recursive: true });
await exportBinary(car("#25636b"), path.join(outputDirectory, "car.glb"));
await exportBinary(car("#25636b", "#eab308"), path.join(outputDirectory, "car-caution.glb"));
await exportBinary(car("#f59e0b", "#f59e0b"), path.join(outputDirectory, "car-warning.glb"));
await exportBinary(car("#dc2626", "#ef233c"), path.join(outputDirectory, "car-danger.glb"));
await exportBinary(scooter(), path.join(outputDirectory, "scooter.glb"));
await exportBinary(person(), path.join(outputDirectory, "person.glb"));
