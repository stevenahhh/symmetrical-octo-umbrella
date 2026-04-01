// App.js 상단 임포트 확인
import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage } from "@react-three/drei";
import { CityModel } from "./CityModel";

// 임시: selectedId와 getBldName 정의
const selectedId = "학교001";
const getBldName = (id) => (id === "학교001" ? "학교" : "");

function App() {
  return (
    <div className="flex-1 bg-[#eef2f3] relative">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            모델 로딩 중...
          </div>
        }
      >
        <Canvas shadows camera={{ position: [50, 50, 50], fov: 35 }}>
          <ambientLight intensity={0.7} />
          <spotLight
            position={[10, 10, 10]}
            angle={0.15}
            penumbra={1}
            castShadow
          />

          {/* 주아리 님의 모델을 Stage에 담아 조명과 크기를 자동 최적화 */}
          <Stage environment="city" intensity={0.5} contactShadow={true}>
            <CityModel />
          </Stage>

          <OrbitControls makeDefault />
        </Canvas>
      </Suspense>

      {/* UI 라벨 */}
      <div className="absolute bottom-6 left-6 bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow-lg text-[11px] font-bold">
        Digital Twin: {selectedId} {getBldName(selectedId)}
      </div>
    </div>
  );
}

export default App;
