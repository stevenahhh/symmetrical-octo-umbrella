# Development and Test Evidence Visual System

## Purpose

Four report-ready evidence pages document the implemented D4 room visualization, room schedule and energy simulation, five solar/PV tests, and sixteen VWorld tests. Every final PNG is generated through the fixed pipeline `HTML -> PDF -> PNG`.

## Output Contract

- PDF page: `15 × 10in`, landscape, no print margin.
- PNG page: `2160 × 1440px`, rendered from the PDF at `144dpi`.
- Body text: `18px`.
- Labels and captions: `16–18px`.
- Section title: `26px`.
- Page title: `40px`.
- KPI values: maximum `52px`.
- All visible text uses normal `400` weight; bold and semibold are not used.
- Light mode only; no gradients, glass, shadows, or animation.
- Korean headings use `word-break: keep-all`.
- Every color-coded state also includes a text label and numeric value.
- Title subtitles are omitted.
- Page footers and bottom source strips are omitted.

## Visual Direction

Professional engineering evidence sheets: white paper surface, cool-gray structure, indigo data signals, green pass states, amber simulation notices. The four pages share the same restrained masthead, evidence badges, and panel geometry.

## Tokens

| Role | Value |
|---|---:|
| Canvas | `#E9EDF3` |
| Page | `#FFFFFF` |
| Panel | `#F5F7FA` |
| Panel strong | `#EEF1F6` |
| Ink | `#12151B` |
| Muted ink | `#4D5666` |
| Quiet ink | `#687386` |
| Border | `#D7DDE7` |
| Border strong | `#BFC8D6` |
| Indigo | `#4F5FD7` |
| Indigo soft | `#E7EAFE` |
| Green | `#11845C` |
| Green soft | `#E1F4EC` |
| Amber | `#A96800` |
| Amber soft | `#FFF2D8` |
| Red | `#C2465A` |

## Page Layout

All pages use `80px` outer padding and a three-row structure:

1. Masthead and evidence badges
2. KPI strip
3. Primary visualization and supporting evidence

### Page 01 — D4 Building Overview

- Large two-wing, six-floor section diagram.
- Room counts by floor: `14 / 16 / 17 / 14 / 7 / 1`.
- Bridges called out on floors `3` and `5`.
- Summary: `69 rooms`, `6 floors`, `7 special rooms`.
- Explicit mock/simulation badge.

### Page 02 — D4 Room 301

- Oversized room detail card and a real weekly timetable.
- Timetable primitive: fixed `09:00–18:00` time axis, five weekday columns, hourly grid lines, and events positioned by start time and duration.
- Monday `09:00–12:00` and Wednesday `13:00–15:00` class blocks must align to the shared time grid.
- HVAC, room type, screen, weekly saving, and saving-rate cards.
- Capture-state note: vacant and HVAC standby.
- Explicit mock/simulation badge.

### Page 03 — Solar and PV Tests

- `5 PASS / 0 FAIL` KPI.
- Five large test cards.
- Chart primitive: Chart.js vertical bar chart using the executed `-35.82° / 41.69° / 72.72°` values.
- Chart uses a visible degree axis, subtle grid lines, distinct accessible bar colors, direct value labels, and a screen-reader summary.
- Chart animation is disabled so browser, PDF, and PNG output show the same settled frame.
- PV formula flow and two verified result cards.

### Page 04 — VWorld Tests

- `16 PASS / 0 FAIL` KPI.
- Five grouped coverage columns with counts `2 / 3 / 3 / 4 / 4`.
- Selection-flow diagram from `MODEL_NAME` to SDK and camera.
- Verified D4 coordinates and camera arguments.

## Accessibility and Evidence Rules

- Text follows the standard document scale defined above.
- No visible element may use a font weight above `400`.
- Numeric totals must reconcile with the raw logs.
- Simulation values are never described as measurements.
- Test images distinguish executed output from implementation explanation.
- Chart.js must finish rendering before PDF export starts.
- Chart values must remain available as text and not rely on color alone.
- Timetable events must expose weekday, start/end time, course, and instructor as text.
- Exact source paths and command lines remain available in the adjacent raw and summary logs rather than a page footer.

