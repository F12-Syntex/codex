# Codex Design Conventions

Every component must follow these tokens. No hardcoded values.

## Border Radius

One radius for all UI elements. The dock is the only exception (`rounded-full`).

| Token             | Value   | Use                                      |
|-------------------|---------|------------------------------------------|
| `--radius` (base) | `10px`  | Everything: cards, buttons, inputs, modals, panels, thumbnails, badges |
| `rounded-full`    | `9999px`| Dock container only, avatar circles       |

In Tailwind: use `rounded-lg` (maps to `--radius-lg` = `var(--radius)` = `10px`).
Never use `rounded-md`, `rounded-xl`, `rounded-2xl`, `rounded-[5px]`, or any arbitrary radius on UI elements.

## Spacing

Use Tailwind's default 4px scale. Prefer these values:

| Token | px  | Use                                |
|-------|-----|------------------------------------|
| `1`   | 4   | Tight gaps (icon rows, pill innards) |
| `1.5` | 6   | Inner padding of small controls    |
| `2`   | 8   | Standard small gap                 |
| `3`   | 12  | Section padding, card inner        |
| `4`   | 16  | Panel padding, toolbar padding     |
| `5`   | 20  | Grid gaps, content area padding    |

Consistent padding rules:
- **Modals/panels**: `p-4` (16px)
- **Toolbar**: `px-4 py-2`
- **Sidebar sections**: `px-3`
- **Grid content**: `gap-5 p-5`
- **Between dock buttons**: `gap-1`

## Colors (surfaces)

All surfaces use CSS custom properties defined in `globals.css`. Never use inline `oklch()` in class names.

| Variable               | Purpose                          |
|------------------------|----------------------------------|
| `--bg-surface`         | Sidebar, elevated panels         |
| `--bg-inset`           | Recessed areas (toggles, inputs) |
| `--bg-elevated`        | Active items, badges, hover      |
| `--bg-overlay`         | Modal/overlay panel background   |
| `--accent-brand`       | Primary accent color             |
| `--accent-brand-dim`   | Accent at 15% opacity            |
| `--accent-brand-subtle`| Accent at 8% opacity             |
| `--accent-brand-fg`    | Text on accent backgrounds       |

In Tailwind use: `bg-[var(--bg-surface)]` etc.

## Typography

| Size    | Tailwind   | Use                            |
|---------|------------|--------------------------------|
| 11px    | `text-[11px]` | Tertiary labels, hints      |
| 12px    | `text-xs`  | Secondary text, badges, kbd    |
| 13px    | `text-[13px]` | Body text in dense areas    |
| 14px    | `text-sm`  | Primary body text              |

Never use `text-[10px]` or `text-[15px]`. Pick from the scale above.

## Modals

All dock modals (theme, shortcuts, settings) use centered floating panels, not popovers:
- Positioned above the dock, centered horizontally
- `rounded-lg` (not 2xl)
- `bg-[var(--bg-overlay)]` with `border border-white/[0.06]`
- Animate in with `overlay-in` keyframe

## Shadows

| Token               | Use                     |
|----------------------|-------------------------|
| `shadow-sm`          | Subtle elevation (toggles) |
| `shadow-lg shadow-black/30` | Dock, floating panels |
| `shadow-xl shadow-black/40` | Hover cards only      |

## Icons

All icons: `h-4 w-4` standard, `h-3.5 w-3.5` in compact areas.

## Background Images (Advanced Theme)

When a user sets a background image:
- `--bg-image` CSS variable is set on `[data-accent]` container
- Content area shows the image
- All surfaces use semi-transparent backgrounds so the image bleeds through
