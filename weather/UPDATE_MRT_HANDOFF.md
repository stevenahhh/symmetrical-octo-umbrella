# Estimated MRT / Material Model Update Handoff

## Why this exists

이 업데이트는 **현재 단계에서 건물/도로 재질이 실제 3D 모델에 적용되어 있다고 가정하고**,
복사/물리·재료 기반 미기후 계산을 **추정치 중심으로 고도화**한 것입니다.

중요:
- 지금 값은 **실측값이 아님**
- popup/API에 노출되는 재질/복사 정보는 **simulation / estimated data**임
- 이후 실제 구현 단계에서는 이 문서를 따라 **추정 입력을 실제 재질/형상/센서 데이터로 교체**하면 됨

---

## What changed

### 1) Radiation model upgraded
- 파일: `weather/processors/radiation.py`
- 기존: shortwave 합산 후 `tmrt = temperature + radiation_load * 0.015`
- 현재: 아래 항목을 포함하는 **향상된 추정 복사 모델**
  - shortwave decomposition
    - `direct_radiation`
    - `diffuse_radiation`
    - `ground_reflection`
    - `facade_reflection`
  - longwave estimation
    - `longwave_sky`
    - `longwave_ground`
    - `longwave_facade`
    - `net_longwave_exchange`
  - material-driven estimates
    - `material_heat_storage`
    - `surface_temperature`
    - `facade_temperature`
    - `evaporative_cooling_offset`
    - `net_radiation_balance`
  - improved MRT/Tmrt estimate

### 2) Material profile layer added
- 파일: `weather/processors/materials.py`
- 목적:alrl
  - `surface_type` 기반 기본 재질 프로파일 제공
  - 누락된 재질 입력을 추정값으로 보완
  - 나중에 실제 재질 DB 또는 GIS 속성으로 교체 가능한 단일 진입점 역할

### 3) Microclimate integration upgraded
- 파일: `weather/processors/microclimate.py`
- 반영 내용:
  - `material_heat_storage`
  - `net_radiation_balance`
  - `evaporative_cooling_offset`
  - `material_heat_retention`
  - `evaporative_cooling_effect`

### 4) Popup/API kept backward-compatible
- 파일:
  - `weather/processors/popup_formatter.py`
  - `weather/api/app.py`
- 기존 필드는 유지
- 신규 필드는 additive 방식으로만 추가
- popup에 아래 정보가 추가됨
  - `data_note`
  - `material`
  - `factors.material_heat`

### 5) Feature-loading bug fixed
- 파일: `weather/api/app.py`
- `microclimate_features.json`이 `{ metadata, features }` 구조인데,
  API 로더가 raw JSON 전체를 반환하던 문제를 수정함.
- 이제 `features` 배열만 반환함.

---

## Where a future contributor should start

실제 구현으로 올릴 때는 아래 순서가 가장 안전함.

### Step 1. Replace estimated material inputs
시작 파일:
- `weather/processors/materials.py`
- `weather/data/microclimate_features.json`
- `weather/processors/generate_building_features.py`
- `weather/processors/build_element_features.py`

할 일:
- `surface_type`를 실제 3D/자산 재질과 매핑
- 아래 값을 실데이터로 채우기
  - `surface_emissivity`
  - `thermal_conductivity`
  - `volumetric_heat_capacity`
  - `moisture_availability`
  - `facade_emissivity`
  - `heat_storage_factor`
  - `facade_heat_storage_factor`

### Step 2. Replace geometry assumptions
시작 파일:
- `weather/processors/radiation.py`

현재는 아래 항목이 추정 기반임:
- sky exposure → `sky_view_factor`
- facade exposure → `1 - sky_view_factor`
- surface / facade temperature estimation
- longwave exchange decomposition

실제 구현 시 교체 대상:
- 건물 방향성
- 태양 방위 기반 차광
- road canyon / wall view factor
- directional SVF
- 장파복사 표면온도 입력

### Step 3. Upgrade from estimated MRT to validated MRT
시작 파일:
- `weather/processors/radiation.py`
- 필요시 `weather/processors/thermal_index.py`

권장 방향:
- 현재 `tmrt` 산출은 향상된 추정형
- 다음 단계에서는
  - directional sky view
  - wall/ground longwave balance
  - measured or simulated surface temperatures
를 이용한 validated MRT/Tmrt 식으로 교체

### Step 4. Connect simulation UI later
현재는 웹 작업 미포함.

후속 웹 기여자가 시작할 위치:
- `frontend/WEATHER_API.md`
- `weather/processors/popup_formatter.py`
- `weather/api/app.py`

추천 방식:
- 먼저 popup에서 `data_note`, `material`, `factors.material_heat` 노출
- 그 다음 simulation controls 추가
- merge conflict가 나면 `popup_formatter.py`, `WEATHER_API.md`, `frontend/src/App.jsx` 축만 우선 reconcile

---

## Compatibility rules

후속 작업 시 아래는 깨지 않게 유지하는 것을 권장함.

- 기존 popup 응답 필드
  - `thermal`
  - `factors.shade`
  - `factors.vegetation`
  - `factors.wind`
  - `factors.radiation`
  - `delta`
  - `reasons`
  - `base_weather`
- 기존 파이프라인 핵심 출력
  - `local_temp`
  - `local_wind_speed`
  - `radiation_load`
  - `tmrt`
  - `utci`
  - `wbgt`

새 모델을 넣더라도 위 필드는 계속 유지하고,
새로운 정밀값은 additive 필드로 붙이는 방식을 권장.

---

## Current assumptions to remember

- 현재 material/radiation 값은 **estimated**
- 실제 자산 재질이 적용되어 있다는 **가정 기반 모델**
- 팝업의 재질/복사열 정보는 **user-facing simulation info**이지 검증 완료된 계측 결과가 아님

즉, 현재 단계의 목표는:
1. 건물 클릭 시 설명 가능한 popup 제공
2. 재질/복사열 UX 검증
3. 나중에 실제 데이터로 갈아끼울 수 있는 구조 확보

---

## Suggested next implementation batch

다음 기여자는 아래 중 하나부터 시작하면 됨.

1. **실재질 매핑 작업**
   - 3D 모델/asset 메타데이터에서 재질명 추출
   - `surface_type` 및 emissivity/conductivity 연결

2. **정밀 복사모델 작업**
   - directional SVF
   - solar azimuth-aware shading
   - wall view factor
   - longwave surface temperature coupling

3. **웹 popup 적용 작업**
   - material card
   - estimated badge
   - radiation detail explanation UI


## 안순광 노트

- 지금 단계에서는 의도대로 '추정 모델'임. 수치가 꽤 공격적으로 나올 수 있으니, 다음 batch는 materials.py의 재질 상수와 radiation.py의 장파/열저장 계수를 실제 자산 기준으로 보정하면 됨.
- 이 문서는 이후 실제 구현이 완료되면 **update 형태로 계속 갱신**하면 됨.
