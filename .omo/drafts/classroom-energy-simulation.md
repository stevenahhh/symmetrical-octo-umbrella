---
slug: classroom-energy-simulation
status: drafting
intent: clear
pending-action: write .omo/plans/classroom-energy-simulation.md
approach: Plan a realistic, assumption-based classroom electricity simulation that combines room equipment, course timetable, professor timetable/location, remote-control savings policies, solar offset comparison, and AI recommended savings scenarios.
---

# Draft: classroom-energy-simulation

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
classroom-data | Model room size/equipment/type/timetable inputs including computer labs | active | planning-only
professor-occupancy | Use professor course schedules to mark professor/TA offices idle during their teaching blocks | active | planning-only
energy-model | Estimate baseline and optimized kWh from occupancy, HVAC, lighting, screen, computer/server load | active | planning-only
ai-recommendation | Rank savings scenarios and rooms by savings potential, comfort risk, and control feasibility | active | planning-only
dashboard-surface | Extend Energy tab with scenario cards, AI recommendation, room priority, and solar offset comparison | active | planning-only

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
metering | No detailed meter data; use synthetic assumptions with visible "simulation assumptions" label | User said detailed usage is unavailable | yes
room-types | lecture, lab, computer_lab, server, faculty_office | Covers current request plus existing special rooms | yes
time-resolution | 1-hour simulation buckets for weekdays 08:00-22:00 | Easy to explain and enough for timetable-driven demo | yes
professor-office-control | If professor is teaching, their office enters idle mode except essential standby | Matches "really actual-like" requirement | yes
ai-recommendation | Start as explainable rule-based scoring, not ML | No historical labels/data; transparent for presentation | yes
remote-control | Simulate controllable targets: HVAC, lights, screen/projector, PC power policy, standby plugs | Plausible IoT/BEMS future integration | yes
existing-accidental-code | Treat current unapproved implementation draft as disposable; executor should either revert it first or replace it under approved plan | User clarified planning-only after the draft was created | yes

## Findings (cited - path:lines)
frontend/src/App.jsx:650 | Energy tab is the existing user-facing surface for this feature.
frontend/src/App.jsx:706 | Existing energy tab already contains solar/PV simulation, so electricity consumption should be shown alongside PV generation instead of in a separate page.
frontend/src/utils/pvMath.mjs:1 | PV calculation already exists and can be reused for solar offset comparison.

## Decisions (with rationale)
Use an assumption-driven digital-twin model rather than pretending to have measured electricity data. This is honest, demo-friendly, and can later be calibrated with smart-meter data.
Add "computer lab" as its own space type, not a lab variant, because PC fleets create predictable class-time and standby loads.
Add professor schedule as a first-class input. A professor teaching in a classroom makes the professor/TA office unoccupied for that same time block, so lights/HVAC/screens should fall to idle assumptions there.
Make AI recommendation explainable: recommend the scenario with the best weighted score from expected kWh savings, comfort/risk penalty, class disruption risk, and remote-control feasibility.
Keep remote control as simulated capability unless real hardware/API exists. The plan should describe the future control targets but not claim actual device control.

## Scope IN
Planning for data schema, formulas, AI recommendation logic, dashboard composition, implementation order, and QA criteria.
Computer lab type with PC-count or default PC-fleet load.
Professor timetable and office-idle rule during assigned lecture periods.
AI recommended savings scenario and explanation text.
Savings priority ranking by room.
Solar generation versus consumption comparison.
Remote-control-ready scenario concepts for HVAC, lighting, screens/projectors, PC/standby power.

## Scope OUT (Must NOT have)
No production implementation until the user explicitly approves execution.
No claim that simulated kWh is real measured usage.
No opaque ML model requiring training data the project does not have.
No real HVAC/electrical remote-control API integration unless hardware/API credentials are later provided.

## Open questions
None blocking. Optional later refinement: exact building/classroom list and real timetable CSV source if the team has one.

## Approval gate
status: awaiting-approval
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
