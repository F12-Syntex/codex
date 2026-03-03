/* ── AI Formatting Component Styles ───────────────────────── */

/**
 * All CSS classes used by AI-formatted content.
 * Injected as a <style> tag in TextContent when formatting is active.
 *
 * Design goals:
 * - Inline-first: most enhancements are subtle inline spans, not big block cards
 * - TTS-safe: underlying text stays readable as plain text
 * - Compact: stat blocks are tight 2-column tables, not sprawling grids
 * - Icons via CSS ::before with inline SVG data URIs (no Unicode emoji)
 * - Theme-adaptive via [data-reading-theme]
 * - All border-radius: 8px per design system
 */

export const AI_FORMATTING_STYLES = `
/* ── Theme variables ──────────────────────────────────────── */
[data-reading-theme="dark"] {
  --ai-fmt-card-bg: oklch(0.18 0 0);
  --ai-fmt-card-border: oklch(1 0 0 / 6%);
  --ai-fmt-accent: oklch(0.60 0.20 264);
  --ai-fmt-accent-dim: oklch(0.60 0.20 264 / 12%);
  --ai-fmt-text: oklch(0.90 0 0);
  --ai-fmt-text-dim: oklch(0.58 0 0);
  --ai-fmt-buff: oklch(0.65 0.14 150);
  --ai-fmt-buff-bg: oklch(0.65 0.14 150 / 10%);
  --ai-fmt-debuff: oklch(0.65 0.18 25);
  --ai-fmt-debuff-bg: oklch(0.65 0.18 25 / 10%);
  --ai-fmt-villain: oklch(0.65 0.18 25);
  --ai-fmt-divine: oklch(0.78 0.12 80);
  --ai-fmt-hero: oklch(0.65 0.18 264);
  --ai-fmt-thought-border: oklch(1 0 0 / 8%);
  --ai-fmt-sfx: oklch(0.75 0 0);
  --ai-fmt-reveal-bg: oklch(0.60 0.20 264 / 8%);
  --ai-fmt-icon-filter: brightness(0.8);
}

[data-reading-theme="light"] {
  --ai-fmt-card-bg: oklch(0.97 0 0);
  --ai-fmt-card-border: oklch(0 0 0 / 6%);
  --ai-fmt-accent: oklch(0.48 0.18 264);
  --ai-fmt-accent-dim: oklch(0.48 0.18 264 / 10%);
  --ai-fmt-text: oklch(0.20 0 0);
  --ai-fmt-text-dim: oklch(0.48 0 0);
  --ai-fmt-buff: oklch(0.45 0.14 150);
  --ai-fmt-buff-bg: oklch(0.45 0.14 150 / 8%);
  --ai-fmt-debuff: oklch(0.50 0.18 25);
  --ai-fmt-debuff-bg: oklch(0.50 0.18 25 / 8%);
  --ai-fmt-villain: oklch(0.50 0.18 25);
  --ai-fmt-divine: oklch(0.50 0.12 80);
  --ai-fmt-hero: oklch(0.48 0.18 264);
  --ai-fmt-thought-border: oklch(0 0 0 / 8%);
  --ai-fmt-sfx: oklch(0.35 0 0);
  --ai-fmt-reveal-bg: oklch(0.48 0.18 264 / 8%);
  --ai-fmt-icon-filter: brightness(0.3);
}

[data-reading-theme="sepia"] {
  --ai-fmt-card-bg: oklch(0.88 0.025 75);
  --ai-fmt-card-border: oklch(0.40 0.04 75 / 12%);
  --ai-fmt-accent: oklch(0.52 0.10 55);
  --ai-fmt-accent-dim: oklch(0.52 0.10 55 / 10%);
  --ai-fmt-text: oklch(0.25 0.02 55);
  --ai-fmt-text-dim: oklch(0.50 0.03 55);
  --ai-fmt-buff: oklch(0.45 0.10 150);
  --ai-fmt-buff-bg: oklch(0.45 0.10 150 / 8%);
  --ai-fmt-debuff: oklch(0.50 0.14 25);
  --ai-fmt-debuff-bg: oklch(0.50 0.14 25 / 8%);
  --ai-fmt-villain: oklch(0.50 0.14 25);
  --ai-fmt-divine: oklch(0.52 0.10 80);
  --ai-fmt-hero: oklch(0.48 0.12 264);
  --ai-fmt-thought-border: oklch(0.40 0.04 75 / 15%);
  --ai-fmt-sfx: oklch(0.38 0.03 55);
  --ai-fmt-reveal-bg: oklch(0.52 0.10 55 / 8%);
  --ai-fmt-icon-filter: brightness(0.4) sepia(0.3);
}

/* ── Shared icon base ────────────────────────────────────── */
.ai-fmt-icon::before {
  content: "";
  display: inline-block;
  width: 0.85em;
  height: 0.85em;
  margin-right: 0.3em;
  vertical-align: -0.1em;
  background-size: contain;
  background-repeat: no-repeat;
  filter: var(--ai-fmt-icon-filter);
  opacity: 0.7;
}

/* Icon variants — tiny inline SVGs */
.ai-fmt-icon-sword::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M14.5 17.5 3 6V3h3l11.5 11.5'/%3E%3Cpath d='m13 19 6-6'/%3E%3Cpath d='m16 16 3.5 3.5'/%3E%3Cpath d='m19 21-2-2'/%3E%3C/svg%3E"); }
.ai-fmt-icon-shield::before  { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-sparkle::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-zap::before     { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-scroll::before  { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M10 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2'/%3E%3Cpath d='M22 17v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v12Z'/%3E%3Cpath d='M10 5H8'/%3E%3Cpath d='M10 9H8'/%3E%3Cpath d='M10 13H8'/%3E%3C/svg%3E"); }
.ai-fmt-icon-skull::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m12.5 17-.5-1-.5 1h1z'/%3E%3Cpath d='M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z'/%3E%3Ccircle cx='15' cy='12' r='1'/%3E%3Ccircle cx='9' cy='12' r='1'/%3E%3C/svg%3E"); }
.ai-fmt-icon-arrow-up::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m5 12 7-7 7 7'/%3E%3Cpath d='M12 19V5'/%3E%3C/svg%3E"); }
.ai-fmt-icon-gem::before     { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 3h12l4 6-10 13L2 9Z'/%3E%3Cpath d='M11 3 8 9l4 13 4-13-3-6'/%3E%3Cpath d='M2 9h20'/%3E%3C/svg%3E"); }
.ai-fmt-icon-trophy::before  { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 9H4.5a2.5 2.5 0 0 1 0-5H6'/%3E%3Cpath d='M18 9h1.5a2.5 2.5 0 0 0 0-5H18'/%3E%3Cpath d='M4 22h16'/%3E%3Cpath d='M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22'/%3E%3Cpath d='M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22'/%3E%3Cpath d='M18 2H6v7a6 6 0 0 0 12 0V2Z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-heart::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-star::before    { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-flame::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-eye::before     { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'/%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3C/svg%3E"); }
.ai-fmt-icon-crown::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z'/%3E%3Cpath d='M5 21h14'/%3E%3C/svg%3E"); }
.ai-fmt-icon-book::before    { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M12 7v14'/%3E%3Cpath d='M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-target::before  { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Ccircle cx='12' cy='12' r='6'/%3E%3Ccircle cx='12' cy='12' r='2'/%3E%3C/svg%3E"); }
.ai-fmt-icon-plus::before    { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M5 12h14'/%3E%3Cpath d='M12 5v14'/%3E%3C/svg%3E"); }
.ai-fmt-icon-user::before    { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='8' r='5'/%3E%3Cpath d='M20 21a8 8 0 0 0-16 0'/%3E%3C/svg%3E"); }
.ai-fmt-icon-bolt::before    { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M21 12.5H13.5V3l-10 12h7.5V21z'/%3E%3C/svg%3E"); }

/* ── Column break fix ────────────────────────────────────── */
.ai-fmt-stat-block,
.ai-fmt-system-msg,
.ai-fmt-item-card,
.ai-fmt-thought {
  -webkit-column-break-inside: avoid;
  page-break-inside: avoid;
  break-inside: avoid;
  overflow: hidden;
}

/* ── Stat Block — full-width key-value grid ─────────────── */
.ai-fmt-stat-block {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1px 12px;
  background: var(--ai-fmt-card-bg);
  border: 1px solid var(--ai-fmt-card-border);
  border-radius: 8px;
  padding: 6px 12px;
  margin: 6px 0;
  font-size: 0.88em;
  width: 100%;
}

.ai-fmt-stat-row {
  display: contents;
}

.ai-fmt-stat-label {
  color: var(--ai-fmt-text-dim);
  font-size: 0.85em;
  font-weight: 500;
  padding: 2px 0;
  white-space: nowrap;
}

.ai-fmt-stat-value {
  color: var(--ai-fmt-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 2px 0;
  overflow-wrap: break-word;
  word-break: break-word;
  min-width: 0;
}

/* ── XP / Level Badge — compact inline pill ──────────────── */
.ai-fmt-xp-badge {
  display: inline;
  background: var(--ai-fmt-accent-dim);
  border-radius: 4px;
  padding: 0 5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ai-fmt-accent);
  font-size: 0.9em;
}

/* ── System Message — subtle left-border box ─────────────── */
.ai-fmt-system-msg {
  border-left: 2px solid var(--ai-fmt-accent);
  padding: 4px 10px;
  margin: 4px 0;
  font-size: 0.93em;
  color: var(--ai-fmt-text);
  background: var(--ai-fmt-accent-dim);
  border-radius: 0 8px 8px 0;
}

/* ── Item Card — tight inline card ───────────────────────── */
.ai-fmt-item-card {
  background: var(--ai-fmt-card-bg);
  border: 1px solid var(--ai-fmt-card-border);
  border-radius: 8px;
  padding: 5px 10px;
  margin: 4px 0;
  font-size: 0.92em;
}

.ai-fmt-item-name {
  font-weight: 600;
}

/* ── Rarity Colors ───────────────────────────────────────── */
.ai-fmt-rarity-common    { color: var(--ai-fmt-text-dim); }
.ai-fmt-rarity-uncommon  { color: oklch(0.65 0.14 150); }
.ai-fmt-rarity-rare      { color: oklch(0.60 0.18 264); }
.ai-fmt-rarity-epic      { color: oklch(0.58 0.22 300); }
.ai-fmt-rarity-legendary { color: oklch(0.72 0.16 65); }

/* ── Status Effect Badges — tiny inline pills ────────────── */
.ai-fmt-status-badge {
  display: inline;
  border-radius: 4px;
  padding: 0 5px;
  font-size: 0.88em;
  font-weight: 500;
}

.ai-fmt-status-buff {
  background: var(--ai-fmt-buff-bg);
  color: var(--ai-fmt-buff);
}

.ai-fmt-status-debuff {
  background: var(--ai-fmt-debuff-bg);
  color: var(--ai-fmt-debuff);
}

/* ── Dialogue Coloring — just text color, nothing else ────── */
.ai-fmt-dialogue-villain { color: var(--ai-fmt-villain); }
.ai-fmt-dialogue-divine  { color: var(--ai-fmt-divine); }
.ai-fmt-dialogue-hero    { color: var(--ai-fmt-hero); }

/* ── Thought Block — subtle left border, stays compact ────── */
.ai-fmt-thought {
  border-left: 2px solid var(--ai-fmt-thought-border);
  padding-left: 10px;
  font-style: italic;
  color: var(--ai-fmt-text-dim);
  margin: 2px 0;
}

/* ── Sound Effects — just bold + slight tracking ─────────── */
.ai-fmt-sfx {
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ai-fmt-sfx);
}

/* ── Key Reveal — subtle background highlight ────────────── */
.ai-fmt-reveal {
  background: var(--ai-fmt-reveal-bg);
  padding: 0 3px;
  border-radius: 3px;
}
`;
