/*=====================================================================
  frontend/src/App.jsx
  - React + Three.js (react‑three‑fiber) 기반 UI
  - 기존 교통·안전·에너지 레이아웃 유지
  - 날씨·대기질 API 연동 (Vite env 변수 사용)
  - ★ 건물 클릭 팝업 (미기후 API) 연동 추가
=====================================================================*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, Sky, Stage } from "@react-three/drei";
import { CityModel } from "./CityModel";
import {
  Zap,
  Sun,
  AlertTriangle,
  Cloud,
  CheckCircle2,
  Activity,
  ShieldAlert,
  FileText,
  CheckCircle,
  Smartphone,
  MapPin,
  X,
  Wind,
  Thermometer,
  TreePine,
  RefreshCw,
  Clock3,
  CalendarDays,
  Clock4,
  ChevronLeft,
  ChevronRight,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import AlertBadge from "./components/AlertBadge";
import trafficData from "./utils/trafficData.json";
import {
  calculateMayPvOutput,
  DEFAULT_MAY_SPECIFIC_YIELD,
  DEFAULT_ROOF_RATIO,
  DEFAULT_SYSTEM_LOSS,
} from "./utils/pvMath.mjs";
import {
  CAMPUS_LOCATION,
  createSimulationDate,
  getSunState,
  getSunVector,
} from "./utils/sunPosition.mjs";
import "./App.css";

/* --------------------------------------------------------------
   더미 데이터 (전력·태양광 등) – 기존 그대로 유지
-------------------------------------------------------------- */
const DUMMY_DATA = {
  "학교 건물": {
    power: "2,450 kWh",
    solar: "1,120 kWh",
    roofArea: 1200,
    status: [
      {
        name: "메인 전력량계",
        status: "정상",
        isGood: true,
        value: "2450 kWh",
        icon: Zap,
      },
      {
        name: "태양광 인버터",
        status: "정상",
        isGood: true,
        value: "98% 효율",
        icon: Sun,
      },
      {
        name: "A구역 센서",
        status: "정상",
        isGood: true,
        value: "동작 중",
        icon: CheckCircle2,
      },
    ],
  },
  "부속 건물": {
    power: "3,120 kWh",
    solar: "850 kWh",
    roofArea: 800,
    status: [
      {
        name: "도서관 전력량계",
        status: "불안정",
        isGood: false,
        value: "3120 kWh",
        icon: Zap,
      },
      {
        name: "서버룸 온도",
        status: "점검 필요",
        isGood: false,
        value: "28도",
        icon: AlertTriangle,
      },
    ],
  },
  "선택된 객체 없음": { power: "-", solar: "-", roofArea: 0, status: [] },
};

const ALERT_RULES = [
  {
    id: "heat_island",
    label: "열섬 현상",
    check: (d) => (d.heat_island_index ?? 0) >= 0.5,
  },
  {
    id: "high_temp",
    label: "고온 경보",
    check: (d) => (d.temperature ?? 0) >= 35,
  },
  { id: "high_pm10", label: "PM10 초과", check: (d) => (d.pm10 ?? 0) >= 80 },
  { id: "high_pm25", label: "PM2.5 초과", check: (d) => (d.pm25 ?? 0) >= 50 },
  {
    id: "strong_wind",
    label: "강풍 경보",
    check: (d) => (d.wind_speed ?? 0) >= 15,
  },
];

const DESIGN_STORAGE_KEY = "dashboard-design-variant";
const THEME_STORAGE_KEY = "dashboard-theme-preference";

function getStoredPreference(key, fallback, allowedValues) {
  if (typeof window === "undefined") return fallback;

  const value = window.localStorage.getItem(key);
  return allowedValues.includes(value) ? value : fallback;
}

