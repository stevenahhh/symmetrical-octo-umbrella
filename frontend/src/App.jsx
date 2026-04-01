import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { CityModel } from './CityModel';
import { Zap, Sun, AlertTriangle, Cloud, Navigation, CheckCircle2 } from 'lucide-react';

const DUMMY_DATA = {
  '학교 건물': {
    power: '2,450 kWh',
    solar: '1,120 kWh',
    status: [
      { name: '메인 전력량계', status: '정상', isGood: true, value: '2450 kWh', icon: Zap },
      { name: '태양광 인버터', status: '정상', isGood: true, value: '98% 효율', icon: Sun },
      { name: 'A구역 센서', status: '정상', isGood: true, value: '동작 중', icon: CheckCircle2 },
    ],
    alert: null
  },
  '부속 건물': {
    power: '3,120 kWh',
    solar: '850 kWh',
    status: [
      { name: '도서관 전력량계', status: '불안정', isGood: false, value: '3120 kWh', icon: Zap },
      { name: '서버룸 온도', status: '점검 필요', isGood: false, value: '28도', icon: AlertTriangle },
      { name: '냉난방기 전력', status: '정상', isGood: true, value: '180 kWh', icon: Zap },
    ],
    alert: { title: '도서관 전력', desc: '과부하 발생', type: 'danger' }
  },
  '선택된 객체 없음': {
    power: '-',
    solar: '-',
    status: [],
    alert: null
  }
};

