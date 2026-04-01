import React, { useRef } from "react";
import { useGLTF } from "@react-three/drei";

export function CityModel({ onSelect, ...props }) {
  const { nodes, materials } = useGLTF("/City.glb");

  const handleClick = (e, name) => {
    e.stopPropagation();
    if (onSelect) onSelect(name);
  };

  return (
    <group {...props} dispose={null}>
      {/* 학교001 그룹 */}
      <group
        onClick={(e) => handleClick(e, '학교 건물')}
        rotation={[Math.PI / 2, 0, 0]}
        onPointerOver={() => document.body.style.cursor = 'pointer'}
        onPointerOut={() => document.body.style.cursor = 'auto'}
      >
        <mesh castShadow receiveShadow geometry={nodes.학교001.geometry} material={materials["sandybrown.003"]} />
        <mesh castShadow receiveShadow geometry={nodes.학교001_1.geometry} material={materials["lightgreen.003"]} />
        <mesh castShadow receiveShadow geometry={nodes.학교001_2.geometry} material={materials["Blacktop_Old_01.003"]} />
        <mesh castShadow receiveShadow geometry={nodes.학교001_3.geometry} material={materials["red.003"]} />
        <mesh castShadow receiveShadow geometry={nodes.학교001_4.geometry} material={materials["FrontColor.003"]} />
      </group>

      {/* Mesh423 그룹 */}
      <group
        onClick={(e) => handleClick(e, '부속 건물')}
        onPointerOver={() => document.body.style.cursor = 'pointer'}
        onPointerOut={() => document.body.style.cursor = 'auto'}
      >
        <mesh castShadow receiveShadow geometry={nodes.Mesh423.geometry} material={materials["lightgreen.002"]} />
        <mesh castShadow receiveShadow geometry={nodes.Mesh423_1.geometry} material={materials["Blacktop_Old_01.002"]} />
        <mesh castShadow receiveShadow geometry={nodes.Mesh423_2.geometry} material={materials["FrontColor.002"]} />
        <mesh castShadow receiveShadow geometry={nodes.Mesh423_3.geometry} material={materials["red.002"]} />
        <mesh castShadow receiveShadow geometry={nodes.Mesh423_4.geometry} material={materials["sandybrown.002"]} />
      </group>
    </group>
  );
}

useGLTF.preload("/City.glb");
