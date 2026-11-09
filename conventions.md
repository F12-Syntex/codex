# Codex Design Conventions — "Glass"

Codex is a **desktop-only** Electron app (Windows / macOS / Linux). The visual
language is Apple's macOS (Tahoe-era) design system: translucent glass materials,
semantic label/fill colors, generous continuous radii, quiet typography and
spring-based motion. There is **no mobile/touch layout** — design for pointer +
keyboard, hover states, window chrome, and macOS density (13px body).

All tokens live in `src/app/globals.css`. Never hardcode colors.

---

## 1. Color — semantic tokens only

**Never** write `text-white/40`, `bg-white/[0.06]`, `border-white/10`,
`bg-black/50`, hex, `rgb()` or `oklch()` in class names. Use these Tailwind
classes (they adapt to dark / dim / light appearances):

| Purpose | Class |
|---|---|
| Primary text | `text-label` |
| Secondary text (descriptions, meta) | `text-label-secondary` |
| Tertiary text (placeholders, decoration, icons at rest — never meaningful info) | `text-label-tertiary` |
| Quaternary (disabled, faint decoration) | `text-label-quaternary` |
| Strong fill (pressed, selected control bg) | `bg-fill` |
| Secondary fill (hover on fill controls, inputs) | `bg-fill-secondary` |
| Tertiary fill (input bg, hover rows, chips) | `bg-fill-tertiary` |
| Quaternary fill (subtle hover, zebra) | `bg-fill-quaternary` |
| Hairline borders / dividers | `border-separator` (`border-separator-strong` for emphasis) |
| Accent | `bg-brand`, `text-brand`, `bg-brand/15` (tint), `text-brand-fg` (text on accent) |
| Status | `text-danger` / `bg-danger`, `text-success`, `text-warning`, `text-info` |
| Solid surfaces | `bg-surface`, `bg-elevated`, `bg-inset`, `bg-canvas` |

Mapping cheat-sheet for migrating old code:
`white/90,white/80 → label` · `white/70,white/60,white/50 → label-secondary` ·
`white/40,white/30 → label-tertiary` · `white/20,white/15,white/10 (text) → label-quaternary` ·
`bg-white/[0.03..0.05] → bg-fill-quaternary` · `bg-white/[0.06..0.08] → bg-fill-tertiary` ·
`bg-white/10..12 → bg-fill-secondary` · `bg-white/15+ → bg-fill` ·
`border-white/[0.04..0.08] → border-separator` · `border-white/10+ → border-separator-strong` ·
`bg-[var(--bg-overlay)] → glass-thick` · `bg-[var(--accent-brand)] → bg-brand` ·
`text-[var(--accent-brand)] → text-brand` · `bg-[var(--accent-brand-dim)] → bg-brand/18` ·
`bg-[var(--accent-brand-subtle)] → bg-brand/10` · `red-400/500 → danger` · `green/emerald → success` · `amber/yellow/orange → warning`.

Exception: content that must stay a fixed color (book cover overlays drawn on top
of images, reader paper themes in `src/app/reader/lib/theme.ts`, graph node
palettes, AI formatting CSS) may keep literal colors.

**Theme scope:** theme attributes (`data-accent`, `data-appearance`, `data-tint`,
`data-cursor`) and the custom-accent variables live on `<html>`. Never theme a
subtree — portals (menus, modals, tooltips, search) render outside it.

## 2. Materials (glassmorphism)

Glass needs something behind it. The main window body uses `app-canvas` (a soft
accent aurora). Floating chrome is glass:

| Utility | Use |
|---|---|
| `glass-thin` | Sidebars, toolbars, inline floating bars (no shadow) |
| `glass` | Dock, popovers, cards that float, menus |
| `glass-thick` | Modals, dialogs, command palette (max legibility, modal shadow) |
| `glass-menu` | Dropdown & context menus, popovers over content (thick material, popover shadow) |
| `glass-chrome` | Title bar, sticky headers |
| `hairline` | 0.5px inner ring for solid cards / covers |

Glass utilities already include blur, saturation, edge ring and highlight.
Verify glass actually blurs: `getComputedStyle(el).backdropFilter !== "none"`.
Any ancestor with a `filter` (even `blur(0px)` left by an animation) becomes a
backdrop root and kills descendant glass — entrance animations must end at
`filter: none` (motion: `transitionEnd: { filter: "none" }`). Do
not add extra borders on glass. Do not nest glass in glass (inner panels use
`bg-fill-quaternary` instead).

