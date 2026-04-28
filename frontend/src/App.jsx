/*=====================================================================
  frontend/src/App.jsx
  - React + Three.js (react‑three‑fiber) 기반 UI
  - 기존 교통·안전·에너지 레이아웃 유지
  - 날씨·대기질 API 연동 (Vite env 변수 사용)
=====================================================================*/

import React, { Suspense, useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, Html } from '@react-three/drei';
import { CityModel } from './CityModel';
import { Zap, Sun, AlertTriangle, Cloud, Navigation, CheckCircle2, Settings2, Activity, ShieldAlert, FileText, CheckCircle, Smartphone, MapPin } from 'lucide-react';
import AlertBadge from './components/AlertBadge';
import trafficData from './utils/trafficData.json';
import './App.css';

/* --------------------------------------------------------------
   더미 데이터 (전력·태양광 등) – 기존 그대로 유지
-------------------------------------------------------------- */
const DUMMY_DATA = {
  '학교 건물': {
    power: '2,450 kWh',
    solar: '1,120 kWh',
    roofArea: 1200,
    status: [
      { name: '메인 전력량계', status: '정상', isGood: true, value: '2450 kWh', icon: Zap },
      { name: '태양광 인버터', status: '정상', isGood: true, value: '98% 효율', icon: Sun },
      { name: 'A구역 센서', status: '정상', isGood: true, value: '동작 중', icon: CheckCircle2 },
    ],
  },
  '부속 건물': {
    power: '3,120 kWh',
    solar: '850 kWh',
    roofArea: 800,
    status: [
      { name: '도서관 전력량계', status: '불안정', isGood: false, value: '3120 kWh', icon: Zap },
      { name: '서버룸 온도', status: '점검 필요', isGood: false, value: '28도', icon: AlertTriangle },
    ],
  },
  '선택된 객체 없음': { power: '-', solar: '-', roofArea: 0, status: [] },
};

