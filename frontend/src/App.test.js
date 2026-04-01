import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";
import CityModel from "./CityModel";
// 1. 우리가 만든 데이터 생성기 불러오기
import { generateMockData } from "./utils/dataGenerator";

function App() {
  const [weather, setWeather] = useState({ temp: 0, desc: "로딩 중..." });
  // 2. 건물 데이터를 저장할 상태(State) 만들기
  const [buildingData, setBuildingData] = useState([]);

  const API_KEY = "8295d56ac0bf7b3a965caf08ff754ad2";
  const city = "Suncheon";

  useEffect(() => {
    // 날씨 가져오기 (기존 로직)
    const fetchWeather = async () => {
      try {
        const response = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`,
        );
        setWeather({
          temp: response.data.main.temp,
          desc: response.data.weather[0].description,
        });
      } catch (error) {
        console.error("날씨 에러:", error);
      }
    };
    fetchWeather();

    // 3. 5초마다 가상 데이터 생성해서 업데이트하기
    const interval = setInterval(() => {
      const newData = generateMockData();
      setBuildingData(newData);
    }, 5000);

    return () => clearInterval(interval); // 컴포넌트가 꺼질 때 청소
  }, []);

  // 4. D4 건물 데이터만 쏙 뽑아내기
  const d4Data = buildingData.find((d) => d.bld_id === "D4");
  // 과부하 여부 판단 (사용량 > 임계값)
  const isOverload = d4Data?.pwr_u > d4Data?.pwr_l;

  return (
    <div className="App">
      <div className="main-container">
        <div className="map-section">
          <div style={{ height: "100%", position: "relative" }}>
            <CityModel />
            <div
              style={{
                position: "absolute",
                top: "20px",
                left: "20px",
                pointerEvents: "none",
              }}
            >
              <h3 style={{ margin: 0 }}>📍 순천대 디지털 트윈 관제</h3>
              {/* 5. 데이터에 따라 경고 문구 조건부 렌더링 */}
              {isOverload ? (
                <p
                  style={{
                    color: "red",
                    fontWeight: "bold",
                    animation: "blink 1s infinite",
                  }}
                >
                  ⚠️ EMERGENCY: D4 건물 전력 과부하! ({d4Data?.pwr_u}kW)
                </p>
              ) : (
                <p style={{ color: "#2ecc71" }}>✅ 시스템 정상 가동 중</p>
              )}
            </div>
          </div>
        </div>

        <div className="side-section">
          <div className="info-card">
            <h4>☁ 실시간 날씨 (순천)</h4>
            <h2 style={{ fontSize: "32px" }}>{weather.temp.toFixed(1)}°</h2>
            <p>{weather.desc}</p>
          </div>
          {/* 생략된 카드들... */}
        </div>
      </div>

      <div className="bottom-bar">
        <div className="info-card" style={{ flex: 1 }}>
          <strong>⚡ D4 전력 사용량</strong>
          <h3 style={{ color: isOverload ? "red" : "#2ecc71" }}>
            {d4Data ? `${d4Data.pwr_u} kW` : "계산 중..."}
          </h3>
        </div>
        <div className="info-card" style={{ flex: 1 }}>
          <strong>☀️ 실시간 태양광 발전</strong>
          <h3 style={{ color: "#f1c40f" }}>
            {d4Data ? `${d4Data.sol_g} kW` : "계산 중..."}
          </h3>
        </div>
      </div>
    </div>
  );
}

export default App;
