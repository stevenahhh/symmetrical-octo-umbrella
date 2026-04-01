import React, { useEffect, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export function CityModel({ onSelect, selectedId, ...props }) {
  const { scene } = useGLTF("/City2.glb");
  const { camera, controls } = useThree();
  const [targetPos, setTargetPos] = useState(null);

  useEffect(() => {
    if (controls) {
      const handleInteraction = () => setTargetPos(null);
      controls.addEventListener('start', handleInteraction);
      return () => controls.removeEventListener('start', handleInteraction);
    }
  }, [controls]);

  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // clone original color only once
          child.material = child.material.clone();
          if (!child.userData.originalColor && child.material.color) {
            child.userData.originalColor = child.material.color.clone();
          }
        }
      });
    }
  }, [scene]);

  useFrame((state, delta) => {
    if (scene) {
      scene.traverse((child) => {
        if (child.isMesh && child.userData.originalColor) {
          const parentName = child.parent && child.parent.name !== 'Scene' ? child.parent.name : child.name;
          const isSelected = (parentName === selectedId || child.name === selectedId);
          // ��ũ�迭�� ���� ����/���̶���Ʈ
          const targetColor = isSelected ? new THREE.Color("#ffb8c6") : child.userData.originalColor;
          child.material.color.lerp(targetColor, 0.05);
        }
      });
    }

    if (targetPos && controls) {
      controls.target.lerp(targetPos, 0.08);
      // �������� �ξ� �ڿ������� ���� �ü� Ȯ��
      const desiredCamPos = targetPos.clone().add(new THREE.Vector3(40, 40, 40));
      camera.position.lerp(desiredCamPos, 0.04);
      controls.update();
    }
  });

  const handleClick = (e) => {
    if (e.delta > 2) return;

    let name = e.object.parent && e.object.parent.name !== 'Scene'
      ? e.object.parent.name
      : e.object.name;

    if (name && name.includes('학교')) return;

    e.stopPropagation();

    if (!name || name === '') name = '알 수 없는 객체';

    const box = new THREE.Box3().setFromObject(e.object);
    const center = box.getCenter(new THREE.Vector3());
    setTargetPos(center);

    // Calculate actual roof area (X * Z) in square meters
    const size = new THREE.Vector3();
    box.getSize(size);
    // Apply a realistic scaling factor if necessary, e.g. * 100 for visual scale to real-world
    const area = Math.round((size.x * 20) * (size.z * 20));

    if (onSelect) onSelect(name, area);
  };

  return (
    <primitive
      object={scene}
      {...props}
      onClick={handleClick}
      onPointerOver={(e) => {
        let name = e.object.parent && e.object.parent.name !== 'Scene' ? e.object.parent.name : e.object.name;
        if (name && name.includes('학교')) return;
        
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    />
  );
}

useGLTF.preload("/City2.glb");