export default function App() {
  /* --------------------------------------------------------------
     UI 상태 (기존)
  -------------------------------------------------------------- */
  const [selectedId, setSelectedId] = useState('객체를 클릭해주세요');
  const [selectedArea, setSelectedArea] = useState(0);
  const [activeTab, setActiveTab] = useState('sim');
  const [mainTab, setMainTab] = useState('traffic');
  const [solarRadiation, setSolarRadiation] = useState(1200);
  const [shadingLoss, setShadingLoss] = useState(10);
  const [efficiency, setEfficiency] = useState(20);
  const [roofRatio, setRoofRatio] = useState(50);
  // 추가: forecast 인덱스 (자동 재생용)
  const [forecastIdx, setForecastIdx] = useState(0);
  // 모드: 실시간 vs 시뮬레이션
  const [mode, setMode] = useState('realtime'); // 'realtime' | 'simulation'
  // 시뮬레이션용 온도 (사용자 입력)
  const [simTemp, setSimTemp] = useState(20);
  // 현재 표시할 주소 (순천시 매곡동)
  const locationName = '순천시 매곡동';

  /* --------------------------------------------------------------
     ★ 날씨 API 상태
  -------------------------------------------------------------- */
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* --------------------------------------------------------------
     ★ ① 날씨 API 호출 (마운트 시 1회)
  -------------------------------------------------------------- */
  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';
    setLoading(true);
    fetch(`${API_URL}/environment/full`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setWeatherData(data);
        setError(null);
      })
      .catch((err) => {
        console.error('날씨 API 호출 실패:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []); // 빈 배열 → 마운트 시 한 번만 실행

  // 자동 재생 (2초마다 forecast 인덱스 증가)
  useEffect(() => {
    if (!weatherData?.forecast?.length) return;
    const interval = setInterval(() => {
      setForecastIdx((prev) => (prev + 1) % weatherData.forecast.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [weatherData]);

  /* --------------------------------------------------------------
     현재 선택된 건물·구역 데이터 (기존 로직)
  -------------------------------------------------------------- */
  const currentData = useMemo(() => {
    if (DUMMY_DATA[selectedId])
      return {
        ...DUMMY_DATA[selectedId],
        roofArea: selectedArea > 0 ? selectedArea : DUMMY_DATA[selectedId].roofArea,
      };
    if (selectedId === '객체를 클릭해주세요' || selectedId.startsWith('RPT-'))
      return DUMMY_DATA['선택된 객체 없음'];
    const hash = selectedId.length * 123;
    const finalArea = selectedArea > 0 ? selectedArea : Math.floor(hash * 1.2) + 500;
    return {
      power: (Math.floor(hash * 3.4) + 1200).toLocaleString() + ' kWh',
      solar: (Math.floor(hash * 1.5) + 400).toLocaleString() + ' kWh',
      roofArea: finalArea,
      status: [
        { name: '메인 전력량계', status: '정상', isGood: true, value: (Math.floor(hash * 3.4) + 1200) + ' kWh', icon: Zap },
        { name: '태양광 인버터', status: '정상', isGood: true, value: (Math.floor(hash * 0.1) % 10 + 90) + '% 효율', icon: Sun },
      ],
    };
  }, [selectedId, selectedArea]);

  // 현재 표시할 날씨(현재 혹은 forecast) 계산
  // 현재 표시할 날씨(실시간 API 또는 시뮬레이션) 계산
  const activeWeather = useMemo(() => {
    if (!weatherData) return null;
    // 시뮬레이션 모드: 사용자가 지정한 온도만 교체
    if (mode === 'simulation') {
      return {
        ...weatherData.base_weather,
        temperature: simTemp,
      };
    }
    // 실시간 모드: 현재 API 데이터 사용
    return weatherData.base_weather;
  }, [weatherData, mode, simTemp]);

  // 경보 규칙 (임시값, 필요 시 조정)
  const ALERT_RULES = [
    { id: 'heat_island', label: '열섬 현상', check: (d) => (d.heat_island_index ?? 0) >= 0.5 },
    { id: 'high_temp', label: '고온 경보', check: (d) => (d.temperature ?? 0) >= 35 },
    { id: 'high_pm10', label: 'PM10 초과', check: (d) => (d.pm10 ?? 0) >= 80 },
    { id: 'high_pm25', label: 'PM2.5 초과', check: (d) => (d.pm25 ?? 0) >= 50 },
    { id: 'strong_wind', label: '강풍 경보', check: (d) => (d.wind_speed ?? 0) >= 15 },
  ];

  // 현재 날씨에 해당하는 경보 리스트
  const activeAlerts = useMemo(() => {
    if (!activeWeather) return [];
    return ALERT_RULES.filter((rule) => rule.check(activeWeather));
  }, [activeWeather]);

  const solarResult = useMemo(() => {
    const PR = 0.8;
    const roofArea = currentData.roofArea || 0;
    const effectiveArea = roofArea * (roofRatio / 100);
    const energy = effectiveArea * (efficiency / 100) * solarRadiation * PR * (1 - shadingLoss / 100);
    return { totalArea: roofArea, selectedArea: effectiveArea, energy };
  }, [currentData, solarRadiation, shadingLoss, efficiency, roofRatio]);

  /* --------------------------------------------------------------
     Traffic Stats (unchanged)
  -------------------------------------------------------------- */
  const confirmedCount = trafficData.filter((d) => d.status === '확정').length;
  const aiFastTrack = trafficData.filter((d) => d.status === '확정' && d.ai_confidence >= 0.45).length;
  const totalPoints = trafficData.reduce((acc, d) => acc + d.earned_points, 0);

  /* --------------------------------------------------------------
     UI 렌더링
  -------------------------------------------------------------- */
  return (
    <div className="flex h-screen w-screen bg-[#eaecf0] p-4 gap-4 font-sans text-slate-800 overflow-hidden">
      {/* 좌측 3D 뷰 */}
      <div className="flex flex-col flex-1 gap-4 h-full overflow-hidden">
        <div className="flex-1 bg-[#f0f3f5] rounded-3xl shadow-sm relative overflow-hidden flex flex-col">
          <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center">Loading...</div>}>
            <Canvas shadows camera={{ position: [80, 60, 80], fov: 25 }}>
              <ambientLight intensity={0.7} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} castShadow />
              <Stage environment="city" intensity={0.5} contactShadow>
                <CityModel
                  onSelect={(name, area) => {
                    setSelectedId(name);
                    if (area) setSelectedArea(area);
                  }}
                  selectedId={selectedId}
                />
                {/* 교통·안전 마커 */}
                {mainTab === 'traffic' &&
                  trafficData.map((d, i) => {
                    const SCALE = 14500;
                    const x = (d.longitude - 127.4810) * SCALE;
                    const z = -(d.latitude - 34.9690) * SCALE;
                    const isAlert = d.status === '확정';
                    const color = isAlert ? 'bg-red-500' : 'bg-gray-400/90';
                    const isSelected = selectedId === `RPT:${d.report_id}`;
                    return (
                      <mesh key={i} position={[x, 5, z]}>
                        <Html center zIndexRange={[100, 0]}>
                          <div className="relative flex flex-col items-center">
                            {isSelected && (
                              <div className="absolute bottom-[calc(100%+8px)] w-max max-w-[200px] bg-white text-slate-800 p-3 rounded-2xl shadow-xl border border-gray-100 flex flex-col pointer-events-none z-[1000]">
                                <strong className="text-sm mb-1 text-blue-600 flex items-center gap-1">
                                  <ShieldAlert size={14} /> {d.category}
                                </strong>
                                <span className="text-[10px] text-gray-500">
                                  신뢰도: {(d.final_trust_score * 100).toFixed(0)}%
                                </span>
                                <span className="text-[10px] font-bold mt-1 text-red-500">{d.status} 처리</span>
                                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-gray-100 rotate-45" />
                              </div>
                            )}
                            <div
                              className={`p-2 rounded-full text-white shadow-xl ${color} cursor-pointer hover:scale-110 transition-transform ${isSelected ? 'ring-4 ring-red-200 scale-110' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(`RPT:${d.report_id}`);
                              }}
                            >
                              <AlertTriangle size={isAlert ? 16 : 12} />
                            </div>
                          </div>
                        </Html>
                      </mesh>
                    );
                  })}
              </Stage>
              <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.05}
                minPolarAngle={Math.PI / 6}
                maxPolarAngle={Math.PI / 2.2}
                minDistance={30}
                maxDistance={150}
              />
            </Canvas>
          </Suspense>

          {/* 현재 선택된 시설 표시 */}
          <div className="absolute top-6 left-6 bg-white/80 backdrop-blur-xl px-5 py-3 rounded-2xl shadow-sm border border-white font-medium text-sm z-10">
            <span className="text-gray-500 mr-2 text-xs">선택된 시설</span>
            <span className="text-blue-600 font-extrabold">{selectedId}</span>
          </div>
        </div>

        {/* 하단 탭 영역 (에너지·교통·리포팅) */}
        <div className="h-[200px] xl:h-[240px] grid grid-cols-3 gap-4 shrink-0">
          {mainTab === 'energy' ? (
            <>
              {/* 전력 소비량 */}
              <div className="bg-[#f4f6f8] rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <h3 className="font-extrabold text-gray-800 flex items-center gap-2 mb-4 text-sm xl:text-base">
                  <Zap size={18} /> 전력 소비량
                </h3>
                <div className="flex-1 rounded-2xl bg-white flex items-center justify-center text-gray-800 text-3xl font-black shadow-sm">
                  {currentData.power}
                </div>
              </div>

              {/* 교내 혼잡도 */}
              <div className="bg-[#f4f6f8] rounded-3xl p-4 shadow-sm flex flex-col justify-between">
                <h3 className="font-extrabold text-gray-800 flex items-center gap-2 mb-3 text-sm xl:text-base">
                  <Activity size={18} /> 교내 혼잡도
                </h3>
                <div className="flex-1 bg-white rounded-2xl p-2 flex justify-around items-center shadow-sm">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 font-bold mb-1">차량</p>
                    <p className="font-black text-emerald-500 text-xl">67</p>
                  </div>
                  <div className="w-[1px] h-8 bg-gray-100" />
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 font-bold mb-1">사람</p>
                    <p className="font-black text-orange-400 text-xl">128</p>
                  </div>
                  <div className="w-[1px] h-8 bg-gray-100" />
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 font-bold mb-1">킥보드</p>
                    <p className="font-black text-blue-500 text-xl">23</p>
                  </div>
                </div>
              </div>

              {/* 설비 상태 */}
              <div className="bg-[#f4f6f8] rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <h3 className="font-extrabold text-gray-800 text-sm mb-3">설비 상태</h3>
                {currentData.status.length > 0 ? (
                  <ul className="space-y-1.5 text-[10px] font-semibold overflow-y-auto">
                    {currentData.status.map((item, idx) => {
                      const Icon = item.icon;
                      return (
                        <li key={idx} className="flex justify-between items-center bg-white/60 p-2 rounded-xl border border-white">
                          <span className="flex items-center gap-2 truncate">
                            <div className="rounded p-[3px] bg-emerald-100 text-emerald-600">
                              <Icon size={12} />
                            </div>
                            <span className="truncate">{item.name}</span>
                          </span>
                          <div className="text-right shrink-0">
                            <span className="block text-[9px] text-emerald-500">● 정상</span>
                            <span className="font-bold">{item.value}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex-1 rounded-2xl bg-white flex items-center justify-center text-gray-400 text-xs">
                    시설 선택 시 표시
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* 위험 구역 */}
              <div className="bg-[#f4f6f8] rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <h3 className="font-extrabold text-gray-800 flex items-center gap-2 mb-4 text-sm xl:text-base">
                  <ShieldAlert size={18} className="text-red-500" /> 확정 위험 구역
                </h3>
                <div className="flex-1 rounded-2xl bg-white flex flex-col items-center justify-center text-red-500 text-3xl font-black shadow-sm">
                  {confirmedCount}건
                  <span className="text-xs text-gray-500 font-normal mt-1">보안/출동 대기</span>
                </div>
              </div>

              {/* AI 패스트트랙 */}
              <div className="bg-[#f4f6f8] rounded-3xl p-4 shadow-sm flex flex-col justify-between">
                <h3 className="font-extrabold text-gray-800 flex items-center gap-2 mb-3 text-sm xl:text-base">
                  <CheckCircle size={18} className="text-emerald-500" /> AI 패스트트랙
                </h3>
                <div className="flex-1 rounded-2xl bg-white flex flex-col items-center justify-center text-emerald-500 text-3xl font-black shadow-sm">
                  {aiFastTrack}건
                  <span className="text-xs text-gray-500 font-normal mt-1">0초만에 처리된 스마트 확정</span>
                </div>
              </div>

              {/* 최근 접수 내역 */}
              <div className="bg-[#f4f6f8] rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <h3 className="font-extrabold text-gray-800 text-sm mb-3">최근 접수 내역</h3>
                <ul className="space-y-1.5 text-[10px] font-semibold overflow-y-auto pr-1">
                  {trafficData.slice(0, 4).map((d, i) => (
                    <li key={i} className="flex justify-between items-center bg-white/60 p-2 rounded-xl border border-white">
                      <span className="flex items-center gap-2 truncate">
                        <div className={`rounded p-[3px] text-white ${d.status === '확정' ? 'bg-red-400' : 'bg-gray-400'}`}>
                          <AlertTriangle size={10} />
                        </div>
                        <span className="truncate">{d.category}</span>
                      </span>
                      <div className="text-right shrink-0">
                        <span className={`block text-[9px] ${d.status === '확정' ? 'text-red-500' : 'text-gray-400'}`}>{d.status}</span>
                        <span className="font-bold text-[8px] text-gray-500">
                          {new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 오른쪽 사이드바 – 에너지·교통·리포팅 + 날씨 패널 */}
      <div className="w-[320px] xl:w-[380px] bg-white rounded-[32px] shadow-sm p-5 flex flex-col gap-5 h-full overflow-y-auto hidden md:flex">
        {mainTab === 'energy' ? (
          <>
            {/* 날씨 패널 (상단) */}
            <div className="flex flex-col items-center justify-center pt-2 pb-2">
              {/* 모드 토글 */}
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setMode('realtime')}
                  className={`px-3 py-1 text-xs rounded ${mode === 'realtime' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                >
                  실시간
                </button>
                <button
                  onClick={() => setMode('simulation')}
                  className={`px-3 py-1 text-xs rounded ${mode === 'simulation' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                >
                  시뮬레이션
                </button>
              </div>
              {/* 시뮬레이션 온도 슬라이더 */}
              {mode === 'simulation' && (
                <div className="flex items-center gap-2 mb-2 w-full px-4">
                  <span className="text-sm">온도:</span>
                  <input
                    type="range"
                    min="-10"
                    max="45"
                    value={simTemp}
                    onChange={(e) => setSimTemp(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm w-8 text-center">{simTemp}°</span>
                </div>
              )}
              <div className="flex items-center gap-4 mb-2">
                <Cloud size={56} className="text-gray-300 fill-current" />
                <span className="text-5xl font-extrabold tracking-tighter text-slate-800">
                  {activeWeather?.temperature ?? '-'}°
                </span>
              </div>
              <div className="text-center font-bold text-gray-800 text-[13px] mb-4">
                {activeWeather?.sky ?? '-'} · 체감 {activeWeather?.temperature ?? '-'}°
              </div>
              {/* 현재 주소 표시 */}
              <div className="text-xs text-gray-500 mb-2">
                현재 주소: {locationName}
              </div>
              <div className="flex w-full gap-2 text-[10px] font-bold text-center">
                <div className="flex-1 bg-emerald-50 py-2.5 rounded-2xl">
                  미세먼지 {weatherData?.base_weather?.pm10 ?? '-'}
                </div>
                <div className="flex-1 bg-orange-50 py-2.5 rounded-2xl">
                  초미세 {weatherData?.base_weather?.pm25 ?? '-'}
                </div>
                <div className="flex-1 bg-blue-50 py-2.5 rounded-2xl">
                  대기질 {weatherData?.summary?.air_quality_status ?? '-'}
                </div>
              </div>
              {/* 새로고침 버튼 */}
              <button
                className="mt-3 text-xs text-blue-600 hover:underline"
                onClick={() => {
                  setLoading(true);
                  const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';
                  fetch(`${API_URL}/environment/full`)
                    .then((r) => r.json())
                    .then(setWeatherData)
                    .catch((e) => setError(e.message))
                    .finally(() => setLoading(false));
                }}
              >
                새로고침
              </button>
            </div>
{/* 경보 배지 리스트 */}
<div className="mt-2 space-y-1">
  {activeAlerts.map(alert => (
    <AlertBadge key={alert.id} label={alert.label} />
  ))}
</div>

            {/* 에너지 시뮬레이터 */}
            <div className="bg-[#f8f9fa] rounded-[28px] p-5 border border-slate-100 flex flex-col gap-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-black text-gray-800 flex items-center gap-2 text-sm">
                  <Sun size={20} className="text-orange-500" /> 시뮬레이터
                </h3>
                <div className="flex bg-gray-200/50 rounded-lg p-0.5">
                  <button
                    onClick={() => setActiveTab('sim')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md ${activeTab === 'sim' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
                  >
                    SIM
                  </button>
                  <button
                    onClick={() => setActiveTab('set')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md ${activeTab === 'set' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
                  >
                    SET
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-bold text-gray-500 mb-1">연간 발전량</p>
                <div className="text-2xl font-black text-gray-800">
                  {solarResult.energy.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>일사량</span>
                    <span>{solarRadiation}</span>
                  </div>
                  <input
                    type="range"
                    min="800"
                    max="1500"
                    value={solarRadiation}
                    onChange={(e) => setSolarRadiation(parseInt(e.target.value))}
                    className="w-full accent-blue-500 h-1"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>패널 효율</span>
                    <span>{efficiency}%</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="25"
                    value={efficiency}
                    onChange={(e) => setEfficiency(parseInt(e.target.value))}
                    className="w-full accent-blue-500 h-1"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>옥상 비율</span>
                    <span>{roofRatio}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={roofRatio}
                    onChange={(e) => setRoofRatio(parseInt(e.target.value))}
                    className="w-full accent-blue-500 h-1"
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 스마트 리포팅 (교통 탭) */}
            <div className="flex flex-col items-center justify-center pt-2 pb-2">
              <div className="w-full flex items-center justify-between mb-4">
                <h2 className="text-xl font-black flex items-center gap-2">
                  <Smartphone className="text-pink-500" /> 스마트 리포팅
                </h2>
              </div>

              <div className="bg-pink-50 rounded-2xl p-4 w-full mb-4 border border-pink-100">
                <div className="text-[10px] font-bold text-pink-600 mb-1">참여자 리워드 지급 현황</div>
                <div className="text-3xl font-black text-pink-700 flex items-end gap-1">
                  {totalPoints} <span className="text-base font-bold mb-1">P</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 w-full">
                <div className="bg-gray-50 p-3 rounded-2xl text-center">
                  <div className="text-[10px] text-gray-500 font-bold mb-1">전체 접수건</div>
                  <div className="text-xl font-black text-gray-800">{trafficData.length}건</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-2xl text-center">
                  <div className="text-[10px] text-gray-500 font-bold mb-1">출동 완료</div>
                  <div className="text-xl font-black text-red-500">{confirmedCount}건</div>
                </div>
              </div>
            </div>

            {/* 신고 내역 모니터링 */}
            <div className="bg-[#f8f9fa] rounded-[28px] p-5 border border-slate-100 flex flex-col gap-4 flex-1">
              <h3 className="font-black text-gray-800 flex items-center gap-2 text-sm mb-2">
                <FileText size={18} className="text-blue-500" /> 신고 내역 모니터링
              </h3>
              <div className="overflow-y-auto space-y-2 pr-1 h-[300px]">
                {trafficData.map((d, i) => (
                  <div key={i} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-xs">{d.category}</span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          d.status === '확정' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="text-[10px] text-gray-400">
                        신뢰도: {(d.final_trust_score * 100).toFixed(0)}% <br />
                        AI 판독: {(d.ai_confidence * 100).toFixed(0)}%
                      </div>
                      <div className="text-[10px] font-bold text-pink-500">+{d.earned_points} P</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 탭 전환 버튼 (에너지 / 교통) */}
        <div className="grid grid-cols-2 gap-3 mt-auto shrink-0 mb-2">
          <div
            onClick={() => setMainTab('energy')}
            className={`border rounded-2xl p-4 text-center cursor-pointer transition-colors ${
              mainTab === 'energy' ? 'bg-[#f0f9ff] border-blue-200 shadow-sm' : 'bg-white border-transparent hover:bg-gray-50'
            }`}
          >
            <Activity size={18} className={`mx-auto mb-2 ${mainTab === 'energy' ? 'text-blue-500' : 'text-gray-400'}`} />
            <p className={`text-[10px] font-black ${mainTab === 'energy' ? 'text-blue-700' : 'text-gray-500'}`}>에너지 모델</p>
          </div>

          <div
            onClick={() => setMainTab('traffic')}
            className={`border rounded-2xl p-4 text-center cursor-pointer transition-colors ${
              mainTab === 'traffic' ? 'bg-[#fdf2f8] border-pink-200 shadow-sm' : 'bg-white border-transparent hover:bg-gray-50'
            }`}
          >
            <Zap size={18} className={`mx-auto mb-2 ${mainTab === 'traffic' ? 'text-pink-500' : 'text-gray-400'}`} />
            <p className={`text-[10px] font-black ${mainTab === 'traffic' ? 'text-pink-700' : 'text-gray-500'}`}>교통/안전 모델</p>
          </div>
        </div>
      </div>
    </div>
  );
}
