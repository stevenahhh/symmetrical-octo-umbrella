# d4-building-energy-drilldown - Work Plan

## TL;DR (For humans)
**What you'll get:** D4/공대 3호관을 클릭하면 건물 전체 전력 요약을 보고, 목업 내부 단면 화면으로 들어가 101, 102, 103 같은 실을 선택해 전력 가정값과 절감 시뮬레이션을 볼 수 있게 한다.

**Why this approach:** 기존 전력 계산은 이미 강의 시간표, 컴퓨터실, 교수실 idle, AI 추천, 태양광 비교를 품고 있으므로 유지한다. 지금은 실제 3D/상세 구조도 자료가 없으므로 D4 내부는 프론트 담당자가 나중에 교체 가능한 목업 단면 UI로 먼저 띄운다.

**What it will NOT do:** 실제 계량 전력 데이터라고 주장하지 않는다. 실제 냉난방/전력 원격 제어를 수행하지 않는다. D4 외 전체 건물을 한 번에 완성하지 않는다.

**Effort:** Large
**Risk:** Medium - D4 PDF가 손그림이라 일부 실명/용도 판독이 불확실하고, 3D 캠퍼스 클릭 모델에서 D4 element id 매핑을 확인해야 한다.
**Decisions to sanity-check:** D4만 우선 완성, PDF 불명확 라벨은 신뢰도/메모로 남김, 내부 화면은 실제 구조도 구현이 아니라 교체 가능한 목업으로 구현.

Your next move: 이 계획대로 구현을 시작하라고 승인하거나, D4 실명/용도 표를 먼저 보정한다. Full execution detail follows below.

---

> TL;DR (machine): Large/Medium; add D4 building-scoped data, aggregate energy simulation, replaceable mock section UI, and split building/room energy panels.

## Scope
### Must have
- D4/공대 3호관을 기준 건물로 식별한다.
- 건물 클릭 후 `building-overview` 상태에서 D4 전체 전력 사용값, 절감 가능 실, 절감 방법, AI 추천 시나리오, 태양광 대비 소비 전력을 보여준다.
- 내부 보기 UI에서 D4의 층별 구조를 실제 3D 자료 없이 목업 단면으로 보여주고, 101/102/103 등 실 블록을 클릭할 수 있게 한다.
- 실 상세 화면은 크기, 냉난방기 수, 대형 스크린, 컴퓨터실/실험실/서버실/교수실/조교실 등 공간 유형, 강의 시간표, 교수 시간표 연동을 보여준다.
- 교수 자료/시간표에 따라 교수가 강의 중인 시간에는 해당 교수실 전력이 idle/비사용으로 줄어드는 계산을 유지한다.
- 절감 우선순위는 건물 전체 기준과 실 상세 기준을 분리해 비교 가능하게 한다.
- 기존 태양광 발전량 계산을 D4 건물 소비 전력과 함께 비교한다.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must not present generated assumptions as measured power data.
- Must not implement real remote HVAC/power control.
- Must not attempt full BIM reconstruction from the PDF.
- Must not spend time creating accurate architectural geometry; the mock only needs to prove the D4 drilldown flow.
- Must not rewrite unrelated dashboard, weather, traffic, or solar logic.
- Must not broaden to all campus buildings before D4 works end-to-end.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + Node test runner for energy/data logic; browser visual QA for UI.
- Evidence: `.omo/evidence/task-<N>-d4-building-energy-drilldown.<ext>` plus screenshots for the D4 overview, D4 mock section view, and selected room detail.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1: D4 data model and building-scoped energy functions.
- Wave 2: D4 mock internal section component and App state integration.
- Wave 3: Right panel split into building overview and room detail.
- Wave 4: Tests, build, browser QA, and polish fixes.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3, 4, 5 | none |
| 2 | 1 | 4, 5 | 3 |
| 3 | 1 | 5 | 2 |
| 4 | 2 | 6 | 5 |
| 5 | 2, 3 | 6 | 4 |
| 6 | 4, 5 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Create D4 building data seed.
  What to do / Must NOT do: Add a D4 data module containing building metadata, floor/side/page references, room ids, approximate geometry, room type, size, HVAC count, large screen, computer count, professor/assistant office metadata, timetable placeholders, and `sourceConfidence/sourceNote`. Do not hide uncertain handwriting; mark it.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 4, 5
  References (executor has NO interview context - be exhaustive): `docs/d4.pdf`; rendered inspection artifact `tmp/pdfs/d4/contact-sheet.png`; current energy room shape in `frontend/src/utils/classroomEnergy.mjs:85`.
  Acceptance criteria (agent-executable): A data integrity test asserts D4 has floors 1-5, includes room ids 101, 102, 103, includes at least one `computer_lab`, one `faculty`, one `lab` or `server` candidate if present in seed, and every room has floor, type, size, and source metadata.
  QA scenarios (name the exact tool + invocation): `npm run test` from `frontend`; Evidence `.omo/evidence/task-1-d4-building-energy-drilldown.txt`.
  Commit: N | feat(d4): seed building room data

