# Codex — Claude Instructions

## Project

Codex is an Electron + Next.js 16 desktop app for organizing books and manga. Dark theme, modern UI.

## Design System

**Always read `conventions.md` before making any UI changes.** It defines:
- Border radius tokens (one radius for everything, `rounded-lg`)
- Spacing scale
- Surface color variables (`--bg-surface`, `--bg-inset`, `--bg-elevated`, `--bg-overlay`)
- Typography scale (11px, 12px, 13px, 14px only)
- Modal patterns (centered floating panels, not popovers)
- Shadow tokens

## Rules

- Never hardcode `oklch()` values in Tailwind classes. Use CSS variables from `globals.css`.
- Never use arbitrary border-radius values like `rounded-[5px]` or `rounded-2xl`. Use `rounded-lg`.
- The dock is the only element that uses `rounded-full`.
- All modals float centered above the dock, not as Radix popovers.
- Keep the import button the same radius as everything else (`rounded-lg`).
- Run `npx next build` to verify after changes.

## Stack

- Next.js 16 (Turbopack)
- Tailwind CSS v4 (PostCSS, no tailwind.config)
- shadcn/ui (new-york style)
- Electron (main process in `electron/`)
- TypeScript strict

## Key Files

- `src/app/globals.css` — all design tokens
- `src/lib/accent.ts` — accent color definitions
- `src/lib/shortcuts.ts` — keyboard shortcut registry
- `conventions.md` — design conventions (READ BEFORE UI CHANGES)
