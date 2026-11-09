# Codex — Claude Instructions

## Project

Codex is an Electron + Next.js 16 desktop app for organizing books and manga. Dark theme, modern UI.

## Design System — "Glass"

Desktop-only app. Apple macOS (Tahoe) design language — glass materials, semantic
colors, continuous radii, spring motion — with a Codex twist (ink shader canvas,
serif display type, paper grain, cursor light).

**Always read `conventions.md` before making any UI changes.** It defines:
- Semantic color tokens (`text-label*`, `bg-fill*`, `border-separator*`, `bg-brand`, status colors)
- Glass materials (`glass-thin`, `glass`, `glass-thick`, `glass-chrome`, `hairline`, `grain`)
- Radius scale (`rounded-xs` → `rounded-3xl`, concentric rule)
- Type scale (`text-2xs`…`text-2xl`, `text-large-title`, `text-title`, `text-headline`, `text-section`, `font-display`)
- Motion (`motion/react`, `ease-apple`, `ease-spring`, `animate-*`)
- Shared primitives (`GlassModal`, `SegmentedControl`, `ListGroup`, `InkCanvas`, `Tilt`, `SpotlightCard`, …)

## Rules

- Never hardcode colors in class names (`white/40`, `bg-black/50`, hex, `oklch()`). Use semantic tokens from `globals.css`.
- Only use the radius scale (`rounded-xs|sm|md|lg|xl|2xl|3xl|full`). Never `rounded-[Npx]`.
- Only use the type scale. Never `text-[Npx]`.
- Centered modals use `GlassModal`; tab-like choices use `SegmentedControl`; settings use `ListGroup`.
- Animate with `motion/react` (not framer-motion); respect reduced motion.
- Prefer adapting 21st.dev components to the tokens over hand-rolling.
- Run `npx next build` to verify after changes.

## Versioning

On every commit, increment the version in `package.json` following SemVer:
- **patch** (0.1.0 → 0.1.1): bug fixes, small tweaks, styling adjustments
- **minor** (0.1.0 → 0.2.0): new features, new components, significant UI additions
- **major** (0.1.0 → 1.0.0): breaking changes, full rewrites, major architectural shifts

Also update the version badge in `src/components/title-bar.tsx` to match.

## Stack

- Next.js 16 (Turbopack)
- Tailwind CSS v4 (PostCSS, no tailwind.config)
- shadcn/ui (new-york style)
- Electron (main process in `electron/`)
- TypeScript strict

## Key Files

- `src/app/globals.css` — all design tokens & glass utilities
- `src/components/ui/` — primitives (incl. `glass-modal`, `segmented-control`, `list-group`, `ink-canvas`)
- `src/lib/accent.ts` — accent color definitions
- `src/lib/shortcuts.ts` — keyboard shortcut registry
- `conventions.md` — design conventions (READ BEFORE UI CHANGES)