- [ ] 2. Add building-scoped energy aggregation.
  What to do / Must NOT do: Extend energy utilities so existing room calculations can run against `D4.rooms` and return building summary, sorted savings priorities, AI scenario recommendation, and selected room detail. Do not remove current campus-level defaults until D4 flow is integrated.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4, 5
  References (executor has NO interview context - be exhaustive): `frontend/src/utils/classroomEnergy.mjs:1`, `frontend/src/utils/classroomEnergy.mjs:25`, `frontend/src/utils/classroomEnergy.mjs:260`, `frontend/src/utils/classroomEnergy.mjs:297`, `frontend/src/utils/classroomEnergy.mjs:359`.
  Acceptance criteria (agent-executable): Tests prove D4 monthly baseline/optimized/savings totals equal the sum of D4 rooms, professor office load drops during linked teaching hours, and recommended scenario returns a D4 top room.
  QA scenarios (name the exact tool + invocation): `npm run test` from `frontend`; Evidence `.omo/evidence/task-2-d4-building-energy-drilldown.txt`.
  Commit: N | feat(energy): scope simulation by building

- [ ] 3. Implement D4 mock internal section component.
  What to do / Must NOT do: Build a reusable, data-driven `BuildingSectionView` mock for D4 that renders stacked floor slabs and room blocks, labels rooms by number, colors by energy state/room type, and emits selected room id. It must be easy for the frontend owner to replace later with a real building structure. Do not attempt accurate architectural geometry or a polished final 3D reconstruction.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
  References (executor has NO interview context - be exhaustive): `frontend/src/CityModel.jsx:101`, `frontend/src/CityModel.jsx:237`, current Canvas placement in `frontend/src/App.jsx:411`.
  Acceptance criteria (agent-executable): In browser QA, entering D4 internal view shows a clearly labeled mock floor stack, visible 101/102/103 labels, and clicking a room changes selected room state.
  QA scenarios (name the exact tool + invocation): Browser MCP or Playwright screenshot at desktop and mobile widths; Evidence `.omo/evidence/task-3-d4-building-energy-drilldown.png`.
  Commit: N | feat(ui): add D4 mock building section

- [ ] 4. Wire building click and view modes.
  What to do / Must NOT do: Update App state so D4 building click keeps existing camera focus/popup behavior and also sets `selectedBuildingId`, `buildingViewMode`, and default `selectedRoomId`; add back/exit affordance from inside-building mode. Non-D4 buildings should continue current behavior or show a lightweight "준비 중" building summary. Do not generalize full internal structures for other buildings yet.
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 6
  References (executor has NO interview context - be exhaustive): click handler `frontend/src/App.jsx:349`; `CityModel` callback `frontend/src/CityModel.jsx:237`; Canvas integration `frontend/src/App.jsx:411`.
  Acceptance criteria (agent-executable): Browser QA clicks D4, sees D4 overview, enters mock internal view, exits back to campus without breaking other building clicks.
  QA scenarios (name the exact tool + invocation): Browser MCP click path + console check; Evidence `.omo/evidence/task-4-d4-building-energy-drilldown.txt`.
  Commit: N | feat(ui): add D4 drilldown state

- [ ] 5. Split the energy panel into building overview and room detail.
  What to do / Must NOT do: Refactor the current energy panel into building-level cards and selected-room detail. Building overview must show total energy, savings, priority rooms, AI recommendation, and solar offset. Room detail must show assumptions, schedule/professor linkage, and scenario-specific savings. Do not leave all data as a flat "campus" view.
  Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 6
  References (executor has NO interview context - be exhaustive): current simulation memo `frontend/src/App.jsx:249`; AI recommendation UI `frontend/src/App.jsx:667`; scenario controls `frontend/src/App.jsx:689`; solar comparison `frontend/src/App.jsx:735`; room priority/detail `frontend/src/App.jsx:779`.
  Acceptance criteria (agent-executable): Browser QA verifies D4 overview and room detail show different titles/metrics and selected room changes detail values.
  QA scenarios (name the exact tool + invocation): Browser MCP screenshot + interaction; Evidence `.omo/evidence/task-5-d4-building-energy-drilldown.png`.
  Commit: N | feat(energy): separate building and room panels

- [ ] 6. Final integration polish and verification.
  What to do / Must NOT do: Resolve layout overlap, CJK clipping, mock view framing, and empty/blank canvas cases; run tests/build; capture final screenshots. Do not ship if mock room labels overlap so badly that room selection is unclear.
  Parallelization: Wave 4 | Blocked by: 4, 5 | Blocks: final verification
  References (executor has NO interview context - be exhaustive): `DESIGN.md`; visual states from tasks 3-5.
  Acceptance criteria (agent-executable): `npm run test` and `npm run build` pass from `frontend`; browser QA completes D4 click -> overview -> mock internal view -> room detail -> scenario change -> back to campus.
  QA scenarios (name the exact tool + invocation): `npm run test`, `npm run build`, Browser MCP screenshots desktop/mobile; Evidence `.omo/evidence/task-6-d4-building-energy-drilldown.txt`.
  Commit: N | polish(d4): verify energy drilldown

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy
- Keep one working set until UI and tests pass, then commit only if the user asks for git work.
- If committing later, prefer a single atomic commit: `feat(d4): add building energy drilldown`.

## Success criteria
- Clicking D4/공대 3호관 opens a building-level D4 energy overview.
- The user can enter an internal D4 mock section view and visually see floor/room blocks such as 101, 102, and 103.
- Selecting a room changes the right panel to room-specific assumptions, schedule, and savings.
- Building-level and room-level energy numbers are computed from the same D4 room data.
- AI recommendation, savings priority, remote-control-assumption scenario, and solar comparison are visible in the D4 flow.
- Tests and build pass, and browser QA proves the flow works interactively.