function getSystemTheme() {
  if (typeof window === "undefined") return "light";

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/* --------------------------------------------------------------
   ★ 건물 팝업 컴포넌트
-------------------------------------------------------------- */
function BuildingPopup({ data, onClose }) {
  if (!data) return null;

  const { thermal, factors, delta, reasons, base_weather, name, zone_id } =
    data;

  // 위험 등급별 배경색 (연한 버전)
  const riskBgMap = {
    "#1976D2": "rgba(25,118,210,0.08)",
    "#388E3C": "rgba(56,142,60,0.08)",
    "#FBC02D": "rgba(251,192,45,0.10)",
    "#F57C00": "rgba(245,124,0,0.10)",
    "#D32F2F": "rgba(211,47,47,0.08)",
  };
  const riskBg = riskBgMap[thermal.risk_color] ?? "rgba(0,0,0,0.04)";

  // 인자 아이콘 매핑
  const factorIcons = {
    shade: { icon: Sun, label: "그늘" },
    vegetation: { icon: TreePine, label: "녹지" },
    wind: { icon: Wind, label: "통풍" },
    radiation: { icon: Thermometer, label: "복사" },
  };

  // 위험 점수 바 (0~4)
  const riskPercent = (thermal.risk_score / 4) * 100;

  return (
    <div
      className="dashboard-popup z-[1000] w-[320px] overflow-hidden border font-inherit"
    >
      {/* 헤더 */}
      <div
        style={{
          background: thermal.risk_color,
          padding: "14px 18px 12px",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{name}</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
            {zone_id} · {thermal.stress_category}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="건물 팝업 닫기"
          style={{
            background: "rgba(255,255,255,0.25)",
            border: "none",
            borderRadius: 8,
            padding: "4px 6px",
            cursor: "pointer",
            color: "white",
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-[14px_18px_18px]">
        {/* 주요 수치 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            { label: "기온", value: `${thermal.local_temp}°C` },
            { label: "체감", value: `${thermal.feels_like}°C` },
            { label: "UTCI", value: `${thermal.utci}°C` },
            { label: "WBGT", value: `${thermal.wbgt}°C` },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: riskBg,
                borderRadius: 10,
                padding: "8px 4px",
                textAlign: "center",
              }}
            >
              <div
                style={{ fontWeight: 700, marginBottom: 3 }}
                className="dashboard-label"
              >
                {label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 900 }} className="dashboard-text-primary">
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* 위험도 바 */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 5,
            }}
            className="dashboard-label"
          >
              <span>위험도</span>
              <span style={{ color: thermal.risk_color, fontWeight: 900 }}>
                {thermal.risk_level}
              </span>
          </div>
          <div
            style={{
              height: 6,
              background: "#f0f0f0",
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${riskPercent}%`,
                height: "100%",
                background: thermal.risk_color,
                borderRadius: 99,
              }}
            />
          </div>
        </div>

        {/* 미기후 인자 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 6,
            marginBottom: 14,
          }}
        >
          {Object.entries(factors).map(([key, val]) => {
            const meta = factorIcons[key] ?? { label: key };
            const Icon = meta.icon;
            return (
              <div
                key={key}
                style={{ borderRadius: 10, padding: "7px 4px", textAlign: "center" }}
                className="dashboard-popup-subtle"
              >
                {Icon && (
                  <Icon
                    size={13}
                    style={{
                      margin: "0 auto 3px",
                      display: "block",
                    }}
                    className="dashboard-muted"
                  />
                )}
                <div style={{ fontWeight: 700 }} className="dashboard-label">
                  {meta.label}
                </div>
                <div
                  style={{ fontSize: 10, fontWeight: 800, marginTop: 2 }}
                  className="dashboard-muted"
                >
                  {val.level}
                </div>
              </div>
            );
          })}
        </div>

        {/* 기준 대비 델타 */}
        <div
            style={{
              borderRadius: 10,
              padding: "8px 12px",
              marginBottom: 12,
              fontWeight: 700,
              color: delta.temp > 0 ? "#D32F2F" : "#1976D2",
            }}
            className="dashboard-popup-subtle dashboard-meta"
          >
            📍 {delta.label}
          </div>

        {/* 원인 설명 */}
          <div>
          <div
              className="dashboard-label"
              style={{
                marginBottom: 6,
              }}
            >
              원인 분석
            </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {reasons.map((r) => (
              <li
                key={r}
                  style={{
                    padding: "3px 0",
                    borderBottom:
                      r !== reasons[reasons.length - 1]
                        ? "1px solid var(--border-default)"
                        : "none",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 5,
                  }}
                  className="dashboard-muted dashboard-meta"
                >
                <span
                  style={{
                    color: thermal.risk_color,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  ·
                </span>
                {r}
              </li>
            ))}
          </ul>
        </div>

        {/* 현재 날씨 요약 */}
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px solid var(--border-default)",
            display: "flex",
            gap: 12,
            fontWeight: 700,
          }}
          className="dashboard-subtle dashboard-meta"
        >
          <span>🌡 기온 {base_weather.temperature}°C</span>
          <span>💧 습도 {base_weather.humidity}%</span>
          <span>💨 풍속 {base_weather.wind_speed}m/s</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  /* --------------------------------------------------------------
     UI 상태 (기존)
  -------------------------------------------------------------- */
  const [selectedId, setSelectedId] = useState("객체를 클릭해주세요");
  const [selectedArea, setSelectedArea] = useState(0);
  const [selectedPos, setSelectedPos] = useState(null);
  const [activeTab, setActiveTab] = useState("sim");
  const [mainTab, setMainTab] = useState("traffic");
  const [solarRadiation, setSolarRadiation] = useState(
    DEFAULT_MAY_SPECIFIC_YIELD,
  );
  const [efficiency, setEfficiency] = useState(20);
  const [roofRatio, setRoofRatio] = useState(DEFAULT_ROOF_RATIO);
  const [mode, setMode] = useState("realtime");
  const [simTemp, setSimTemp] = useState(20);
  const [sunlightIntensity, setSunlightIntensity] = useState(1.5);
  const [shadowIntensity, setShadowIntensity] = useState(0.02);
  const locationName = "순천시 매곡동";

  /* --------------------------------------------------------------
     ★ 날씨 API 상태
  -------------------------------------------------------------- */
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* --------------------------------------------------------------
     ★ 건물 팝업 상태
  -------------------------------------------------------------- */
  const [popupData, setPopupData] = useState(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupError, setPopupError] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [sunMonth, setSunMonth] = useState(() => new Date().getMonth() + 1);
  const [sunDay, setSunDay] = useState(() => new Date().getDate());
  const [sunHour, setSunHour] = useState(() => new Date().getHours());
  const [sunMinute, setSunMinute] = useState(() => new Date().getMinutes());
  const [designVariant, setDesignVariant] = useState(() =>
    getStoredPreference(DESIGN_STORAGE_KEY, "design3", ["design1", "design2", "design3"]),
  );
  const isCompact = designVariant === "design2" || designVariant === "design3";
  const [themePreference, setThemePreference] = useState(() =>
    getStoredPreference(THEME_STORAGE_KEY, "system", ["system", "light", "dark"]),
  );
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(248);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const orbitControlsRef = useRef(null);

  const resolvedTheme = themePreference === "system" ? systemTheme : themePreference;

  const refreshWeather = useCallback(() => {
    const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
    setLoading(true);
    setError(null);

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
        console.error("날씨 API 호출 실패:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  /* --------------------------------------------------------------
     ★ ① 날씨 API 호출 (마운트 시 1회)
  -------------------------------------------------------------- */
  useEffect(() => {
    refreshWeather();
  }, [refreshWeather]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    setSystemTheme(mediaQuery.matches ? "dark" : "light");

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DESIGN_STORAGE_KEY, designVariant);
  }, [designVariant]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.design = designVariant;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [designVariant, resolvedTheme]);

  useEffect(() => {
    if (!isResizingSidebar) return undefined;

    const handlePointerMove = (event) => {
      const nextWidth = Math.min(Math.max(event.clientX, 76), 360);
      setSidebarCollapsed(false);
      setSidebarWidth(nextWidth);
    };

    const stopResizing = () => setIsResizingSidebar(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [isResizingSidebar]);

  /* --------------------------------------------------------------
     ★ ② 건물 클릭 → 미기후 팝업 API 호출
   -------------------------------------------------------------- */
  const handleBuildingClick = async (obj) => {
    // CityModel에서 { name: elementId, parent: { name: elementId } } 형태로 전달됨
    const elementId =
      obj?.parent?.name && obj.parent.name !== "Scene"
        ? obj.parent.name
        : obj?.name;

    if (!elementId) return;

    // BLD_ 접두사가 없으면 미기후 데이터 없음 → 팝업 생략
    if (!elementId.startsWith("BLD_")) {
      setPopupData(null);
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
    setPopupLoading(true);
    setPopupError(null);
    setPopupData(null);

    try {
      const res = await fetch(
        `${API_URL}/microclimate/elements/${elementId}/popup`,
      );
      if (res.status === 404) {
        setPopupError("이 건물의 미기후 데이터가 없습니다.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPopupData(data);
    } catch (err) {
      console.error("팝업 API 호출 실패:", err);
      setPopupError("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setPopupLoading(false);
    }
  };

  /* --------------------------------------------------------------
     현재 선택된 건물·구역 데이터 (기존 로직)
  -------------------------------------------------------------- */
  const currentData = useMemo(() => {
    if (DUMMY_DATA[selectedId])
      return {
        ...DUMMY_DATA[selectedId],
        roofArea:
          selectedArea > 0 ? selectedArea : DUMMY_DATA[selectedId].roofArea,
      };
    if (selectedId === "객체를 클릭해주세요" || selectedId.startsWith("RPT-"))
      return DUMMY_DATA["선택된 객체 없음"];
    const hash = selectedId.length * 123;
    const finalArea =
      selectedArea > 0 ? selectedArea : Math.floor(hash * 1.2) + 500;
    return {
      power: `${(Math.floor(hash * 3.4) + 1200).toLocaleString()} kWh`,
      solar: `${(Math.floor(hash * 1.5) + 400).toLocaleString()} kWh`,
      roofArea: finalArea,
      status: [
        {
          name: "메인 전력량계",
          status: "정상",
          isGood: true,
          value: `${Math.floor(hash * 3.4) + 1200} kWh`,
          icon: Zap,
        },
        {
          name: "태양광 인버터",
          status: "정상",
          isGood: true,
          value: `${(Math.floor(hash * 0.1) % 10) + 90}% 효율`,
          icon: Sun,
        },
      ],
    };
  }, [selectedId, selectedArea]);

  const activeWeather = useMemo(() => {
    if (!weatherData) return null;
    if (mode === "simulation") {
      return {
        ...weatherData.base_weather,
        temperature: simTemp,
      };
    }
    return weatherData.base_weather;
  }, [weatherData, mode, simTemp]);

  const activeAlerts = useMemo(() => {
    if (!activeWeather) return [];
    return ALERT_RULES.filter((rule) => rule.check(activeWeather));
  }, [activeWeather]);

  const sunSimulationDate = useMemo(
    () =>
      mode === "realtime"
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
    [currentTime, mode, sunMonth, sunDay, sunHour, sunMinute],
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

  const scenePalette = useMemo(
    () =>
      !sunState.visible
        ? {
            background: isCompact ? "#0b1220" : "#0f172a",
            ambientIntensity: 0.08,
            stageIntensity: isCompact ? 0.12 : 0.16,
          }
        : designVariant === "design2"
        ? {
            background: "#d9e1e7",
            ambientIntensity: 0.28,
            stageIntensity: 0.46,
          }
        : {
            background: "#d4dee7",
            ambientIntensity: 0.3,
            stageIntensity: 0.6,
          },
    [designVariant, sunState.visible],
  );

  const solarResult = useMemo(() => {
    const result = calculateMayPvOutput({
      roofArea: currentData.roofArea || 0,
      roofRatio,
      moduleEfficiency: efficiency,
      systemLoss: DEFAULT_SYSTEM_LOSS,
      maySpecificYield: solarRadiation,
    });

    return {
      totalArea: currentData.roofArea || 0,
      selectedArea: result.moduleArea,
      energy: result.monthlyOutput,
      nominalPowerKw: result.nominalPowerKw,
      maySpecificYield: solarRadiation,
    };
  }, [currentData, efficiency, roofRatio, solarRadiation]);

  const confirmedCount = trafficData.filter((d) => d.status === "확정").length;
  const aiFastTrack = trafficData.filter(
    (d) => d.status === "확정" && d.ai_confidence >= 0.45,
  ).length;
  const totalPoints = trafficData.reduce((acc, d) => acc + d.earned_points, 0);
  const formattedTime = useMemo(
    () =>
      currentTime.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [currentTime],
  );
  const formattedDate = useMemo(
    () =>
      currentTime.toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }),
    [currentTime],
  );
  const systemStatus = loading
    ? "기상 데이터 갱신 중"
    : error
      ? "기상 API 연결 확인 필요"
      : mode === "simulation"
        ? "시뮬레이션 모드"
        : "실시간 데이터 연결 정상";
  const currentDesignLabel = designVariant === "design1" ? "디자인1" : designVariant === "design2" ? "디자인2" : "디자인3";
  const isRailIconOnly = sidebarCollapsed || sidebarWidth <= 96;
  const effectiveSidebarWidth = isRailIconOnly ? 76 : sidebarWidth;
  const navItems = [
    { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  ];

  /* --------------------------------------------------------------
     UI 렌더링
   -------------------------------------------------------------- */
  return (
    <div
      className="dashboard-root relative h-screen w-screen overflow-hidden font-sans"
      data-theme={resolvedTheme}
      data-design={designVariant}
    >
      <div className="absolute inset-0 z-0">
        <Canvas shadows camera={{ position: [80, 60, 80], fov: 25 }}>
          <color attach="background" args={[scenePalette.background]} />
          {sunState.visible && <Sky sunPosition={sunVector} distance={450000} turbidity={8} />}
          <ambientLight intensity={scenePalette.ambientIntensity * (1 + (0.02 - shadowIntensity) * 10)} />
          <spotLight
            position={[20, 35, 25]}
            angle={0.2}
            penumbra={1}
            intensity={sunState.visible ? 0.35 : 0.08}
            castShadow
            shadow-normalBias={shadowIntensity}
          />
          <directionalLight
            position={sunVector}
            intensity={sunState.visible ? sunlightIntensity : 0}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0002}
            shadow-normalBias={shadowIntensity}
          >
            <orthographicCamera
              attach="shadow-camera"
              args={[-180, 180, 180, -180, 1, 500]}
            />
          </directionalLight>
          {sunState.visible && (
            <mesh position={sunVector}>
              <sphereGeometry args={[7, 24, 24]} />
              <meshBasicMaterial color="#ffd15c" />
            </mesh>
          )}
          <Stage environment={sunState.visible ? "city" : null} intensity={scenePalette.stageIntensity} contactShadow={false}>
            <CityModel
              onSelect={(name, area, pos) => {
                setSelectedId(name);
                setSelectedArea(area ?? 0);
                if (pos) setSelectedPos(pos);
              }}
              selectedId={selectedId}
              onBuildingClick={handleBuildingClick}
              controlsRef={orbitControlsRef}
              isNight={!sunState.visible}
            />
            {false &&
              trafficData.map((d) => {
                const SCALE = 14500;
                const x = (d.longitude - 127.481) * SCALE;
                const z = -(d.latitude - 34.969) * SCALE;
                const isAlert = d.status === "확정";
                const color = isAlert ? "bg-red-500" : "bg-gray-400/90";
                const isSelected = selectedId === `RPT:${d.report_id}`;
                return (
                  <mesh key={d.report_id} position={[x, 5, z]}>
                    <Html center zIndexRange={[100, 0]}>
                      <div className="relative flex flex-col items-center">
                        {isSelected && (
                          <div className="pointer-events-none absolute bottom-[calc(100%+8px)] z-[1000] flex w-max max-w-[200px] flex-col rounded-xl border border-gray-100 bg-white p-3 text-slate-800 shadow-xl">
                            <strong className="mb-1 flex items-center gap-1 text-sm text-blue-600">
                              <ShieldAlert size={14} /> {d.category}
                            </strong>
                            <span className="text-[10px] text-gray-500">
                              신뢰도: {(d.final_trust_score * 100).toFixed(0)}%
                            </span>
                            <span className="mt-1 text-[10px] font-bold text-red-500">
                              {d.status} 처리
                            </span>
                            <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-gray-100 bg-white" />
                          </div>
                        )}
                        <button
                          type="button"
                          className={`cursor-pointer rounded-full p-2 text-white shadow-xl ${color} ${isSelected ? "ring-4 ring-red-200" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(`RPT:${d.report_id}`);
                          }}
                        >
                          <AlertTriangle size={isAlert ? 16 : 12} />
                        </button>
                      </div>
                    </Html>
                  </mesh>
                );
              })}
          </Stage>
          {popupData && !popupLoading && selectedPos && (
            <Html position={selectedPos} center zIndexRange={[1000, 0]}>
              <BuildingPopup data={popupData} onClose={() => setPopupData(null)} />
            </Html>
          )}
          <OrbitControls
            ref={orbitControlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.05}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={30}
            maxDistance={150}
          />
        </Canvas>

        <div className="dashboard-overlay-radial pointer-events-none absolute inset-0 z-[1]" />
        <div className="dashboard-overlay-linear pointer-events-none absolute inset-0 z-[1]" />

        {popupLoading && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 999,
              background: "white",
              borderRadius: 12,
              padding: "12px 18px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
              fontSize: 13,
              fontWeight: 700,
              color: "#555",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                border: "2px solid #ddd",
                borderTopColor: "#555",
                borderRadius: "50%",
              }}
            />
            미기후 데이터 불러오는 중…
          </div>
        )}

        {popupError && !popupLoading && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 999,
              background: "white",
              borderRadius: 12,
              padding: "12px 18px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
              fontSize: 12,
              color: "#D32F2F",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <AlertTriangle size={16} />
            {popupError}
            <button
              type="button"
              onClick={() => setPopupError(null)}
              aria-label="팝업 오류 메시지 닫기"
              style={{
                marginLeft: 8,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#aaa",
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="pointer-events-none relative z-10 flex h-full overflow-hidden">
        <aside
          className="dashboard-rail pointer-events-auto relative flex h-full shrink-0 flex-col border-r"
          style={{ width: effectiveSidebarWidth }}
        >
          <div className="flex items-center justify-between px-3 py-3">
            {!isRailIconOnly && (
              <div>
                <div className="dashboard-label">Workspace</div>
                <div className="dashboard-tactical-title mt-1 font-black">Control Rail</div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label="사이드바 펼치기 축소"
              className="dashboard-ghost-button inline-flex h-9 w-9 items-center justify-center"
            >
              {isRailIconOnly ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-1 px-2 py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className="dashboard-rail-item inline-flex items-center gap-3 px-3 py-3 text-left"
                  data-active={isActive}
                >
                  <Icon size={18} className="shrink-0" />
                  {!isRailIconOnly && (
                    <span className="dashboard-tactical-title text-[11px] font-bold">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-auto border-t border-[var(--border-default)] px-2 py-2">
            <button
              type="button"
              onClick={() => setActiveSection("settings")}
              className="dashboard-rail-item inline-flex w-full items-center gap-3 px-3 py-3 text-left"
              data-active={activeSection === "settings"}
            >
              <Settings size={18} className="shrink-0" />
              {!isRailIconOnly && (
                <span className="dashboard-tactical-title text-[11px] font-bold">설정</span>
              )}
            </button>
          </div>

          {!isRailIconOnly && (
            <button
              type="button"
              onPointerDown={() => setIsResizingSidebar(true)}
              aria-label="사이드바 크기 조절"
              className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent"
            >
              <span className="absolute right-0 top-1/2 h-20 w-[2px] -translate-y-1/2 bg-[var(--border-strong)] opacity-70" />
            </button>
          )}
        </aside>

        <div className="pointer-events-none flex h-full min-w-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
        <div className="dashboard-top-shell h-10 pointer-events-auto grid shrink-0 grid-cols-1 gap-0 border-x border-b px-3 py-3 xl:grid-cols-[200px_minmax(0,1fr)_200px] xl:items-stretch">
          <div className="dashboard-card-muted flex items-center gap-2 px-3 py-2">
            <div className="dashboard-card-strong flex h-11 w-11 items-center justify-center text-[var(--text-strong-inverse)]">
              <Clock3 size={18} />
            </div>
            <div>
              <div className="dashboard-tactical-title text-base font-black tracking-tight">
                {formattedTime}
              </div>
              <div className="dashboard-muted text-[10px] font-medium">
                {formattedDate}
              </div>
            </div>
          </div>

          <div className="dashboard-card flex flex-col items-center justify-center gap-2 px-2 py-2 text-center">
            <div className="grid w-full grid-cols-2 gap-1.5 md:grid-cols-4 xl:grid-cols-6">
              <div className="dashboard-muted flex flex-wrap items-center justify-center gap-1.5 text-[12px] font-bold">
                <span className="dashboard-pill inline-flex items-center gap-1 px-3 py-1">
                  <MapPin size={12} /> {locationName}
                </span>
              </div>
              <div className="dashboard-soft-surface px-1 py-1" style={{ borderRadius: "var(--card-radius)" }}>
                <div className="dashboard-label">기온</div>
                <div className="dashboard-tactical-title mt-0.5 font-black">
                  {activeWeather?.temperature ?? "-"}°
                </div>
              </div>
              <div className="dashboard-soft-surface px-1 py-1" style={{ borderRadius: "var(--card-radius)" }}>
                <div className="dashboard-label">하늘</div>
                <div className="dashboard-tactical-title mt-0.5 font-black">
                  {activeWeather?.sky ?? "-"}
                </div>
              </div>
              <div className="dashboard-soft-surface px-1 py-1" style={{ borderRadius: "var(--card-radius)" }}>
                <div className="dashboard-label">습도</div>
                <div className="dashboard-tactical-title mt-0.5 font-black">
                  {activeWeather?.humidity ?? "-"}%
                </div>
              </div>
              <div className="dashboard-soft-surface px-1 py-1" style={{ borderRadius: "var(--card-radius)" }}>
                <div className="dashboard-label">PM10</div>
                <div className="dashboard-tactical-title mt-0.5 font-black">
                  {weatherData?.base_weather?.pm10 ?? "-"}
                </div>
              </div>
              <div className="dashboard-soft-surface px-1 py-1 md:col-span-2 xl:col-span-1" style={{ borderRadius: "var(--card-radius)" }}>
                <div className="dashboard-label">대기질</div>
                <div className="dashboard-tactical-title mt-0.5 font-black">
                  {weatherData?.summary?.air_quality_status ?? "-"}
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-card-strong flex items-center justify-between gap-2 px-3 py-3">
            <div>
              <div className="dashboard-label flex items-center gap-1.5">
                <Activity size={14} /> 상태
              </div>
              <div className="dashboard-tactical-title mt-0.5 font-bold">{systemStatus}</div>
              <div className="dashboard-muted dashboard-meta mt-0.5">
                {activeAlerts.length}개 경보 · {mainTab === "energy" ? "에너지" : "교통/안전"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshWeather}
                disabled={loading}
                aria-label="날씨 데이터 새로고침"
                className="dashboard-ghost-button inline-flex h-9 w-9 items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>
        </div>

        {activeSection === "settings" ? (
          <div className={`grid min-h-0 flex-1 ${isCompact ? "gap-0 pt-0" : "gap-2 pt-2"}`}>
            <section className="dashboard-right-panel pointer-events-auto flex min-h-0 flex-col gap-3 border p-4">
              <div className="dashboard-card-strong px-4 py-4">
                <div className="dashboard-label">Settings</div>
                <div className="dashboard-tactical-title mt-1 font-black">디자인 및 테마 설정</div>
              </div>

              <div className="dashboard-card p-4">
                <div className="dashboard-label">디자인 변경</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDesignVariant("design1")}
                    className="dashboard-segment px-4 py-2 text-[11px] font-bold"
                    data-active={designVariant === "design1"}
                  >
                    디자인1
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesignVariant("design2")}
                    className="dashboard-segment px-4 py-2 text-[11px] font-bold"
                    data-active={designVariant === "design2"}
                  >
                    디자인2
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesignVariant("design3")}
                    className="dashboard-segment px-4 py-2 text-[11px] font-bold"
                    data-active={designVariant === "design3"}
                  >
                    디자인3
                  </button>
                </div>
              </div>

              <div className="dashboard-card p-4">
                <div className="dashboard-label">테마</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ["system", "AUTO"],
                    ["dark", "DARK"],
                    ["light", "LIGHT"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setThemePreference(value)}
                      className="dashboard-segment px-4 py-2 text-[11px] font-bold"
                      data-active={themePreference === value}
                      aria-label={`테마 ${label}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="dashboard-card-muted p-4 text-[12px] font-semibold dashboard-muted">
                현재 {currentDesignLabel} · {resolvedTheme === "dark" ? "다크" : "라이트"}
              </div>
            </section>
          </div>
        ) : (
        <div className={`grid min-h-0 flex-1 grid-cols-1 ${isCompact ? "gap-0 pt-0" : "gap-2 pt-2"} ${designVariant === "design2" ? "xl:grid-cols-[280px_minmax(0,1fr)_320px]" : designVariant === "design3" ? "xl:grid-cols-[200px_minmax(0,1fr)_300px]" : "xl:grid-cols-[220px_minmax(0,1fr)_280px]"} ${isCompact ? "xl:gap-0" : "xl:gap-2"}`}>
          <aside className="dashboard-side-panel pointer-events-auto order-2 flex min-h-0 flex-col border p-2 xl:order-1">
            <div className="dashboard-card-strong mb-2 px-3 py-3">
              <div className="dashboard-label">
                {mainTab === "energy" ? "에너지 모델" : "교통/안전 모델"}
              </div>
              <div className="dashboard-tactical-title mt-1 font-black">
                {mainTab === "energy"
                  ? "시뮬레이터 · 전력 · 설비 현황"
                  : "위험 구역 · 신고 · 패스트트랙 현황"}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
              {mainTab === "energy" ? (
                <>
                    <div className="bg-white p-3 shadow-sm">
                      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-gray-800">
                        <Zap size={18} className="text-blue-600" /> 전력 소비량
                      </h3>
                      <div className="bg-slate-50 px-3 py-4 text-center shadow-inner">
                      <div className="dashboard-label">
                        현재 선택 구역
                      </div>
                      <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                        {currentData.power}
                      </div>
                    </div>
                  </div>

                    <div className="bg-white p-3 shadow-sm">
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-gray-800">
                      <Activity size={18} className="text-emerald-500" /> 교내 혼잡도
                    </h3>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-xl bg-emerald-50 px-2 py-3">
                        <p className="text-[10px] font-bold text-emerald-700">차량</p>
                        <p className="mt-1 text-lg font-black text-emerald-600">67</p>
                      </div>
                      <div className="rounded-xl bg-orange-50 px-2 py-3">
                        <p className="text-[10px] font-bold text-orange-700">사람</p>
                        <p className="mt-1 text-lg font-black text-orange-500">128</p>
                      </div>
                      <div className="rounded-xl bg-blue-50 px-2 py-3">
                        <p className="text-[10px] font-bold text-blue-700">킥보드</p>
                        <p className="mt-1 text-lg font-black text-blue-500">23</p>
                      </div>
                    </div>
                  </div>

                    <div className="bg-white p-3 shadow-sm">
                    <h3 className="mb-2 text-xs font-extrabold text-gray-800">
                      설비 상태
                    </h3>
                    {currentData.status.length > 0 ? (
                      <ul className="space-y-1.5 text-[10px] font-semibold">
                        {currentData.status.map((item) => {
                          const Icon = item.icon;
                          return (
                            <li key={item.name} className="flex min-h-[52px] items-center justify-between bg-slate-50 px-2.5 py-2">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="rounded-lg bg-emerald-100 p-1.5 text-emerald-600">
                                  <Icon size={12} />
                                </span>
                                <span className="truncate text-slate-700">{item.name}</span>
                              </span>
                                <span className="text-right">
                                  <span className={`block text-[10px] ${item.isGood ? "text-emerald-500" : "text-amber-500"}`}>
                                    ● {item.status}
                                  </span>
                                  <span className="font-black text-slate-700">{item.value}</span>
                                </span>
                              </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="bg-slate-50 px-3 py-8 text-center text-xs font-semibold text-slate-400">
                        시설 선택 시 표시
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-white p-3 shadow-sm">
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-gray-800">
                      <ShieldAlert size={18} className="text-red-500" /> 확정 위험 구역
                    </h3>
                    <div className="bg-red-50 px-3 py-4 text-center">
                      <div className="text-2xl font-black text-red-500">{confirmedCount}건</div>
                      <div className="mt-1 text-[10px] font-semibold text-red-400">보안/출동 대기</div>
                    </div>
                  </div>

                  <div className="bg-white p-3 shadow-sm">
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-gray-800">
                      <CheckCircle size={18} className="text-emerald-500" /> AI 패스트트랙
                    </h3>
                    <div className="bg-emerald-50 px-3 py-4 text-center">
                      <div className="text-2xl font-black text-emerald-500">{aiFastTrack}건</div>
                      <div className="mt-1 text-[10px] font-semibold text-emerald-400">0초만에 처리된 스마트 확정</div>
                    </div>
                  </div>

                  <div className="bg-white p-3 shadow-sm">
                    <h3 className="mb-2 text-xs font-extrabold text-gray-800">최근 접수 내역</h3>
                    <ul className="space-y-1.5 text-[10px] font-semibold">
                      {trafficData.slice(0, 4).map((d) => (
                        <li
                          key={d.report_id}
                          className="flex min-h-[52px] items-center justify-between bg-slate-50 px-2.5 py-2"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={`rounded-lg p-1.5 text-white ${d.status === "확정" ? "bg-red-400" : "bg-slate-400"}`}
                            >
                              <AlertTriangle size={12} />
                            </span>
                            <span className="truncate text-slate-700">{d.category}</span>
                          </span>
                          <span className="text-right text-[10px]">
                            <span
                              className={`block ${d.status === "확정" ? "text-red-500" : "text-slate-400"}`}
                            >
                              {d.status}
                            </span>
                            <span className="font-bold text-slate-500">
                              {new Date(d.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMainTab("energy")}
                className={`rounded-[12px] border p-3 text-center ${
                  mainTab === "energy"
                    ? "border-blue-200 bg-blue-50 shadow-sm"
                    : "border-transparent bg-white hover:bg-slate-50"
                }`}
              >
                <Activity
                  size={18}
                  className={`mx-auto mb-2 ${mainTab === "energy" ? "text-blue-500" : "text-slate-400"}`}
                />
                <p className={`text-[11px] font-black ${mainTab === "energy" ? "text-blue-700" : "text-slate-500"}`}>
                  에너지 모델
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMainTab("traffic")}
                className={`rounded-[12px] border p-3 text-center ${
                  mainTab === "traffic"
                    ? "border-pink-200 bg-pink-50 shadow-sm"
                    : "border-transparent bg-white hover:bg-slate-50"
                }`}
              >
                <Zap
                  size={18}
                  className={`mx-auto mb-2 ${mainTab === "traffic" ? "text-pink-500" : "text-slate-400"}`}
                />
                <p className={`text-[11px] font-black ${mainTab === "traffic" ? "text-pink-700" : "text-slate-500"}`}>
                  교통/안전 모델
                </p>
              </button>
            </div>
          </aside>

          <div className="order-1 min-h-[220px] xl:order-2 xl:min-h-0" />

          <aside className="dashboard-right-panel pointer-events-auto order-3 flex min-h-0 flex-col gap-2 overflow-y-auto border p-2">
            {mainTab === "energy" ? (
              <>
                    <div className="bg-slate-50/90 p-3 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="dashboard-label">
                        Energy Controls
                      </div>
                      <h2 className="mt-1 text-base font-black text-slate-900">실시간 · 시뮬레이션 제어</h2>
                    </div>
                    <Cloud size={30} className="text-slate-300" />
                  </div>

                  <div className="mb-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMode("realtime")}
                        className={`px-3 py-1.5 text-[11px] font-bold ${mode === "realtime" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-500"}`}
                      >
                      실시간
                    </button>
                      <button
                        type="button"
                        onClick={() => setMode("simulation")}
                        className={`px-3 py-1.5 text-[11px] font-bold ${mode === "simulation" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-500"}`}
                      >
                      시뮬레이션
                    </button>
                  </div>

                  {mode === "simulation" && (
                    <div className="mb-2 bg-white px-3 py-2 shadow-sm space-y-2">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>온도 조절</span>
                        <span>{simTemp}°</span>
                      </div>
                      <input
                        type="range"
                        min="-10"
                        max="45"
                        value={simTemp}
                        onChange={(e) => setSimTemp(parseInt(e.target.value, 10))}
                        className="w-full accent-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600">
                      <label className="space-y-1">
                        <span className="flex items-center gap-1"><CalendarDays size={12} /> 월 {sunMonth}</span>
                        <input type="range" min="1" max="12" value={sunMonth} onChange={(e) => setSunMonth(parseInt(e.target.value, 10))} className="w-full accent-orange-500" />
                      </label>
                      <label className="space-y-1">
                        <span>일 {sunDay}</span>
                        <input type="range" min="1" max="31" value={sunDay} onChange={(e) => setSunDay(parseInt(e.target.value, 10))} className="w-full accent-orange-500" />
                      </label>
                      <label className="space-y-1">
                        <span className="flex items-center gap-1"><Clock4 size={12} /> 시 {sunHour}</span>
                        <input type="range" min="0" max="23" value={sunHour} onChange={(e) => setSunHour(parseInt(e.target.value, 10))} className="w-full accent-orange-500" />
                      </label>
                      <label className="space-y-1">
                        <span>분 {sunMinute}</span>
                        <input type="range" min="0" max="59" value={sunMinute} onChange={(e) => setSunMinute(parseInt(e.target.value, 10))} className="w-full accent-orange-500" />
                      </label>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>태양빛 강도</span>
                        <span>{sunlightIntensity.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={sunlightIntensity}
                        onChange={(e) => setSunlightIntensity(parseFloat(e.target.value))}
                        className="w-full accent-yellow-500"
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>그림자 강도</span>
                        <span>{shadowIntensity.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.01"
                        max="0.1"
                        step="0.01"
                        value={shadowIntensity}
                        onChange={(e) => setShadowIntensity(parseFloat(e.target.value))}
                        className="w-full accent-slate-500"
                      />
                    </div>
                  </div>
                  )}

                    <div className="bg-white px-3 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
                      <span>{mode === "simulation" ? "시뮬레이션 기준" : "실시간 기준"}</span>
                      <span>{mode === "simulation" ? `${sunMonth}/${sunDay} ${String(sunHour).padStart(2, "0")}:${String(sunMinute).padStart(2, "0")}` : formattedTime}</span>
                    </div>
                      <div className="mt-2 bg-slate-50 px-3 py-3 text-[11px] font-semibold text-slate-600">
                      현재 태양 고도 {(sunState.altitude * 180 / Math.PI).toFixed(1)}° · {sunState.visible ? "주간" : "야간"}
                    </div>

                    {error && (
                        <div className="mt-2 border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                          {error}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-3 shadow-sm">
                  <h3 className="mb-2 text-xs font-black text-slate-900">열 관련 지수 / 경보</h3>
                  <div className="space-y-1.5">
                    {activeAlerts.length > 0 ? (
                      activeAlerts.map((alert) => (
                        <AlertBadge key={alert.id} label={alert.label} />
                      ))
                    ) : (
                        <div className="bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-400">
                          현재 활성 경보가 없습니다.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-[#f8f9fa] p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-xs font-black text-gray-800">
                      <Sun size={20} className="text-orange-500" /> 시뮬레이터
                    </h3>
                      <div className="flex bg-gray-200/70 p-0.5">
                      <button
                        type="button"
                        onClick={() => setActiveTab("sim")}
                          className={`px-2.5 py-1 text-[10px] font-bold ${activeTab === "sim" ? "bg-white text-slate-900 shadow-sm" : "text-gray-500"}`}
                      >
                        SIM
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("set")}
                          className={`px-2.5 py-1 text-[10px] font-bold ${activeTab === "set" ? "bg-white text-slate-900 shadow-sm" : "text-gray-500"}`}
                      >
                        SET
                      </button>
                    </div>
                  </div>

                    <div className="mb-2 bg-white p-3 shadow-sm">
                    <p className="mb-1 text-[10px] font-bold text-gray-500">5월 예상 발전량</p>
                    <div className="text-xl font-black text-gray-800">
                      {solarResult.energy.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      kWh
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span>PVGIS 5월 기준</span>
                        <span>{solarResult.maySpecificYield} kWh/kWp</span>
                      </div>
                      <input
                        type="range"
                        min="150"
                        max="190"
                        value={solarRadiation}
                        onChange={(e) =>
                          setSolarRadiation(parseInt(e.target.value, 10))
                        }
                        className="h-1 w-full accent-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span>패널 효율</span>
                        <span>{efficiency}%</span>
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="25"
                        value={efficiency}
                        onChange={(e) => setEfficiency(parseInt(e.target.value, 10))}
                        className="h-1 w-full accent-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span>옥상 비율</span>
                        <span>{roofRatio}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={roofRatio}
                        onChange={(e) => setRoofRatio(parseInt(e.target.value, 10))}
                        className="h-1 w-full accent-blue-500"
                      />
                    </div>
                    <div className="bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-600">
                      기본값: 옥상 면적 {DEFAULT_ROOF_RATIO}%, System loss {DEFAULT_SYSTEM_LOSS}% · 현재 태양 고도 {(sunState.altitude * 180 / Math.PI).toFixed(1)}°
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-pink-50 p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="flex items-center gap-1.5 text-base font-black text-pink-700">
                      <Smartphone className="text-pink-500" /> 스마트 리포팅
                    </h2>
                    <div className="bg-white px-2.5 py-1 text-[10px] font-bold text-pink-500">
                      실시간 접수
                    </div>
                  </div>

                  <div className="border border-pink-100 bg-white px-3 py-3 shadow-sm">
                    <div className="text-[10px] font-bold text-pink-600">참여자 리워드 지급 현황</div>
                    <div className="mt-1 flex items-end gap-1 text-2xl font-black text-pink-700">
                      {totalPoints} <span className="mb-1 text-base font-bold">P</span>
                    </div>
                  </div>

                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <div className="bg-white p-2.5 text-center shadow-sm">
                      <div className="text-[10px] font-bold text-gray-500">전체 접수건</div>
                      <div className="mt-1 text-lg font-black text-gray-800">{trafficData.length}건</div>
                    </div>
                      <div className="bg-white p-2.5 text-center shadow-sm">
                      <div className="text-[10px] font-bold text-gray-500">출동 완료</div>
                      <div className="mt-1 text-lg font-black text-red-500">{confirmedCount}건</div>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 bg-[#f8f9fa] p-3 shadow-sm">
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black text-gray-800">
                    <FileText size={18} className="text-blue-500" /> 신고 내역 모니터링
                  </h3>
                  <div className="h-full space-y-1.5 overflow-y-auto pr-0.5">
                    {trafficData.map((d) => (
                      <div
                        key={d.report_id}
                        className="border border-gray-100 bg-white p-2.5 shadow-sm"
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs font-bold">{d.category}</span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold ${
                              d.status === "확정"
                                ? "bg-red-100 text-red-600"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {d.status}
                          </span>
                        </div>
                        <div className="flex items-end justify-between">
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
          </aside>
        </div>
        )}
        </div>
      </div>
    </div>
  );
}
