import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Cloud,
  Gauge,
  RefreshCw,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  Thermometer,
  TreePine,
  Wind,
  Moon,
  Monitor,
  X
} from "lucide-react";
import { CityModel } from "./CityModel";
import trafficData from "./utils/trafficData.json";
import {
  calculateMayPvOutput,
  DEFAULT_MAY_SPECIFIC_YIELD,
  DEFAULT_ROOF_RATIO,
} from "./utils/pvMath.mjs";
import {
  CAMPUS_LOCATION,
  createSimulationDate,
  getSunState,
  getSunVector,
} from "./utils/sunPosition.mjs";

const DUMMY_DATA = {
  "학교 건물": { roofArea: 1200 },
  "부속 건물": { roofArea: 800 },
};

const ALERT_RULES = [
  {
    id: "heat_island",
    label: "열섬 현상",
    check: (d) => (d?.heat_island_index ?? 0) >= 0.5,
  },
  {
    id: "high_temp",
    label: "고온 경보",
    check: (d) => (d?.temperature ?? 0) >= 35,
  },
  {
    id: "high_pm10",
    label: "PM10 초과",
    check: (d) => (d?.pm10 ?? 0) >= 80,
  },
  {
    id: "high_pm25",
    label: "PM2.5 초과",
    check: (d) => (d?.pm25 ?? 0) >= 50,
  },
  {
    id: "strong_wind",
    label: "강풍 경보",
    check: (d) => (d?.wind_speed ?? 0) >= 15,
  },
];

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function formatShortTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FloatingPanel({ className = "", children }) {
  return (
    <section
      className={`rounded-[16px] border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] shadow-[0_20px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl pointer-events-auto ${className}`}
    >
      {children}
    </section>
  );
}

function MetricCard({ label, value, hint, accent = false }) {
  return (
    <div className="rounded-[12px] border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] px-[24px] py-[24px]">
      <div className="text-[13px] font-[500] uppercase leading-[1.30] tracking-[0.4px] text-[var(--colors-ink-subtle)]">
        {label}
      </div>
      <div
        className={`mt-2 text-[28px] font-[600] leading-[1.20] tracking-[-0.6px] ${accent ? "text-[var(--colors-primary)]" : "text-[var(--colors-ink)]"}`}
      >
        {value}
      </div>
      <div className="mt-2 text-[14px] font-[400] leading-[1.50] tracking-[0px] text-[var(--colors-ink-muted)]">{hint}</div>
    </div>
  );
}

function SliderRow({ label, valueLabel, min, max, step = 1, value, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[14px] font-[400] leading-[1.50]">
        <span className="text-[var(--colors-ink-subtle)]">{label}</span>
        <span className="font-[500] text-[var(--colors-ink)]">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        className="w-full accent-[var(--colors-primary)] pointer-events-auto"
      />
    </div>
  );
}

