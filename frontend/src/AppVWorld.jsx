import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
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
  X,
} from "lucide-react";
import VWorldRenderer from "./vworld/VWorldRenderer";
import trafficData from "./utils/trafficData.json";
import { EnergyDashboard } from "./features/energy/dashboard/EnergyDashboard";
import { CampusComparison } from "./features/energy/campus/CampusComparisonPanel";
import {
  createInstallationPlanClient,
  createPlanDraftFromExisting,
} from "./features/energy/installations/installationPlanApi.mjs";
import { BuildingAnalysis } from "./features/energy/analysis";
import {
  CAMPUS_LOCATION,
  createSimulationDate,
  getSunState,
} from "./utils/sunPosition.mjs";

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

function getCompassDirection(degrees) {
  const directions = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return directions[Math.round(degrees / 45) % directions.length];
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

function SliderRow({ label, valueLabel, min, max, step = 1, value, onValueChange }) {
  const stopVWorldInputHandling = (event) => event.stopPropagation();
  const updateFromPointer = (event) => {
    event.stopPropagation();
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - left) / width));
    const steppedValue = min + Math.round(((max - min) * ratio) / step) * step;
    onValueChange(Math.min(max, Math.max(min, steppedValue)));
  };
  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromPointer(event);
  };
  const handlePointerMove = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      updateFromPointer(event);
    }
  };
  const handleKeyDown = (event) => {
    const keyDeltas = {
      ArrowDown: -step,
      ArrowLeft: -step,
      ArrowRight: step,
      ArrowUp: step,
      PageDown: -step * 10,
      PageUp: step * 10,
    };

    let nextValue = value;
    if (event.key === "Home") nextValue = min;
    else if (event.key === "End") nextValue = max;
    else if (event.key in keyDeltas) nextValue = value + keyDeltas[event.key];
    else {
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onValueChange(Math.min(max, Math.max(min, nextValue)));
  };

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
        aria-label={label}
        onChange={(event) => onValueChange(Number(event.target.value))}
        onClick={stopVWorldInputHandling}
        onKeyDown={handleKeyDown}
        onMouseDown={stopVWorldInputHandling}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onTouchStart={stopVWorldInputHandling}
        className="w-full accent-[var(--colors-primary)] pointer-events-auto"
      />
    </div>
  );
}

