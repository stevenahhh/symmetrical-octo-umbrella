# Campus Digital Twin Design System

## 1. Atmosphere & Identity

A quiet campus command center for repeated scanning during a live demo. The signature is a dark 3D scene with a restrained right-side control panel: compact metrics, thin borders, muted text, and one primary violet accent for active controls and important simulated values.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/canvas | `--colors-canvas` | `#ffffff` | `#010102` | App background |
| Surface/primary | `--colors-surface-1` | `#f7f8f8` | `#0f1011` | Main panels and cards |
| Surface/secondary | `--colors-surface-2` | `#f0f2f4` | `#141516` | Nested cards and controls |
| Surface/tertiary | `--colors-surface-3` | `#e5e8eb` | `#18191a` | Stronger grouped surfaces |
| Text/primary | `--colors-ink` | `#111213` | `#f7f8f8` | Main text |
| Text/muted | `--colors-ink-muted` | `#4f5358` | `#d0d6e0` | Secondary text |
| Text/subtle | `--colors-ink-subtle` | `#737880` | `#8a8f98` | Labels and hints |
| Border/default | `--colors-hairline` | `#e0e2e5` | `#23252a` | Dividers and card outlines |
| Border/strong | `--colors-hairline-strong` | `#c8ccd2` | `#34343a` | Active segments |
| Accent/primary | `--colors-primary` | `#5e6ad2` | `#5e6ad2` | Active tabs, important values |
| Accent/hover | `--colors-primary-hover` | `#828fff` | `#828fff` | Hover states |
| Status/success | `--colors-semantic-success` | `#27a644` | `#27a644` | Healthy state and savings |
| Status/error | `--colors-semantic-danger` | `#d32f2f` | `#d32f2f` | Error and high-risk state |
| Status/room in use | `--colors-room-active` | `#3b82f6` | `#3b82f6` | D4 section rooms currently occupied, preparing for class, or always-on |
| Status/room idle | `--colors-room-idle` | `#94a3b8` | `#94a3b8` | D4 section rooms currently unused |

### Rules
- Use existing CSS variables before adding color.
- Accent is reserved for interaction, selected state, and the primary simulated result.
- Use semantic status colors only for state, risk, savings, or errors.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Panel title | 20px | 800 | 1.2 | 0 | Right panel heading |
| Section title | 16px | 700 | 1.4 | 0 | Tab section heading |
| Metric value | 28px | 600 | 1.2 | 0 | Primary metric cards |
| Body | 14px | 400-600 | 1.5 | 0 | Controls and compact text |
| Caption | 12-13px | 500-700 | 1.3 | 0.4px max | Labels and metadata |

### Font Stack
- Primary: `Wanted Sans Variable`, `Wanted Sans`, system UI, Korean system fonts, sans-serif.
- Mono: not used.

### Rules
- Dashboard text stays compact. Reserve large type for metric values only.
- Letter spacing is 0 except small uppercase/caption labels already present in the app.

## 4. Spacing & Layout

### Base Unit
All spacing follows a 4px base.

| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-xxs` | 4px | Tight inline gaps |
| `--spacing-xs` | 8px | Compact controls |
| `--spacing-sm` | 12px | Card inner gaps |
| `--spacing-md` | 16px | Standard card padding |
| `--spacing-lg` | 24px | Panel groups |
| `--spacing-xl` | 32px | Large breaks |

### Grid
- Main product surface is full viewport.
- Right control panel is fixed at 440px desktop width.
- Within the panel use 2-column or 3-column metric grids only when labels fit.

### Rules
- Keep card radii at 8-12px inside the dashboard panel.
- Avoid nested decorative cards; use cards for repeated metrics, lists, and modals.

## 5. Components

### Floating Panel
- **Structure**: `section` with border, translucent surface, and blur.
- **Variants**: right panel, modal, popup.
- **Spacing**: `--spacing-lg` groups, `--spacing-md` card internals.
- **States**: default and open/closed transitions.
- **Accessibility**: interactive children remain pointer-enabled.
- **Motion**: panel slide uses a standard 300ms transition.

### Metric Card
- **Structure**: label, large value, optional hint.
- **Variants**: default and accent value.
- **Spacing**: 24px padding, 8px label/value gaps.
- **States**: static, no hover unless clickable.
- **Accessibility**: values remain text, not image-only.
- **Motion**: none.

### Slider Row
- **Structure**: label/value row plus range input.
- **Variants**: numeric simulation controls.
- **Spacing**: 8px vertical gap.
- **States**: default, focus, disabled through native input behavior.
- **Accessibility**: range has visible label text nearby.
- **Motion**: none.

### Segmented Control
- **Structure**: grouped buttons in a bordered surface.
- **Variants**: active/inactive.
- **Spacing**: 4px inner padding, compact button padding.
- **States**: hover, active, focus.
- **Accessibility**: use buttons, not divs.
- **Motion**: color transition only.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 100-150ms | ease-out | Button hover and color changes |
| Standard | 300ms | ease | Panel open/close |

### Rules
- Animate color, opacity, and transforms only.
- Do not add decorative motion to dashboard data cards.

## 7. Depth & Surface

### Strategy
Mixed, inherited from the current app: thin borders for dashboard hierarchy, subtle shadow only for floating panels and modals, and tonal shifts for nested cards.

| Level | Value | Usage |
|-------|-------|-------|
| Border default | `1px solid var(--colors-hairline)` | Cards and controls |
| Border strong | `1px solid var(--colors-hairline-strong)` | Active or stronger cards |
| Panel shadow | `0 20px 48px rgba(0,0,0,0.28)` | Floating panels |