export default function App() {
  const orbitControlsRef = useRef(null);
  const [selectedId, setSelectedId] = useState("");
  const [selectedArea, setSelectedArea] = useState(1200);
  const [mode, setMode] = useState("simulation");
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [sunMonth, setSunMonth] = useState(() => new Date().getMonth() + 1);
  const [sunDay, setSunDay] = useState(() => new Date().getDate());
  const [sunHour, setSunHour] = useState(() => new Date().getHours());
  const [sunMinute, setSunMinute] = useState(() => new Date().getMinutes());
  const [simTemp, setSimTemp] = useState(20);
  const [roofRatio, setRoofRatio] = useState(DEFAULT_ROOF_RATIO);
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, traffic, environment
  const [trafficTab, setTrafficTab] = useState("safety"); // energy, safety
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(true);
  const [themeMode, setThemeMode] = useState("system");
  const [popupData, setPopupData] = useState(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupError, setPopupError] = useState(null);
  const [trafficStats, setTrafficStats] = useState({ entered: 0, exited: 0, current_cars: 0, total_spaces: 50, is_running: false });

  const refreshWeather = useCallback(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
    setLoading(true);
    setError(null);

    fetch(`${apiUrl}/environment/full`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setWeatherData(data);
      })
      .catch((fetchError) => {
        console.error("환경 데이터 조회 실패:", fetchError);
        setError(fetchError.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshWeather();
  }, [refreshWeather]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const trafficTimer = setInterval(() => {
      fetch("http://localhost:8001/api/traffic")
        .then(res => res.json())
        .then(data => setTrafficStats(data))
        .catch(() => {}); // ignore errors if API is not running
    }, 2000);
    return () => clearInterval(trafficTimer);
  }, []);

  useEffect(() => {
    let activeTheme = themeMode;
    if (themeMode === "system") {
      activeTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.dataset.theme = activeTheme;
    document.documentElement.style.colorScheme = activeTheme;
  }, [themeMode]);

  const activeWeather = useMemo(() => {
    if (!weatherData?.base_weather) return null;
    if (mode !== "simulation") return weatherData.base_weather;

    return {
      ...weatherData.base_weather,
      temperature: simTemp,
    };
  }, [mode, simTemp, weatherData]);

  const currentData = useMemo(() => {
    if (DUMMY_DATA[selectedId]) {
      return {
        roofArea: selectedArea > 0 ? selectedArea : DUMMY_DATA[selectedId].roofArea,
      };
    }

    const hash = (selectedId || "").length * 123;
    return {
      roofArea: selectedArea > 0 ? selectedArea : Math.floor(hash * 1.2) + 500,
    };
  }, [selectedArea, selectedId]);

  const solarResult = useMemo(
    () =>
      calculateMayPvOutput({
        roofArea: currentData.roofArea,
        roofRatio,
        maySpecificYield: DEFAULT_MAY_SPECIFIC_YIELD,
      }),
    [currentData.roofArea, roofRatio],
  );

  const activeAlerts = useMemo(() => {
    if (!activeWeather) return [];
    return ALERT_RULES.filter((rule) => rule.check(activeWeather));
  }, [activeWeather]);

  const riskReports = useMemo(() => trafficData.slice(0, 3), []);

  const weatherTimeline = useMemo(() => {
    if (!Array.isArray(weatherData?.weather_timeline)) return [];
    return weatherData.weather_timeline.slice(0, 3);
  }, [weatherData]);

  const sunSimulationDate = useMemo(
    () =>
      mode === "live"
        ? currentTime
        : createSimulationDate(
            {
              month: sunMonth,
              day: sunDay,
              hour: sunHour,
              minute: sunMinute,
            },
            currentTime.getFullYear(),
          ),
    [currentTime, mode, sunDay, sunHour, sunMinute, sunMonth],
  );

  const sunState = useMemo(
    () =>
      getSunState({
        date: sunSimulationDate,
        latitude: CAMPUS_LOCATION.latitude,
        longitude: CAMPUS_LOCATION.longitude,
      }),
    [sunSimulationDate],
  );

  const sunVector = useMemo(
    () => getSunVector({ altitude: sunState.altitude, azimuth: sunState.azimuth }),
    [sunState.altitude, sunState.azimuth],
  );

  const sceneBackground = sunState.visible ? "#d6e0e6" : "#09111d";
  const systemStatus = loading
    ? "기상 데이터 갱신 중"
    : error
      ? "API 연결 필요"
      : mode === "simulation"
        ? "시뮬레이션 가동 중"
        : "실시간 연동 정상";

  // const period = currentTime.getHours() < 12 ? "오전" : "오후";

  const formattedTime = currentTime.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const formattedDate = currentTime.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const handleSelect = useCallback((name, area) => {
    setSelectedId(name);
    setSelectedArea(area);
    setPopupData(null);
    setPopupError(null);
  }, []);

  const handleBuildingClick = useCallback(async (obj) => {
    const elementId =
      obj?.parent?.name && obj.parent.name !== "Scene"
        ? obj.parent.name
        : obj?.name;

    if (!elementId || !elementId.startsWith("BLD_")) {
      setPopupData(null);
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
    setPopupLoading(true);
    setPopupError(null);
    setPopupData(null);

    try {
      const res = await fetch(`${apiUrl}/microclimate/elements/${elementId}/popup`);
      if (res.status === 404) {
        setPopupError("이 건물의 미기후 데이터가 없습니다.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPopupData(await res.json());
    } catch (err) {
      console.error("팝업 API 호출 실패:", err);
      setPopupError("데이터를 불러오지 못했습니다.");
    } finally {
      setPopupLoading(false);
    }
  }, []);

  return (
    <div className="dashboard-root relative h-screen w-screen overflow-hidden bg-[var(--colors-canvas)] text-[var(--colors-ink)]">
      <div className="absolute inset-0" style={{ background: sceneBackground }} />

      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 80, 80], fov: 50 }} shadows>
          <color attach="background" args={[sceneBackground]} />
          <fog attach="fog" args={[sceneBackground, 180, 340]} />
          <ambientLight intensity={sunState.visible ? 1.55 : 0.5} />
          <directionalLight
            castShadow
            intensity={sunState.visible ? 2.2 : 0.35}
            position={sunVector}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          {sunState.visible && (
            <mesh position={sunVector.map(v => v * 100)}>
              <sphereGeometry args={[10, 32, 32]} />
              <meshBasicMaterial color="#ffe87c" />
            </mesh>
          )}
          <Sky
            distance={450000}
            sunPosition={sunVector}
            inclination={sunState.visible ? 0.52 : 0.08}
            azimuth={0.25}
            turbidity={8}
            rayleigh={0.7}
          />
          <Suspense fallback={null}>
            <CityModel
              position={[0, 0, 0]}
              controlsRef={orbitControlsRef}
              isNight={!sunState.visible}
              selectedId={selectedId}
              onSelect={handleSelect}
              onBuildingClick={handleBuildingClick}
            />
          </Suspense>
          <OrbitControls
            ref={orbitControlsRef}
            enableDamping
            dampingFactor={0.05}
            minDistance={30}
            maxDistance={200}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.2}
            target={[0, 0, 0]}
          />
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,1,2,0.02)_0%,rgba(1,1,2,0.08)_50%,rgba(1,1,2,0.16)_100%)]" />

      <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-[440px]">
        <div 
          className="pointer-events-auto h-full w-full border-l border-[var(--colors-hairline)] shadow-2xl flex flex-col"
          style={{ 
            backgroundColor: 'color-mix(in srgb, var(--colors-surface-1) 50%, transparent)',
            backdropFilter: 'blur(16px)'
          }}
        >
          {/* Header & Tabs */}
          <div className="px-6 pt-8 pb-4">
            <h2 className="text-xl font-[800] tracking-tight mb-5">스마트 시티 대시보드</h2>
            <div className="flex bg-[var(--colors-surface-2)] rounded-lg p-1 border border-[var(--colors-hairline)]">
              {[
                { id: "dashboard", label: "기본 현황" },
                { id: "traffic", label: "교통 및 안전" },
                { id: "environment", label: "환경 제어" }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 text-sm font-[600] rounded-md transition-colors ${activeTab === tab.id ? "bg-[var(--colors-surface-1)] shadow-sm text-[var(--colors-ink)] border border-[var(--colors-hairline)]" : "text-[var(--colors-ink-subtle)] hover:text-[var(--colors-ink)]"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-6 pb-8 space-y-6">
            {activeTab === "dashboard" && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-[600] text-3xl leading-[1.2] tracking-[-0.8px] font-['Linear_Display']">{formattedTime}</div>
                    <div className="mt-1 flex items-center gap-1 text-sm font-medium text-[var(--colors-ink-muted)]">
                      <CalendarDays size={14} />
                      {formattedDate}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(true)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] text-[var(--colors-ink-muted)] transition hover:text-[var(--colors-ink)] hover:bg-[var(--colors-surface-2)]"
                    >
                      <Settings size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={refreshWeather}
                      disabled={loading}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] text-[var(--colors-ink-muted)] transition hover:text-[var(--colors-ink)] hover:bg-[var(--colors-surface-2)] disabled:opacity-50"
                    >
                      <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-4 flex justify-between items-center">
                  <div className="text-sm font-medium text-[var(--colors-ink-subtle)]">시스템 상태</div>
                  <div className="flex items-center gap-2 text-base font-[700]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--colors-semantic-success)] shadow-[0_0_8px_var(--colors-semantic-success)]" />
                    {systemStatus}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--colors-ink-subtle)]">
                      <Thermometer size={16} /> 현재 기온
                    </div>
                    <div className="mt-3 text-2xl font-semibold tracking-[-0.8px]">
                      {activeWeather?.temperature ?? "-"}°C
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--colors-ink-subtle)]">
                      <Wind size={16} /> 풍속 / 습도
                    </div>
                    <div className="mt-3 text-sm font-semibold text-[var(--colors-ink)]">
                      {activeWeather?.wind_speed ?? "-"}m/s · {activeWeather?.humidity ?? "-"}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--colors-ink-subtle)]">
                      <Cloud size={16} /> 하늘 상태
                    </div>
                    <div className="mt-3 text-sm font-semibold text-[var(--colors-ink)]">
                      {activeWeather?.sky ?? weatherData?.summary?.sky_status ?? "맑음"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--colors-ink-subtle)]">
                      <Sun size={16} /> 태양 고도
                    </div>
                    <div className="mt-3 text-sm font-semibold text-[var(--colors-ink)]">
                      {formatNumber((sunState.altitude * 180) / Math.PI, 1)}°
                    </div>
                  </div>
                  <div className="col-span-2 rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--colors-ink-subtle)]">
                      <Gauge size={16} /> 대기질
                    </div>
                    <div className="mt-3 text-sm font-semibold text-[var(--colors-ink)]">
                      {weatherData?.summary?.air_quality_status ?? "보통"}
                    </div>
                  </div>
                </div>
                {(activeAlerts.length > 0 || weatherTimeline.length > 0) && (
                  <div className="grid gap-2">
                    {activeAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center gap-2 rounded-lg border border-[rgba(94,106,210,0.35)] bg-[rgba(94,106,210,0.14)] px-3 py-2 text-sm font-medium text-[var(--colors-ink)]"
                      >
                        <AlertTriangle size={16} className="text-[var(--colors-primary)]" />
                        {alert.label}
                      </div>
                    ))}
                    {weatherTimeline.map((item, index) => (
                      <div
                        key={`${item.fcstTime ?? index}`}
                        className="flex items-center justify-between rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-[var(--colors-ink-subtle)]">{item.fcstTime ?? `${index + 1}차 예보`}</span>
                        <span className="font-[700] text-[var(--colors-ink)]">
                          {item.tmp ?? item.temperature ?? "-"}°C
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "traffic" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-[var(--colors-hairline)]/50">
                  <div className="text-base font-[700] text-[var(--colors-ink)] flex items-center gap-2">
                    <ShieldAlert size={18} className="text-[var(--colors-primary)]" />
                    교통 및 안전 모니터링
                  </div>
                  <div className="flex rounded-md border border-[var(--colors-hairline)] bg-[var(--colors-canvas)]/50 p-1 text-sm font-[600]">
                    <button
                      type="button"
                      onClick={() => setTrafficTab("energy")}
                      className={`rounded px-3 py-1.5 transition-colors ${trafficTab === "energy" ? "bg-[var(--colors-surface-2)] shadow-sm text-[var(--colors-ink)] border border-[var(--colors-hairline)]" : "text-[var(--colors-ink-subtle)] hover:text-[var(--colors-ink)]"}`}
                    >
                      에너지
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrafficTab("safety")}
                      className={`rounded px-3 py-1.5 transition-colors ${trafficTab === "safety" ? "bg-[var(--colors-surface-2)] shadow-sm text-[var(--colors-ink)] border border-[var(--colors-hairline)]" : "text-[var(--colors-ink-subtle)] hover:text-[var(--colors-ink)]"}`}
                    >
                      안전
                    </button>
                  </div>
                </div>

                {trafficTab === "energy" ? (
                  <div className="flex h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--colors-hairline-strong)] bg-[var(--colors-surface-2)]/30 text-sm">
                    <div className="text-[var(--colors-ink-muted)] mb-2">⚡ 에너지 데이터 연동 대기중...</div>
                    <div className="text-[12px] text-[var(--colors-ink-subtle)]">환경 제어 탭에서 태양광 시뮬레이션을 확인해 보세요.</div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="위험 구역 접수" value={`${trafficData.length}건`} hint="최근 24시간 기준" />
                  <MetricCard
                    label="AI 자동 분류"
                    value={`${trafficData.filter((item) => item.ai_confidence >= 0.45).length}건`}
                    hint="우선 처리 대상"
                    accent
                  />
                </div>
                
                <div className="pt-1">
                  <div className="mb-3 text-sm font-[700] text-[var(--colors-ink-subtle)] flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    D4 입출차 현황 (실시간)
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <MetricCard label="주차 대수" value={`${trafficStats?.current_cars ?? 0}대`} hint={`총 ${trafficStats?.total_spaces ?? 50}면`} accent />
                    <MetricCard label="누적 입차" value={`${trafficStats?.entered ?? 0}대`} hint="오늘" />
                    <MetricCard label="누적 출차" value={`${trafficStats?.exited ?? 0}대`} hint="오늘" />
                  </div>
                </div>

                <div className="pt-2">
                  <div className="mb-3 text-sm font-[700] text-[var(--colors-ink-subtle)] flex items-center gap-2">
                    <ShieldAlert size={14} />
                    안전 및 방범 로그
                  </div>
                  <div className="space-y-2">
                    {riskReports.map((item) => (
                      <div
                        key={item.report_id}
                        className="rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-[700] text-[var(--colors-ink)]">{item.category}</div>
                            <div className="mt-1 text-[13px] font-medium text-[var(--colors-ink-subtle)]">
                              {formatShortTime(item.timestamp)}
                            </div>
                          </div>
                          <span className="rounded-full border border-[var(--colors-hairline)] bg-[var(--colors-canvas)] px-2 py-1 text-[12px] font-[700] text-[var(--colors-ink-muted)]">
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                  </>
                )}
              </div>
            )}

            {activeTab === "environment" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-[var(--colors-hairline)]/50">
                  <div className="flex items-center gap-2 text-base font-[700]">
                    <SlidersHorizontal size={18} className="text-[var(--colors-primary)]" />
                    환경 모드 설정
                  </div>
                  <div className="flex rounded-md border border-[var(--colors-hairline)] bg-[var(--colors-canvas)] p-1 text-sm font-[600]">
                    <button
                      type="button"
                      onClick={() => setMode("live")}
                      className={`rounded px-3 py-1.5 transition-colors ${mode === "live" ? "bg-[var(--colors-surface-2)] shadow-sm text-[var(--colors-ink)] border border-[var(--colors-hairline)]" : "text-[var(--colors-ink-subtle)]"}`}
                    >
                      Live
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("simulation")}
                      className={`rounded px-3 py-1.5 transition-colors ${mode === "simulation" ? "bg-[var(--colors-primary)] shadow-sm text-white" : "text-[var(--colors-ink-subtle)]"}`}
                    >
                      Sim
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="text-sm font-[700] text-[var(--colors-ink-subtle)]">가상 환경 파라미터</div>
                  <SliderRow
                    label="온도 조절"
                    valueLabel={`${simTemp}°C`}
                    min={-10}
                    max={40}
                    value={simTemp}
                    onChange={(event) => setSimTemp(Number(event.target.value))}
                  />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
                    <SliderRow
                      label="월"
                      valueLabel={`${sunMonth}월`}
                      min={1}
                      max={12}
                      value={sunMonth}
                      onChange={(event) => setSunMonth(Number(event.target.value))}
                    />
                    <SliderRow
                      label="일"
                      valueLabel={`${sunDay}일`}
                      min={1}
                      max={31}
                      value={sunDay}
                      onChange={(event) => setSunDay(Number(event.target.value))}
                    />
                    <SliderRow
                      label="시"
                      valueLabel={`${sunHour}시`}
                      min={0}
                      max={23}
                      value={sunHour}
                      onChange={(event) => setSunHour(Number(event.target.value))}
                    />
                    <SliderRow
                      label="분"
                      valueLabel={`${sunMinute}분`}
                      min={0}
                      max={59}
                      value={sunMinute}
                      onChange={(event) => setSunMinute(Number(event.target.value))}
                    />
                  </div>
                </div>

                <div className="pt-5 border-t border-[var(--colors-hairline)]/50 space-y-4">
                  <div className="text-sm font-[700] text-[var(--colors-ink-subtle)]">태양광 발전 시뮬레이션</div>
                  <SliderRow
                    label="옥상 활용 면적 비율"
                    valueLabel={`${roofRatio}%`}
                    min={5}
                    max={80}
                    value={roofRatio}
                    onChange={(event) => setRoofRatio(Number(event.target.value))}
                  />
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <MetricCard
                      label="월간 예상 발전량"
                      value={`${formatNumber(solarResult.monthlyOutput, 1)} kWh`}
                      hint=""
                      accent
                    />
                    <MetricCard
                      label="적용 모듈 면적"
                      value={`${formatNumber(solarResult.moduleArea, 0)} ㎡`}
                      hint="가용 면적 기준"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {error && (
            <div className="m-5 mt-auto p-4 rounded-lg bg-[var(--colors-semantic-danger)]/10 text-sm font-medium text-[var(--colors-semantic-danger)] text-center border border-[var(--colors-semantic-danger)]/20 shadow-lg">
              기상 API 통신 오류: {error}
            </div>
          )}
        </div>
      </div>

      {/* Building Info Modal */}
      {selectedId && (
        <div className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <FloatingPanel className="w-[340px] max-h-[80vh] overflow-y-auto px-0 py-0 shadow-2xl">
            {/* Header */}
            <div
              className="sticky top-0 flex items-start justify-between px-5 py-4"
              style={{ background: popupData ? popupData.thermal.risk_color : "var(--colors-surface-2)" }}
            >
              <div>
                <h3
                  className="font-[700] text-[16px] tracking-[-0.1px]"
                  style={{ color: popupData ? "white" : "var(--colors-ink)" }}
                >
                  {popupData?.name ?? selectedId}
                </h3>
                {popupData && (
                  <div className="mt-0.5 text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
                    {popupData.zone_id} · {popupData.thermal.stress_category}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setSelectedId(""); setPopupData(null); setPopupError(null); }}
                className="transition-opacity hover:opacity-70"
                style={{ color: popupData ? "white" : "var(--colors-ink-muted)" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Loading */}
            {popupLoading && (
              <div className="flex items-center justify-center gap-3 px-5 py-8 text-sm text-[var(--colors-ink-muted)]">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--colors-hairline)] border-t-[var(--colors-primary)]" />
                미기후 데이터 불러오는 중…
              </div>
            )}

            {/* Error */}
            {popupError && !popupLoading && (
              <div className="flex items-center gap-2 px-5 py-6 text-sm text-[var(--colors-semantic-danger,#D32F2F)]">
                <AlertTriangle size={16} /> {popupError}
              </div>
            )}

            {/* Microclimate data */}
            {popupData && !popupLoading && (() => {
              const { thermal, factors, delta, reasons, base_weather } = popupData;
              const riskBg = `${thermal.risk_color}18`;
              const factorMeta = {
                shade:       { Icon: Sun,       label: "그늘" },
                vegetation:  { Icon: TreePine,  label: "녹지" },
                wind:        { Icon: Wind,      label: "통풍" },
                radiation:   { Icon: Thermometer, label: "복사" },
                material_heat: { Icon: Gauge,   label: "재질열" },
              };
              return (
                <div className="p-5 space-y-4">
                  {/* Thermal 4-grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "기온",   value: `${thermal.local_temp}°C` },
                      { label: "체감",   value: `${thermal.feels_like}°C` },
                      { label: "UTCI",   value: `${thermal.utci}°C` },
                      { label: "WBGT",   value: `${thermal.wbgt}°C` },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg p-2 text-center" style={{ background: riskBg }}>
                        <div className="text-[10px] font-medium text-[var(--colors-ink-subtle)]">{label}</div>
                        <div className="mt-1 text-[13px] font-[900] text-[var(--colors-ink)]">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Risk bar */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-[var(--colors-ink-subtle)]">위험도</span>
                      <span className="font-[700]" style={{ color: thermal.risk_color }}>{thermal.risk_level}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--colors-surface-2)]">
                      <div className="h-full rounded-full" style={{ width: `${(thermal.risk_score / 4) * 100}%`, background: thermal.risk_color }} />
                    </div>
                  </div>

                  {/* Factors */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {Object.entries(factors).slice(0, 4).map(([key, val]) => {
                      const meta = factorMeta[key] ?? { label: key };
                      const Icon = meta.Icon;
                      return (
                        <div key={key} className="rounded-lg p-2 text-center bg-[var(--colors-surface-2)]">
                          {Icon && <Icon size={12} className="mx-auto mb-1 text-[var(--colors-ink-muted)]" />}
                          <div className="text-[10px] font-medium text-[var(--colors-ink-subtle)]">{meta.label}</div>
                          <div className="mt-0.5 text-[10px] font-[800] text-[var(--colors-ink)]">{val.level}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Delta */}
                  {delta?.label && (
                    <div
                      className="rounded-lg px-3 py-2 text-[12px] font-[700]"
                      style={{ background: riskBg, color: delta.temp > 0 ? "#D32F2F" : "#1976D2" }}
                    >
                      📍 {delta.label}
                    </div>
                  )}

                  {/* Reasons */}
                  {reasons?.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-sm font-medium text-[var(--colors-ink-subtle)]">원인 분석</div>
                      <ul className="space-y-1">
                        {reasons.map((r) => (
                          <li key={r} className="flex items-start gap-1.5 text-[12px] text-[var(--colors-ink-muted)]">
                            <span className="mt-0.5 shrink-0 font-[900]" style={{ color: thermal.risk_color }}>·</span>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Base weather */}
                  <div className="flex gap-3 border-t border-[var(--colors-hairline)] pt-3 text-[12px] font-[700] text-[var(--colors-ink-subtle)]">
                    <span>🌡 {base_weather.temperature}°C</span>
                    <span>💧 {base_weather.humidity}%</span>
                    <span>💨 {base_weather.wind_speed}m/s</span>
                  </div>
                </div>
              );
            })()}

            {/* Fallback: no popup data and not loading */}
            {!popupData && !popupLoading && !popupError && (
              <div className="p-5 space-y-4">
                <div className="flex justify-between text-[14px]">
                  <span className="text-[var(--colors-ink-subtle)]">옥상 면적</span>
                  <span className="font-[500] text-[var(--colors-ink)]">{formatNumber(currentData.roofArea, 0)} ㎡</span>
                </div>
                <div className="flex justify-between text-[14px]">
                  <span className="text-[var(--colors-ink-subtle)]">태양광 발전 패널 적용</span>
                  <span className="font-[500] text-[var(--colors-ink)]">{roofRatio}%</span>
                </div>
                <div className="border-t border-[var(--colors-hairline)] pt-4">
                  <div className="mb-1 text-[12px] text-[var(--colors-ink-subtle)]">예상 발전량 (월)</div>
                  <div className="text-[24px] font-[600] tracking-[-0.5px] text-[var(--colors-primary)]">
                    {formatNumber(solarResult.monthlyOutput, 1)}{" "}
                    <span className="text-[14px] font-[400] text-[var(--colors-ink)]">kWh</span>
                  </div>
                </div>
              </div>
            )}
          </FloatingPanel>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <FloatingPanel className="min-w-[400px] px-0 py-0 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-5 py-4">
              <h3 className="font-[600] text-[18px] text-[var(--colors-ink)] tracking-[-0.1px]">설정</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-[var(--colors-ink-muted)] hover:text-[var(--colors-ink)] transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <div className="mb-3 text-[13px] font-medium text-[var(--colors-ink-subtle)]">테마</div>
                <div className="flex rounded-full border border-[var(--colors-hairline)] bg-[var(--colors-canvas)] p-1">
                  {[
                    { value: "light", icon: <Sun size={14} />, label: "라이트" },
                    { value: "system", icon: <Monitor size={14} />, label: "시스템" },
                    { value: "dark", icon: <Moon size={14} />, label: "다크" },
                  ].map(({ value, icon, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setThemeMode(value)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm transition ${themeMode === value ? "bg-[var(--colors-surface-2)] text-[var(--colors-ink)]" : "text-[var(--colors-ink-subtle)] hover:text-[var(--colors-ink)]"}`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </FloatingPanel>
        </div>
      )}
    </div>
  );
}
