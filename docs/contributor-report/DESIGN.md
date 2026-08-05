# SCNU GitHub Activity Report Design System

## 0. Research Log

- Embedded references: shortlisted `linear.app`, `notion`, and `wired`; selected `minimalist-skill` + `linear.app` because the artifact needs engineering precision, restrained color, and compact data hierarchy.
- Lazyweb: two desktop queries, three screens viewed (`Front Workload`, `Slite Team Insights`, `Wrike Analytics`); retained a KPI strip, ranked contributor rows, a numeric activity matrix, and a compact completion bar.
- UI/UX database: horizontal bars rated AAA for category comparison; heatmaps require numeric labels; donut charts were rejected because six contributor categories would reduce precision.
- Imagen drafts: skipped because no image-generation tool is registered in this session.
- Browser research fallback: CUA Docker sandbox was unavailable; final rendering and responsive checks use local Playwright.

## 1. Atmosphere & Identity

A precise engineering evidence sheet rather than a product dashboard. The page should feel like a bright, well-typeset project audit: compact, quiet, and credible. Its signature is a single indigo activity line that runs from headline metrics through contributor bars to the project timeline on a clean paper-white canvas.

## 2. Color

| Role | Token | Value | Usage |
|---|---|---:|---|
| Canvas | `--surface-canvas` | `#EDF0F5` | Page background outside the image |
| Report | `--surface-report` | `#FFFFFF` | Square report sheet |
| Panel | `--surface-panel` | `#F7F8FA` | Primary sections |
| Elevated | `--surface-elevated` | `#EFF1F6` | KPI and emphasized rows |
| Text primary | `--text-primary` | `#15171C` | Headlines and key values |
| Text secondary | `--text-secondary` | `#4D5462` | Supporting copy |
| Text tertiary | `--text-tertiary` | `#626B7A` | Metadata and captions |
| Border | `--border-default` | `#DDE1E8` | Panels and dividers |
| Border strong | `--border-strong` | `#C4CBD7` | Emphasized structure |
| Accent | `--accent-primary` | `#5E6AD2` | Primary activity signal |
| Accent soft | `--accent-soft` | `#444DA8` | Labels and highlights |
| Success | `--status-success` | `#16845B` | Merged PR status |
| Closed | `--status-closed` | `#C64F63` | Closed, unmerged PR status |

Contributor colors are fixed semantic series tokens:

| Contributor | Token | Value |
|---|---|---:|
| `stevenahhh` | `--series-1` | `#5E6AD2` |
| `JangGayeon` | `--series-2` | `#247CC5` |
| `wndkfl` | `--series-3` | `#168F7A` |
| `SEON3345` | `--series-4` | `#B06B00` |
| `KdlsMH` | `--series-5` | `#C15378` |
| `bdyong` | `--series-6` | `#805BC1` |

Rules:

- Indigo is reserved for project-level totals and the lead series.
- Every colored mark also carries a numeric label; color is never the sole encoding.
- No gradients. Depth comes from luminance steps and borders.

## 3. Typography

Primary stack: `"Arial", "Noto Sans KR", system-ui, sans-serif`.
Monospace stack: `"Cascadia Mono", "SFMono-Regular", Consolas, monospace`.

| Level | Size | Weight | Line Height | Tracking | Usage |
|---|---:|---:|---:|---:|---|
| Display | 34px | 600 | 1.08 | -0.035em | Report title |
| KPI | 34px | 600 | 1.00 | -0.035em | Summary values |
| H2 | 18px | 600 | 1.25 | -0.015em | Section titles |
| H3 | 14px | 600 | 1.35 | -0.01em | Contributor and milestone names |
| Body | 12px | 400 | 1.5 | 0 | Supporting text |
| Label | 10px | 600 | 1.4 | 0.04em | Data labels |
| Caption | 9px | 500 | 1.45 | 0.035em | Sources and methodology |

Rules:

- Korean phrases must not wrap inside headings or table labels.
- All numbers use tabular figures.
- Evidence text never drops below 9px in the final 1080px canvas; essential labels remain at least 10px.

## 4. Spacing & Layout

Base unit: 4px.

| Token | Value | Usage |
|---|---:|---|
| `--space-1` | 4px | Tight label spacing |
| `--space-2` | 8px | Inline groups |
| `--space-3` | 12px | Compact row spacing |
| `--space-4` | 16px | Standard internal spacing |
| `--space-5` | 20px | KPI padding |
| `--space-6` | 24px | Panel padding |
| `--space-8` | 32px | Major gutter |
| `--space-10` | 40px | Report edge padding |

- Target canvas: exactly 1080 × 1080px.
- Canvas padding: 32px; section gap: 12px.
- Main evidence area: contributor ranking and activity matrix share two equal columns.
- Bottom milestones use a three-column by two-row grid.
- The 1080px export is the primary and only required artifact; narrower browser views remain readable but are not export targets.

## 5. Components

### Metric Card

- **Structure**: label, primary value, short qualifier.
- **Variants**: neutral, success.
- **Spacing**: `--space-5`.
- **States**: static report element; no hover or active state.
- **Accessibility**: visible labels and complete text equivalents.
- **Layout**: four-column grid within the 1080px square.

### Contributor Row

- **Structure**: rank, identity mark, handle and alias, horizontal commit bar, commit count, PR count.
- **Variants**: lead contributor, standard contributor.
- **Spacing**: `--space-3` vertical and `--space-4` horizontal.
- **States**: static.
- **Accessibility**: bar width is duplicated by a visible numeric label.
- **Layout**: aligned data grid with tabular figures.

### Activity Matrix

- **Structure**: five month columns by six contributor rows, with numeric cells.
- **Variants**: zero, low, medium, high intensity.
- **Spacing**: `--space-2`.
- **States**: static.
- **Accessibility**: each cell contains the exact commit count.
- **Layout**: matrix grid; month labels never rotate.

### Merge Status Bar

- **Structure**: merged and closed segments, percentage, absolute counts.
- **Variants**: merged, closed.
- **States**: static.
- **Accessibility**: status colors are paired with text and values.

### Milestone

- **Structure**: date, PR number, short feature label, author handle.
- **Variants**: start, standard, final integration.
- **Spacing**: `--space-4`.
- **States**: static.
- **Accessibility**: chronological DOM order matches visual order.
- **Layout**: three columns by two rows in the square artifact.

The final report is also the primitive showcase because every primitive is static and all variants are rendered together on the only product surface.

## 6. Motion & Interaction

This is a static evidence artifact. No animation or interactive controls are used. Print and screenshot output must be identical to the settled browser state.

## 7. Depth & Surface

Strategy: paper-white surface, cool-gray tonal shifts, and one-pixel borders.

- Report → panel → elevated surfaces decrease luminance in small cool-gray steps.
- No drop shadows, blur, glass, or decorative glow.
- Panels use `1px solid var(--border-default)`.
- Emphasized rows use `var(--surface-elevated)` and `var(--border-strong)`.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA contrast.
- Data values are never encoded by color alone.
- Korean labels must remain unbroken at the target resolution.
- Screenshot output uses `print-color-adjust: exact`.
- The report element must remain exactly 1080 × 1080px with no internal overflow.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| Static snapshot | Entire report | The requested deliverable is a single image, so interactive chart exploration is intentionally absent. | Replace with an interactive dashboard only if requested. |
| Human review metric omitted from headline KPIs | Methodology note | The verified human review count is zero after excluding automation; highlighting it would distract from the requested contribution overview. | Add when review activity exists. |
