import React, { useEffect, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export function CityModel({ onSelect, selectedId, onBuildingClick, ...props }) {
  const { scene } = useGLTF("/uni.glb");
  const { camera, controls } = useThree();
  const [targetPos, setTargetPos] = useState(null);

  useEffect(() => {
    if (controls) {
      const handleInteraction = () => setTargetPos(null);
      controls.addEventListener("start", handleInteraction);
      return () => controls.removeEventListener("start", handleInteraction);
    }
  }, [controls]);

  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.material = child.material.clone();
          if (!child.userData.originalColor && child.material.color) {
            child.userData.originalColor = child.material.color.clone();
          }
        }
      });
    }
  }, [scene]);

  useFrame(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child.isMesh && child.userData.originalColor) {
          const parentName =
            child.parent && child.parent.name !== "Scene"
              ? child.parent.name
              : child.name;
          const isSelected =
            parentName === selectedId || child.name === selectedId;
          const targetColor = isSelected
            ? new THREE.Color("#ffb8c6")
            : child.userData.originalColor;
          child.material.color.lerp(targetColor, 0.05);
        }
      });
    }

    if (targetPos && controls) {
      controls.target.lerp(targetPos, 0.08);
      const desiredCamPos = targetPos
        .clone()
        .add(new THREE.Vector3(40, 40, 40));
      camera.position.lerp(desiredCamPos, 0.04);
      controls.update();
    }
  });

  const handleClick = (e) => {
    if (e.delta > 2) return;

    let name =
      e.object.parent && e.object.parent.name !== "Scene"
        ? e.object.parent.name
        : e.object.name;

    if (name && name.includes("학교")) return;

    e.stopPropagation();

    if (!name || name === "") name = "알 수 없는 객체";

    const box = new THREE.Box3().setFromObject(e.object);
    const center = box.getCenter(new THREE.Vector3());
    setTargetPos(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const area = Math.round(size.x * 20 * (size.z * 20));

    if (onSelect) onSelect(name, area);

    if (onBuildingClick) {
      const buildingMap = {
        대학본부: "BLD_A1",
        약학대학: "BLD_A2",
        천연물신약연구소: "BLD_A3",
        생활관: "BLD_A4",
        박물관: "BLD_B1",
        "70주년기념관": "BLD_B2",
        생명대: "BLD_B3",
        도서관: "BLD_C1",
        학생회관: "BLD_E1",
        사범대: "BLD_E2",
        공과대학: "BLD_D1",
        공과대1호: "BLD_D1",
        공과대2호: "BLD_D2",
        공과대3호: "BLD_D3",
        창업보육센터: "BLD_D4",
      };

      const elementId = buildingMap[name] || name;

      // ★ App.jsx의 handleBuildingClick이 기대하는 객체 형태로 전달
      onBuildingClick({
        name: elementId,
        parent: { name: elementId },
      });
    }
  };

  return (
    <primitive
      object={scene}
      {...props}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    />
  );
}

// ★ 수정: uni.glb 경로 명시
useGLTF.preload("/uni.glb");