## 3. Radius — continuous, generous

Derived from the theme's `--radius` (default 12px):

| Class | px | Use |
|---|---|---|
| `rounded-xs` | 6 | kbd, tiny chips, progress tracks |
| `rounded-sm` | 8 | badges, small thumbnails, inner elements of a control |
| `rounded-md` | 10 | **buttons, inputs, list rows, menu items, sidebar items** |
| `rounded-lg` | 12 | **cards, book covers, tiles, grouped lists** |
| `rounded-xl` | 16 | popovers, dropdown/context menus, toolbars groups |
| `rounded-2xl` | 20 | **modals, panels, floating sidebar, sheets** |
| `rounded-3xl` | 28 | hero surfaces, large sheets |
| `rounded-full` | pill | dock, segmented controls, search fields, switches, avatars, toolbar pills, tags |

Concentricity rule: inner radius = outer radius − padding. A `rounded-2xl` (20)
panel with `p-2` (8) contains `rounded-lg` (12) items. Never `rounded-[Npx]`.

## 4. Typography

System font stack (`--font-ui`): SF Pro on macOS, Inter elsewhere. macOS density.

| Class | Size | Use |
|---|---|---|
| `text-large-title` / `text-2xl` | 32/600 serif | Page titles ("Bookshelf", "Settings") |
| `text-title` / `text-xl` | 21/600 serif | Modal titles, section heroes |
| `text-lg` | 17 | Book title in detail views |
| `text-base` | 15 | Emphasised body, empty-state headlines |
| `text-headline` | 13/600 | Row titles, card titles, group headers |
| `text-sm` | 13 | **Body default** |
| `text-xs` | 12 | Secondary meta, labels, buttons in compact bars |
| `text-2xs` | 11 | Captions, badges, kbd, counts |
| `text-section` | 11/600 caps | Sidebar / grouped list section headers |

**Seven sizes only: 11 · 12 · 13 · 15 · 17 · 21 · 32.** Weights: 400 body, 500 controls, 600 headings. Use
`tabular-nums` on counters/percentages. No arbitrary `text-[Npx]`.

## 5. Spacing & alignment

4px grid. Every screen uses the same rhythm:

- Page content gutter: `px-8` (32px); page header `pt-6 pb-4`.
- Panel / modal padding: `p-5` (20px), header `px-5 pt-5 pb-3`, footer `px-5 pb-5 pt-3`.
- Toolbar height: 52px (`h-13`), items `gap-2`.
- List rows: `h-9` (36px) dense, `h-11` (44px) comfortable; `px-3`; icon→text `gap-2.5`.
- Sidebar: `p-2` around groups, items `h-8 px-2.5 rounded-md`, section header `px-2.5 pt-4 pb-1.5`.
- Grid: `gap-x-6 gap-y-8` for covers.
- Align everything to a shared left edge; icons are `size-4` (16) in rows, `size-[18px]` never — use `size-4` / `size-5`.
- Vertical centering: use `items-center` + explicit heights, never padding hacks.

## 6. Controls

- **Primary button**: `bg-brand text-brand-fg rounded-md h-8 px-3.5 font-medium` (via `<Button>`). Toolbar pills use `<Button shape="pill">`; icon buttons are round.
- **Secondary**: `bg-fill-tertiary hover:bg-fill-secondary`.
- **Toolbar / icon buttons**: `<Button variant="ghost" size="icon-sm">` → `size-8 rounded-md text-label-secondary hover:bg-fill-tertiary hover:text-label`.
- **Search fields & toolbar pills**: `rounded-full bg-fill-tertiary h-8 px-3`.
- **Segmented control**: `<SegmentedControl>` from `@/components/ui/segmented-control` (sliding pill, spring).
- **Switch**: `<Switch>` (iOS style, spring thumb).
- **Inputs**: `<Input>` — `h-8 rounded-md bg-fill-tertiary`, focus = accent ring.
- **Grouped settings**: `<ListGroup>` / `<ListRow>` from `@/components/ui/list-group` (macOS System Settings style).
- Every interactive element gets `pressable` or `active:scale-[0.97]` and a visible `focus-ring`.
- Hover = fill change in 150ms; never change layout on hover.

## 7. Modals & overlays

Use `<GlassModal>` from `@/components/ui/glass-modal` for every centered modal
(details, analysers, confirmations, dock panels):

