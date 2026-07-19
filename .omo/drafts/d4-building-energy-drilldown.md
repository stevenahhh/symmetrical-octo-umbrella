---
slug: d4-building-energy-drilldown
status: drafting
intent: clear
pending-action: write .omo/plans/d4-building-energy-drilldown.md
approach: D4/공대 3호관만 먼저 제대로 완성하고, 실제 3D/상세 구조도 자료가 없으므로 내부 단면은 프론트 담당자가 나중에 교체 가능한 목업 UI로 띄운다. 캠퍼스 건물 클릭 흐름은 건물 요약 -> 목업 내부 단면 -> 실 상세 전력 시뮬레이션으로 확장한다.
---

# Draft: d4-building-energy-drilldown

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
- C1 | D4 PDF를 출처/신뢰도 있는 층-실 seed 데이터로 변환 | active | docs/d4.pdf, tmp/pdfs/d4/contact-sheet.png
- C2 | 건물 클릭 후 D4 건물 요약 모드와 내부 보기 모드 상태를 추가 | active | frontend/src/App.jsx:349, frontend/src/CityModel.jsx:237
- C3 | D4 내부 구조를 실제 3D 자료 없이 목업 단면 UI로 표시하고 101, 102, 103 등 실 블록 선택 | active | docs/d4.pdf, frontend/src/App.jsx:411
- C4 | 기존 강의실 전력 모델을 D4 건물 집계 + 실 상세 계산으로 확장 | active | frontend/src/utils/classroomEnergy.mjs:1, frontend/src/utils/classroomEnergy.mjs:359
- C5 | 우측 에너지 패널을 건물 공통 정보와 선택 실 상세 정보로 분리 | active | frontend/src/App.jsx:658
- C6 | AI 추천 절감 시나리오, 원격 제어 가능 항목, 태양광 발전량 대비 소비 전력 비교를 D4 맥락에 맞춰 표시 | active | frontend/src/App.jsx:667, frontend/src/App.jsx:735

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
- D4 PDF room labels | 손글씨가 불명확한 실은 `sourceConfidence: "low"`와 `sourceNote`로 남기고 UI에는 우선 호실 중심으로 표시 | OCR 추출이 어렵고 일부 실명 판독이 애매함 | yes
- Internal view rendering | 실제 3D/상세 구조도 자료가 없으므로 층별 평면 블록을 쌓은 목업 단면 UI로 표시하고, 프론트 담당자가 나중에 구조도를 교체할 수 있게 데이터/컴포넌트를 분리 | 현재 단계는 에너지 시뮬레이션 흐름 검증이 우선이고 상세 구조도는 추후 수정 예정 | yes
- Scope by building | D4/공대 3호관만 완성하고 다른 건물은 기존 클릭/팝업 유지 또는 준비 중 상태 | 사용자가 D4를 기준으로 요청함 | yes
- Energy data | 현재 상세 계량 데이터가 없으므로 임의 가정 데이터는 코드 상수와 UI 라벨에서 명확히 "추정/가정값"으로 표시 | 실제 전력 데이터 부재를 숨기지 않기 위함 | yes
- Professor offices | 교수 자료/강의 시간표에 연결된 교수는 해당 강의 시간 동안 교수실 전력을 idle/비사용으로 계산 | 사용자가 실제처럼 반영하길 원함 | no
- Scenario control | 실제 원격 제어는 구현하지 않고, 원격 제어가 가능하다는 가정의 절감 시뮬레이션으로 표현 | 프로젝트 범위는 시뮬레이션임 | yes

## Findings (cited - path:lines)
- `docs/d4.pdf` exists and was rendered to `tmp/pdfs/d4/contact-sheet.png`; it contains 10 hand-drawn D4/공대3호관 floor/side pages, with floors split left/right and visible room numbers including 101/102/103, 2xx, 3xx, 4xx, and 5F rooms.
- `frontend/src/CityModel.jsx:101` accepts `onBuildingClick`; `frontend/src/CityModel.jsx:237` calls it after a selectable building is clicked, so this is the right hook for entering D4 building mode.
- `frontend/src/App.jsx:349` currently handles building clicks only for microclimate popup fetches; this handler should additionally identify D4 and set `buildingViewMode`.
- `frontend/src/App.jsx:249` computes energy simulation globally from `estimateCampusEnergy`; it should become selected-building aware.
- `frontend/src/App.jsx:658` renders the current energy panel; `frontend/src/App.jsx:667` already has AI recommendation UI, `frontend/src/App.jsx:735` already has solar comparison, and `frontend/src/App.jsx:779` already has room priority/detail sections.
- `frontend/src/utils/classroomEnergy.mjs:25` already models special room types including `computer_lab`, `server`, `faculty`; `frontend/src/utils/classroomEnergy.mjs:260` includes HVAC/screen/computer load; `frontend/src/utils/classroomEnergy.mjs:297` includes optimization; `frontend/src/utils/classroomEnergy.mjs:359` exposes `estimateCampusEnergy`.

## Decisions (with rationale)
- Keep `classroomEnergy.mjs` as the calculation core and add building-scoped data/functions instead of rewriting the model. Rationale: current logic already covers the key simulation ingredients the user requested.
- Add a separate D4 building data module rather than embedding rooms in `App.jsx`. Rationale: D4 structure, source notes, room types, and geometry will grow quickly.
- Use a new `BuildingSectionView` mock component for D4 internal view, but keep it data-driven and replaceable. Rationale: there is no finalized 3D/structure asset now, so the mock should prove the interaction flow without locking the future frontend implementation.
- Split UI state into campus/building/room concepts: `selectedBuildingId`, `buildingViewMode`, `selectedRoomId`, and energy scenario. Rationale: building-level summary and room-level detail are different concerns.
- Treat the PDF as a first-pass spatial map, not as final truth. Rationale: the document is hand-drawn and some labels are uncertain.

## Scope IN
- D4/공대 3호관 building-overview mode after clicking the D4 building.
- D4 internal mock section UI with floor slabs and clickable room blocks.
- D4 room seed data: floor, side, room number, room type, size, HVAC count, large screen, computer count when relevant, professor/assistant office metadata, source page/note.
- Building-level metrics: baseline monthly kWh, optimized monthly kWh, saving amount/rate, peak load, top saving rooms, AI recommended scenario.
- Room-level metrics: room assumptions, timetable, professor-teaching idle effect, scenario comparison, controllable loads.
- Solar vs D4 consumption comparison.
- Tests for D4 data integrity, building aggregation, professor office idle, and scenario ranking.
- Browser/visual QA plan for D4 click -> overview -> internal section -> room detail.

## Scope OUT (Must NOT have)
- Do not build a full BIM/digital-twin reconstruction from the PDF.
- Do not spend time creating accurate architectural geometry; this pass only needs a replaceable mock for flow verification.
- Do not claim real measured power data.
- Do not implement actual remote device control.
- Do not complete all campus buildings in this pass.
- Do not replace the existing campus model unless D4 identification cannot be solved otherwise.

## Open questions
- Which GLB element id/name corresponds exactly to D4/공대 3호관? If it is not obvious from `ELEMENT_NAME_MAP`, map by the clicked building label used in the current model.
- Should uncertain handwritten room labels be corrected manually before implementation, or is room-number-first display acceptable for the prototype?
- Should the internal mock section replace the campus model while inside D4, or overlay above the focused building? Default plan: replace the center scene with the D4 mock section while preserving the existing right panel.

## Approval gate
status: awaiting-approval
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