export default function App() {
  const [selectedId, setSelectedId] = useState('객체를 클릭해주세요');
  const [weatherData, setWeatherData] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8000/environment/full')
      .then(res => res.json())
      .then(data => setWeatherData(data))
      .catch(err => console.error('API load fail:', err));
  }, []);

  const handleSelect = (id) => setSelectedId(id);
  const currentData = DUMMY_DATA[selectedId] || DUMMY_DATA['선택된 객체 없음'];

  return (
    <div className="flex h-screen w-screen bg-[#eaecf0] p-4 gap-4 font-sans text-slate-800 box-border overflow-hidden">

      {/* -------------------- Left Column (Map + Bottom Panels) -------------------- */}
      <div className="flex flex-col flex-1 gap-4 h-full overflow-hidden">

        {/* Top: 3D Map Area */}
        <div className="flex-1 bg-[#f0f3f5] rounded-3xl shadow-sm relative overflow-hidden flex flex-col">
          <Suspense fallback={
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-50">
              <div className="animate-pulse text-lg font-semibold text-blue-600">3D 모델 로딩 중...</div>
            </div>
          }>
            <Canvas shadows camera={{ position: [50, 50, 50], fov: 35 }} className="w-full h-full">
              <ambientLight intensity={0.7} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} castShadow />
              <Stage environment="city" intensity={0.5} contactShadow={true}>
                <CityModel onSelect={handleSelect} />
              </Stage>
              <OrbitControls makeDefault />
            </Canvas>
          </Suspense>

          {/* Overlay Label (Top Center / Map marker style) */}
          {currentData.alert && (
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl shadow-lg border border-slate-100 flex flex-col items-center pointer-events-none transition-all">
              <span className="text-xs font-bold text-gray-800 mb-1">{currentData.alert.title}</span>
              <span className="text-[10px] text-gray-500 font-semibold mb-1">{currentData.alert.desc}</span>
              <div className="text-red-500 mt-1"><Navigation aria-hidden="true" size={16} className="rotate-180 fill-current" /></div>
            </div>
          )}

          {/* Floating Select Info */}
          <div className="absolute top-6 left-6 bg-white/80 backdrop-blur-xl px-5 py-3 rounded-2xl shadow-sm border border-white font-medium text-sm transition-all">
            <span className="text-gray-500 mr-2 text-xs">선택된 시설</span>
            <span className="text-blue-600 font-extrabold">{selectedId}</span>
          </div>
        </div>

        {/* Bottom: 3 Dashboard Panels */}
        <div className="h-[200px] xl:h-[240px] grid grid-cols-3 gap-4 shrink-0 transition-opacity">

          {/* Panel 1 */}
          <div className="bg-[#f4f6f8] rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <h3 className="font-extrabold text-gray-800 flex items-center gap-2 mb-4 text-sm xl:text-base">
              <Zap size={18} className="text-gray-700" /> 전력 소비량
            </h3>
            <div className="flex-1 rounded-2xl bg-white border border-white flex flex-col items-center justify-center text-gray-800 text-3xl font-black shadow-sm">
              {currentData.power}
            </div>
          </div>

          {/* Panel 2 */}
          <div className="bg-[#f4f6f8] rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <h3 className="font-extrabold text-gray-800 flex items-center gap-2 mb-4 text-sm xl:text-base">
              <Sun size={18} className="text-gray-700" /> 태양광 발전량
            </h3>
            <div className="flex-1 rounded-2xl bg-white border border-white flex flex-col items-center justify-center text-gray-800 text-3xl font-black shadow-sm">
              {currentData.solar}
            </div>
          </div>

          {/* Panel 3 */}
          <div className="bg-[#f4f6f8] rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <h3 className="font-extrabold text-gray-800 text-sm xl:text-base mb-3">설비 상태</h3>
            {currentData.status.length > 0 ? (
              <ul className="space-y-2 text-[11px] font-semibold w-full">
                {currentData.status.map((item, idx) => {
                  const IconComponent = item.icon;
                  return (
                    <li key={idx} className="flex justify-between items-center bg-white/60 p-2.5 rounded-xl border border-white shadow-sm gap-2">
                      <span className="flex items-center gap-2 truncate">
                        <div className={"rounded p-[3px] shrink-0 ${item.isGood ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}"}>
                          <IconComponent size={12} />
                        </div>
                        <span className="truncate">{item.name}</span>
                      </span>
                      <div className="text-right shrink-0">
                        <span className={"block mb-0.5 ${item.isGood ? 'text-emerald-500' : 'text-amber-500'}"}>
                          {item.isGood ? '● 정상' : '▲ ' + item.status}
                        </span>
                        <span className={"font-bold ${item.isGood ? 'text-gray-500' : 'text-amber-600'}"}>{item.value}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="flex-1 rounded-2xl bg-white border border-white flex items-center justify-center text-gray-400 text-sm font-semibold shadow-sm">
                데이터 없음
              </div>
            )}
          </div>

        </div>
      </div>

      {/* -------------------- Right Column (Sidebar) -------------------- */}
      <div className="w-[320px] xl:w-[380px] bg-white rounded-[32px] shadow-sm p-6 flex flex-col gap-6 shrink-0 h-full overflow-y-auto hidden md:flex">

        {/* Weather / Environment Header */}
        <div className="flex flex-col items-center justify-center pt-6 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <Cloud size={64} className="text-gray-300 fill-current" />
            <span className="text-5xl font-extrabold tracking-tighter">
              {weatherData?.base_weather?.temperature || '-'}°
            </span>
          </div>
          <div className="text-center font-bold text-gray-800 text-[13px] tracking-tight">어제보다 6.5° ↑</div>
          <div className="text-center font-bold text-gray-800 text-[13px] tracking-tight mb-2">
            {weatherData?.forecast?.[0]?.sky || '-'}
          </div>
          <p className="text-[11px] font-semibold text-gray-400 mt-1 mb-6 tracking-wide">
            체감 {weatherData?.base_weather?.temperature || '-'}° ·
            습도 {weatherData?.base_weather?.humidity || '-'}% ·
            풍속 {weatherData?.base_weather?.wind_speed || '-'}m/s
          </p>

          <div className="flex w-full gap-2 text-[10px] xl:text-[11px] font-bold text-center">
            <div className="flex-1 bg-emerald-50/70 text-emerald-600 py-3 rounded-2xl">
              <p className="text-gray-500 font-medium mb-1 tracking-tight">미세먼지</p>{weatherData?.base_weather?.pm10 || '-'}㎍
            </div>
            <div className="flex-1 bg-orange-50/70 text-orange-500 py-3 rounded-2xl">
              <p className="text-gray-500 font-medium mb-1 tracking-tight">초미세먼지</p>{weatherData?.base_weather?.pm25 || '-'}㎍
            </div>
            <div className="flex-1 bg-blue-50/70 text-blue-500 py-3 rounded-2xl">
              <p className="text-gray-500 font-medium mb-1 tracking-tight">대기질</p>{weatherData?.summary?.air_quality_status || '-'}
            </div>
            <div className="flex-1 bg-yellow-50/70 text-yellow-600 py-3 rounded-2xl">
              <p className="text-gray-500 font-medium mb-1 tracking-tight">지수</p>{weatherData?.base_weather?.khai_value || '-'}
            </div>
          </div>
        </div>

        {/* Model Card 1 */}
        <div className="bg-[#f4f6f8] rounded-3xl h-40 flex items-center justify-center font-extrabold text-base xl:text-xl tracking-tight text-gray-800 shadow-inner cursor-pointer hover:bg-[#e9ecee] transition-colors mt-2">
          에너지, 환경 모델
        </div>

        {/* Congestion */}
        <div className="mt-4">
          <h3 className="font-extrabold text-[13px] mb-3 ml-2 text-gray-800 tracking-tight">교내 혼잡도</h3>
          <div className="bg-[#f4f6f8] rounded-3xl p-5 flex justify-between text-center shadow-inner">
            <div className="flex-1 border-r border-gray-200/50">
              <p className="text-[11px] text-gray-600 mb-2 font-bold tracking-tight">차량</p>
              <p className="font-black text-emerald-500 xl:text-lg">67대</p>
            </div>
            <div className="flex-1 border-r border-gray-200/50">
              <p className="text-[11px] text-gray-600 mb-2 font-bold tracking-tight">사람</p>
              <p className="font-black text-orange-400 xl:text-lg">128명</p>
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-gray-600 mb-2 font-bold tracking-tight">킥보드</p>
              <p className="font-black text-blue-500 xl:text-lg">23대</p>
            </div>
          </div>
        </div>

        {/* Model Card 2 */}
        <div className="bg-[#f4f6f8] rounded-3xl h-40 flex items-center justify-center font-extrabold text-base xl:text-xl tracking-tight text-gray-800 shadow-inner cursor-pointer hover:bg-[#e9ecee] transition-colors mt-auto mb-4">
          교통, 안전 모델
        </div>

      </div>
    </div>
  );
}