- Scrim: `bg-[var(--scrim)]` + `backdrop-blur-sm`, fades in.
- Panel: `glass-thick rounded-2xl`, spring `sheet-in` animation (motion).
- Header: title (`text-title`) + optional subtitle + close button (round, `size-7 rounded-full bg-fill-tertiary`).
- Esc closes; click on scrim closes.
- Dock panels (appearance, shortcuts) float centered above the dock.

Menus (dropdown/context): `glass-thick rounded-xl p-1`, items `h-7 rounded-md px-2 text-sm`,
highlighted item `bg-brand text-brand-fg` (macOS style).
Tooltips: `glass-thick rounded-md px-2 py-1 text-xs`.

## 8. Motion

Library: `motion` (`import { motion, AnimatePresence } from "motion/react"`).

| Token | Use |
|---|---|
| `ease-apple` (cubic-bezier .32,.72,0,1) | default for transitions |
| `ease-spring` (CSS linear spring) | press release, pop-ins, toggles |
| `animate-fade-up` | list/grid items appearing (stagger 20–30ms, cap 12 items) |
| `animate-sheet-in` | panels/modals |
| `animate-pop-in` | menus, popovers, toasts |
| `animate-blur-in` | page/view changes |
| motion spring | `{ type: "spring", stiffness: 400, damping: 32 }` (snappy), `{ type: "spring", bounce: 0.2, duration: 0.45 }` (layout) |

Segmented-control thumbs use `bg-[var(--segment-thumb)]` (always lighter than the track).
Use `layoutId` for sliding selection indicators (sidebar selection, segmented
controls, tabs). Respect `prefers-reduced-motion` (`useReducedMotion`). Never
animate width/height of large containers per frame; animate transform/opacity.

## 9. Shadows

`shadow-xs`, `shadow-sm` (controls), `shadow-md` (cards hover), `shadow-lg`
(popovers), `shadow-xl` (modals), `shadow-cover` (book covers). Glass utilities
include their own shadow.

## 10. Icons

lucide-react, `strokeWidth={1.75}` default (2 for tiny 12px). `size-4` in rows
and toolbars, `size-3.5` in compact chips, `size-5` in dock & empty states,
`size-10`+ only in empty-state illustrations (`text-label-quaternary`).

## 11. Background image (advanced theme)

When the user sets a background image, the content area shows it and all glass
surfaces stay translucent so the image refracts through. Do not make surfaces
opaque.

## 12. The Codex twist (what makes it ours, not stock Apple)

Apple's discipline, with a bookish identity on top:

1. **Ink canvas**: `<InkCanvas />` (`@/components/ui/ink-canvas`) is the main window's
   living backdrop. It's a slow WebGL ink-in-water flow field tinted by the accent,
   with film grain. All glass floats above it. Toggle: `theme.ambientBackground`.
2. **Serif display type**: page titles (`text-large-title`), modal titles
   (`text-title`) and book titles in hero/detail views use `font-display`
   (Source Serif 4). Everything else is the system sans. Never put serif in controls.
3. **Paper grain on glass**: big glass panels may add the `grain` overlay class
   (subtle noise) so surfaces feel like paper, not plastic.
4. **Cursor light**: interactive cards (book covers, tiles) get a soft
   pointer-following highlight (`--mx/--my` radial glare) and a gentle 3D tilt
   on covers. Keep it within ±6°.
5. **Accent "ink" glow**: the active item (selected sidebar row, primary CTA, active
   dock item) may carry a faint accent glow (`shadow-[0_0_24px_-6px_var(--accent-brand)]`).
   Use it at most once per region.
6. **21st.dev components**: prefer adapting proven 21st.dev components (glass dock,
   segmented control, spotlight, tilt cards, number tickers, animated lists,
   text effects, toasts…) over hand-rolling. Adapt them to these tokens. No
   hardcoded palettes, `rounded-[Npx]` or one-off fonts.

## 13. Discipline rules (from the CEO review)

1. **No eyebrows.** No small-caps label above a title.
2. **Say it once.** A count, version or location label appears once per window.
3. **One selection style** for every source list (app sidebar, settings nav, wiki
   sidebar, TOC): `bg-fill-secondary` pill, accent-colored icon, `font-medium` label.
4. **Colored icon tiles only in navigation**, never on every content row.
5. **One window chrome:** a 52px transparent title bar with `<WindowControls />` in every window.
6. **Panels over reading text use `glass-thick`** and must not occlude the text column.
7. **Labels over glyphs** for toolbars with more than three non-universal actions.
8. **Magnification is for things, not utilities.** The dock does not fisheye.