export default function App() {
  const [selectedId, setSelectedId] = useState("");
  const [selectedBuildingId, setSelectedBuildingId] = useState("D4");
  const [editorRequest, setEditorRequest] = useState(null);
  const [installationPlans, setInstallationPlans] = useState([]);
  const [representativePlanId, setRepresentativePlanId] = useState(null);
  const [installationRefreshKey, setInstallationRefreshKey] = useState(0);
  const [overlayRefreshKey, setOverlayRefreshKey] = useState(0);
  const installationLoadGenerationRef = useRef(0);
  const installationPlanClient = useMemo(() => createInstallationPlanClient(), []);
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
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, parking, safety, energy, environment
  const [isPanelOpen, setIsPanelOpen] = useState(true);
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

  const sceneBackground = sunState.visible ? "#d6e0e6" : "#09111d";
  const sunAltitudeDegrees = (sunState.altitude * 180) / Math.PI;
  const sunBearingDegrees = ((sunState.azimuth * 180) / Math.PI + 540) % 360;
  const sunBearingRadians = (sunBearingDegrees * Math.PI) / 180;
  const sunGlowX = 50 + Math.sin(sunBearingRadians) * 55;
  const sunGlowY = 50 - Math.cos(sunBearingRadians) * 55;
  const sunGlowOpacity = sunState.visible
    ? Math.min(0.28, 0.12 + Math.max(0, sunAltitudeDegrees) / 300)
    : 0;
  const nightOverlayOpacity = Math.min(
    0.68,
    Math.max(0, ((6 - sunAltitudeDegrees) / 12) * 0.68),
  );
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

  const fetchPopupData = useCallback(async (elementId) => {
    if (!elementId?.startsWith("BLD_")) {
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

  const handleVWorldSelection = useCallback(
    ({ elementId, buildingId, displayName }) => {
      if (buildingId !== selectedBuildingId) {
        installationLoadGenerationRef.current += 1;
        setInstallationPlans([]);
        setRepresentativePlanId(null);
      }
      setSelectedId(displayName);
      setSelectedBuildingId(buildingId);
      setActiveTab("energy");
      setPopupData(null);
      setPopupError(null);
      fetchPopupData(elementId);
    },
    [fetchPopupData, selectedBuildingId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const requestGeneration = installationLoadGenerationRef.current + 1;
    installationLoadGenerationRef.current = requestGeneration;
    let active = true;
    setInstallationPlans([]);
    setRepresentativePlanId(null);
    Promise.all([
      installationPlanClient.listDetails(selectedBuildingId, { signal: controller.signal }),
      installationPlanClient.getRepresentative(selectedBuildingId, { signal: controller.signal }),
    ]).then(([plans, representative]) => {
      if (!active || installationLoadGenerationRef.current !== requestGeneration) return;
      setInstallationPlans(plans);
      setRepresentativePlanId(representative?.installationPlanId ?? null);
    }).catch((loadError) => {
      if (!active || installationLoadGenerationRef.current !== requestGeneration || loadError?.name === "AbortError") return;
      setInstallationPlans([]);
      setRepresentativePlanId(null);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [installationPlanClient, installationRefreshKey, selectedBuildingId]);

  const createInstallationPlanDraft = useCallback(
    (context) => createPlanDraftFromExisting(context),
    [],
  );

  const handleInstallationPlansChange = useCallback((plans) => {
    installationLoadGenerationRef.current += 1;
    setInstallationPlans(plans);
  }, []);

  const handleRepresentativeInstallationPlanChange = useCallback((representative) => {
    installationLoadGenerationRef.current += 1;
    setRepresentativePlanId(representative?.installationPlanId ?? null);
    setOverlayRefreshKey((value) => value + 1);
  }, []);

  return (
    <div className="dashboard-root relative h-screen w-screen overflow-hidden bg-[var(--colors-canvas)] text-[var(--colors-ink)]">
      <div className="absolute inset-0" style={{ background: sceneBackground }} />

      <div className="absolute inset-0 z-0">
      <VWorldRenderer
        onSelection={handleVWorldSelection}
        simulationDate={sunSimulationDate}
        editorRequest={editorRequest}
        onEditorClose={() => {
          setEditorRequest(null);
          setInstallationRefreshKey((value) => value + 1);
          setOverlayRefreshKey((value) => value + 1);
        }}
        onPlanSaved={() => {
          setInstallationRefreshKey((value) => value + 1);
          setOverlayRefreshKey((value) => value + 1);
        }}
        createInstallationPlanDraft={createInstallationPlanDraft}
        installationPlanRefreshKey={installationRefreshKey}
        onInstallationPlansChange={handleInstallationPlansChange}
        onRepresentativeInstallationPlanChange={handleRepresentativeInstallationPlanChange}
        representativeRefreshKey={overlayRefreshKey}
      />
      </div>

      <div
        className="pointer-events-none absolute bottom-0 left-0 top-0 z-[1] transition-[right,background-color] duration-300"
        style={{
          right: isPanelOpen ? "var(--dashboard-panel-width)" : "0px",
          backgroundColor: `rgba(3, 10, 24, ${nightOverlayOpacity})`,
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 top-0 z-[2] transition-[right,opacity] duration-300"
        style={{
          right: isPanelOpen ? "var(--dashboard-panel-width)" : "0px",
          background: `radial-gradient(circle at ${sunGlowX}% ${sunGlowY}%, rgba(255, 218, 138, ${sunGlowOpacity}) 0%, transparent 42%)`,
        }}
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,1,2,0.02)_0%,rgba(1,1,2,0.08)_50%,rgba(1,1,2,0.16)_100%)]" />

      {/* 패널 토글 버튼 */}
      <button
        onClick={() => setIsPanelOpen(v => !v)}
        aria-label={isPanelOpen ? "대시보드 패널 닫기" : "대시보드 패널 열기"}
        className="pointer-events-auto absolute z-20 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-14 rounded-l-xl border border-r-0 border-[var(--colors-hairline)] shadow-lg transition-right duration-300"
        style={{
          right: isPanelOpen
            ? 'min(var(--dashboard-panel-width), calc(100vw - 1.75rem))'
            : '0px',
          backgroundColor: 'var(--colors-surface-1)',
          transition: 'right 0.3s ease',
        }}
      >
        {isPanelOpen ? <ChevronRight size={16} className="text-[var(--colors-ink-subtle)]" /> : <ChevronLeft size={16} className="text-[var(--colors-ink-subtle)]" />}
      </button>

      <div
        className="pointer-events-none absolute top-0 bottom-0 z-10 w-[var(--dashboard-panel-width)]"
        style={{
          right: isPanelOpen ? '0' : 'calc(-1 * min(var(--dashboard-panel-width), 100vw))',
          width: 'min(var(--dashboard-panel-width), 100vw)',
          transition: 'right 0.3s ease',
        }}
      >
        <div
          className="pointer-events-auto h-full w-full border-l border-[var(--colors-hairline)] shadow-2xl flex flex-col"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--colors-surface-1) 30%, transparent)',
            backdropFilter: 'blur(16px)'
          }}
        >
          {/* Header & Tabs */}
          <div className="px-6 pt-8 pb-4">
            <h2 className="text-xl font-[800] tracking-tight mb-5">스마트 시티 대시보드</h2>
            <div className="flex rounded-lg p-1 border border-[var(--colors-hairline)] gap-0.5" style={{ backgroundColor: 'color-mix(in srgb, var(--colors-surface-2) 50%, transparent)' }}>
              {[
                { id: "dashboard", label: "기본 현황" },
                { id: "parking", label: "주차" },
                { id: "safety", label: "안전" },
                { id: "energy", label: "에너지" },
                { id: "environment", label: "환경 시뮬" },
              ].map(tab => (
                <button
                  key={tab.id}
                  data-qa={`dashboard-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 text-xs font-[600] rounded-md transition-colors ${activeTab === tab.id ? "bg-[var(--colors-surface-1)] shadow-sm text-[var(--colors-ink)] border border-[var(--colors-hairline)]" : "text-[var(--colors-ink-subtle)] hover:text-[var(--colors-ink)]"}`}
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

            {activeTab === "parking" && (
              <div className="space-y-6">
                <div className="pb-4 border-b border-[var(--colors-hairline)]/50">
                  <div className="text-base font-[700] text-[var(--colors-ink)] flex items-center gap-2">
                    <Car size={18} className="text-[var(--colors-primary)]" />
                    D4 입출차 현황
                  </div>
                </div>
                <div>
                  <div className="mb-3 text-sm font-[700] text-[var(--colors-ink-subtle)] flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    실시간 주차 현황
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <MetricCard label="주차 대수" value={`${trafficStats?.current_cars ?? 0}대`} hint={`총 ${trafficStats?.total_spaces ?? 50}면`} accent />
                    <MetricCard label="누적 입차" value={`${trafficStats?.entered ?? 0}대`} hint="오늘" />
                    <MetricCard label="누적 출차" value={`${trafficStats?.exited ?? 0}대`} hint="오늘" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "safety" && (
              <div className="space-y-6">
                <div className="pb-4 border-b border-[var(--colors-hairline)]/50">
                  <div className="text-base font-[700] text-[var(--colors-ink)] flex items-center gap-2">
                    <ShieldAlert size={18} className="text-[var(--colors-primary)]" />
                    안전 모니터링
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="위험 구역 접수" value={`${trafficData.length}건`} hint="최근 24시간 기준" />
                  <MetricCard
                    label="AI 자동 분류"
                    value={`${trafficData.filter((item) => item.ai_confidence >= 0.45).length}건`}
                    hint="우선 처리 대상"
                    accent
                  />
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
              </div>
            )}

            {activeTab === "energy" && (
              <div className="space-y-4">
                <BuildingAnalysis
                  key={`${selectedBuildingId}:${representativePlanId ?? "none"}`}
                  buildingId={selectedBuildingId}
                  plans={installationPlans}
                  representativePlanId={representativePlanId}
                />
                <CampusComparison onOpenRecommendation={setEditorRequest} />
                <EnergyDashboard key={selectedBuildingId} buildingId={selectedBuildingId} />
              </div>
            )}

            {activeTab === "environment" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-[var(--colors-hairline)]/50">
                  <div className="flex items-center gap-2 text-base font-[700]">
                    <SlidersHorizontal size={18} className="text-[var(--colors-primary)]" />
                    환경 시뮬레이션
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
                    onValueChange={setSimTemp}
                  />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
                    <SliderRow
                      label="월"
                      valueLabel={`${sunMonth}월`}
                      min={1}
                      max={12}
                      value={sunMonth}
                      onValueChange={setSunMonth}
                    />
                    <SliderRow
                      label="일"
                      valueLabel={`${sunDay}일`}
                      min={1}
                      max={31}
                      value={sunDay}
                      onValueChange={setSunDay}
                    />
                    <SliderRow
                      label="시"
                      valueLabel={`${sunHour}시`}
                      min={0}
                      max={23}
                      value={sunHour}
                      onValueChange={setSunHour}
                    />
                    <SliderRow
                      label="분"
                      valueLabel={`${sunMinute}분`}
                      min={0}
                      max={59}
                      value={sunMinute}
                      onValueChange={setSunMinute}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-lg border border-[var(--colors-hairline)] bg-[var(--colors-surface-2)] px-3 py-2 text-xs">
                    <span className="text-[var(--colors-ink-subtle)]">태양 방향</span>
                    <span className="font-semibold text-[var(--colors-ink)]">
                      {getCompassDirection(sunBearingDegrees)} {sunBearingDegrees.toFixed(0)}° · 고도{" "}
                      {sunAltitudeDegrees.toFixed(1)}°
                    </span>
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

            {/* Fallback: selected map element has no microclimate response yet. */}
            {!popupData && !popupLoading && !popupError && (
              <div className="p-5 text-sm leading-6 text-[var(--colors-ink-muted)]">
                이 건물의 상세 미기후 데이터를 선택해 확인하세요.
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
