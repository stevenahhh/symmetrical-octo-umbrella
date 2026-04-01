/* 주아리 님이 주신 '학교001', 'Mesh423' 노드가 포함된 최신 코드입니다. 
   파일 경로만 /City.glb로 수정했습니다.
*/
import React from "react";
import { useGLTF } from "@react-three/drei";

export function CityModel(props) {
  // 여기서 부르는 /City.glb가 방금 public에 넣은 '새 건물 모델'이어야 합니다.
  const { nodes, materials } = useGLTF("/City.glb");

  return (
    <group {...props} dispose={null}>
      {/* 새 모델의 '학교001' 그룹 */}
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.학교001.geometry}
          material={materials["sandybrown.003"]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.학교001_1.geometry}
          material={materials["lightgreen.003"]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.학교001_2.geometry}
          material={materials["Blacktop_Old_01.003"]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.학교001_3.geometry}
          material={materials["red.003"]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.학교001_4.geometry}
          material={materials["FrontColor.003"]}
        />
      </group>

      {/* 새 모델의 'Mesh423' 그룹 */}
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Mesh423.geometry}
        material={materials["lightgreen.002"]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Mesh423_1.geometry}
        material={materials["Blacktop_Old_01.002"]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Mesh423_2.geometry}
        material={materials["FrontColor.002"]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Mesh423_3.geometry}
        material={materials["red.002"]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Mesh423_4.geometry}
        material={materials["sandybrown.002"]}
      />
    </group>
  );
}

useGLTF.preload("/City.glb");
