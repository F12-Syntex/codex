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
 *
 * Genre coverage: Fantasy, Horror, Sci-Fi, Romance, Mystery, Ranker/Progression,
 * Literary Fiction, Wuxia/Xianxia, and misc (translator notes, footnotes, etc.)
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
  --ai-fmt-system-color: oklch(0.55 0 0);
  --ai-fmt-system-rule: oklch(1 0 0 / 6%);
  --ai-fmt-icon-filter: brightness(0.8);

  /* Horror */
  --ai-fmt-horror-text: oklch(0.62 0.18 25);
  --ai-fmt-horror-bg: oklch(0.62 0.18 25 / 6%);
  --ai-fmt-horror-border: oklch(0.62 0.18 25 / 15%);
  --ai-fmt-whisper: oklch(0.50 0 0);
  --ai-fmt-glitch: oklch(0.65 0.22 25);
  --ai-fmt-corruption-bg: oklch(0.15 0.02 0);

  /* Sci-Fi */
  --ai-fmt-terminal-bg: oklch(0.12 0.02 160);
  --ai-fmt-terminal-text: oklch(0.72 0.18 160);
  --ai-fmt-terminal-border: oklch(0.72 0.18 160 / 20%);
  --ai-fmt-hologram: oklch(0.70 0.15 200);
  --ai-fmt-hologram-bg: oklch(0.70 0.15 200 / 8%);
  --ai-fmt-ai-voice: oklch(0.65 0.12 200);
  --ai-fmt-data-stream: oklch(0.60 0.14 160);

  /* Romance */
  --ai-fmt-romance: oklch(0.68 0.16 350);
  --ai-fmt-romance-bg: oklch(0.68 0.16 350 / 8%);
  --ai-fmt-blush: oklch(0.70 0.14 15);
  --ai-fmt-heartbeat: oklch(0.65 0.20 350);

  /* Mystery */
  --ai-fmt-clue: oklch(0.72 0.16 80);
  --ai-fmt-clue-bg: oklch(0.72 0.16 80 / 10%);
  --ai-fmt-evidence-border: oklch(0.72 0.16 80 / 20%);
  --ai-fmt-redacted-bg: oklch(0.25 0 0);
  --ai-fmt-suspect: oklch(0.65 0.14 40);

  /* Ranker / Progression / Tower */
  --ai-fmt-rank-s: oklch(0.72 0.16 65);
  --ai-fmt-rank-a: oklch(0.65 0.22 300);
  --ai-fmt-rank-b: oklch(0.60 0.18 264);
  --ai-fmt-rank-c: oklch(0.65 0.14 150);
  --ai-fmt-rank-d: oklch(0.58 0 0);
  --ai-fmt-rank-f: oklch(0.50 0 0);
  --ai-fmt-floor-bg: oklch(0.20 0.02 264);
  --ai-fmt-floor-border: oklch(0.60 0.20 264 / 20%);
  --ai-fmt-skill-active: oklch(0.65 0.18 264);
  --ai-fmt-skill-passive: oklch(0.58 0.10 150);
  --ai-fmt-class-badge: oklch(0.70 0.14 40);
  --ai-fmt-class-badge-bg: oklch(0.70 0.14 40 / 10%);

  /* Status Window / Game UI */
  --ai-fmt-window-bg: oklch(0.14 0.02 264);
  --ai-fmt-window-border: oklch(0.60 0.20 264 / 25%);
  --ai-fmt-window-header-bg: oklch(0.20 0.04 264);
  --ai-fmt-window-title: oklch(0.80 0.10 264);
  --ai-fmt-window-text: oklch(0.82 0 0);
  --ai-fmt-window-dim: oklch(0.55 0 0);
  --ai-fmt-progress-bg: oklch(0.25 0 0);
  --ai-fmt-progress-fill: oklch(0.60 0.20 264);
  --ai-fmt-hp-fill: oklch(0.60 0.20 25);
  --ai-fmt-mp-fill: oklch(0.55 0.20 264);
  --ai-fmt-exp-fill: oklch(0.65 0.14 150);
  --ai-fmt-quest-active: oklch(0.72 0.16 80);
  --ai-fmt-quest-complete: oklch(0.65 0.14 150);

  /* Translator / Meta */
  --ai-fmt-tn-bg: oklch(0.20 0 0);
  --ai-fmt-tn-border: oklch(1 0 0 / 8%);
  --ai-fmt-tn-text: oklch(0.60 0 0);
  --ai-fmt-footnote: oklch(0.55 0 0);

  /* Literary */
  --ai-fmt-flashback-border: oklch(1 0 0 / 10%);
  --ai-fmt-flashback-bg: oklch(1 0 0 / 3%);
  --ai-fmt-letter-bg: oklch(0.20 0.01 55);
  --ai-fmt-letter-border: oklch(0.40 0.03 55 / 20%);
  --ai-fmt-epigraph: oklch(0.55 0 0);
  --ai-fmt-timeskip: oklch(0.48 0 0);
  --ai-fmt-poetry: oklch(0.70 0.06 264);
  --ai-fmt-scream: oklch(0.70 0.18 25);

  /* Wuxia / Xianxia / Cultivation */
  --ai-fmt-qi: oklch(0.65 0.16 200);
  --ai-fmt-qi-bg: oklch(0.65 0.16 200 / 8%);
  --ai-fmt-technique: oklch(0.72 0.14 50);
  --ai-fmt-technique-bg: oklch(0.72 0.14 50 / 8%);
  --ai-fmt-breakthrough: oklch(0.78 0.20 65);
  --ai-fmt-breakthrough-bg: oklch(0.78 0.20 65 / 10%);
  --ai-fmt-sect: oklch(0.60 0.12 300);

  /* Combat */
  --ai-fmt-crit: oklch(0.72 0.20 65);
  --ai-fmt-crit-bg: oklch(0.72 0.20 65 / 12%);
  --ai-fmt-miss: oklch(0.50 0 0);
  --ai-fmt-heal-text: oklch(0.65 0.14 150);
  --ai-fmt-combo: oklch(0.70 0.18 300);
  --ai-fmt-combo-bg: oklch(0.70 0.18 300 / 10%);
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
  --ai-fmt-system-color: oklch(0.45 0 0);
  --ai-fmt-system-rule: oklch(0 0 0 / 8%);
  --ai-fmt-icon-filter: brightness(0.3);

  /* Horror */
  --ai-fmt-horror-text: oklch(0.48 0.18 25);
  --ai-fmt-horror-bg: oklch(0.48 0.18 25 / 6%);
  --ai-fmt-horror-border: oklch(0.48 0.18 25 / 12%);
  --ai-fmt-whisper: oklch(0.60 0 0);
  --ai-fmt-glitch: oklch(0.50 0.22 25);
  --ai-fmt-corruption-bg: oklch(0.92 0 0);

  /* Sci-Fi */
  --ai-fmt-terminal-bg: oklch(0.95 0.01 160);
  --ai-fmt-terminal-text: oklch(0.38 0.14 160);
  --ai-fmt-terminal-border: oklch(0.38 0.14 160 / 20%);
  --ai-fmt-hologram: oklch(0.45 0.15 200);
  --ai-fmt-hologram-bg: oklch(0.45 0.15 200 / 8%);
  --ai-fmt-ai-voice: oklch(0.42 0.12 200);
  --ai-fmt-data-stream: oklch(0.40 0.14 160);

  /* Romance */
  --ai-fmt-romance: oklch(0.52 0.16 350);
  --ai-fmt-romance-bg: oklch(0.52 0.16 350 / 8%);
  --ai-fmt-blush: oklch(0.55 0.14 15);
  --ai-fmt-heartbeat: oklch(0.50 0.20 350);

  /* Mystery */
  --ai-fmt-clue: oklch(0.50 0.14 80);
  --ai-fmt-clue-bg: oklch(0.50 0.14 80 / 8%);
  --ai-fmt-evidence-border: oklch(0.50 0.14 80 / 15%);
  --ai-fmt-redacted-bg: oklch(0.15 0 0);
  --ai-fmt-suspect: oklch(0.50 0.14 40);

  /* Ranker / Progression / Tower */
  --ai-fmt-rank-s: oklch(0.55 0.16 65);
  --ai-fmt-rank-a: oklch(0.50 0.22 300);
  --ai-fmt-rank-b: oklch(0.48 0.18 264);
  --ai-fmt-rank-c: oklch(0.45 0.14 150);
  --ai-fmt-rank-d: oklch(0.45 0 0);
  --ai-fmt-rank-f: oklch(0.40 0 0);
  --ai-fmt-floor-bg: oklch(0.96 0.01 264);
  --ai-fmt-floor-border: oklch(0.48 0.18 264 / 15%);
  --ai-fmt-skill-active: oklch(0.48 0.18 264);
  --ai-fmt-skill-passive: oklch(0.45 0.10 150);
  --ai-fmt-class-badge: oklch(0.52 0.14 40);
  --ai-fmt-class-badge-bg: oklch(0.52 0.14 40 / 8%);

  /* Status Window / Game UI */
  --ai-fmt-window-bg: oklch(0.97 0 0);
  --ai-fmt-window-border: oklch(0.48 0.18 264 / 18%);
  --ai-fmt-window-header-bg: oklch(0.94 0.02 264);
  --ai-fmt-window-title: oklch(0.40 0.12 264);
  --ai-fmt-window-text: oklch(0.25 0 0);
  --ai-fmt-window-dim: oklch(0.50 0 0);
  --ai-fmt-progress-bg: oklch(0.90 0 0);
  --ai-fmt-progress-fill: oklch(0.48 0.18 264);
  --ai-fmt-hp-fill: oklch(0.50 0.20 25);
  --ai-fmt-mp-fill: oklch(0.48 0.20 264);
  --ai-fmt-exp-fill: oklch(0.45 0.14 150);
  --ai-fmt-quest-active: oklch(0.50 0.14 80);
  --ai-fmt-quest-complete: oklch(0.45 0.14 150);

  /* Translator / Meta */
  --ai-fmt-tn-bg: oklch(0.96 0 0);
  --ai-fmt-tn-border: oklch(0 0 0 / 8%);
  --ai-fmt-tn-text: oklch(0.48 0 0);
  --ai-fmt-footnote: oklch(0.50 0 0);

  /* Literary */
  --ai-fmt-flashback-border: oklch(0 0 0 / 8%);
  --ai-fmt-flashback-bg: oklch(0 0 0 / 2%);
  --ai-fmt-letter-bg: oklch(0.96 0.015 55);
  --ai-fmt-letter-border: oklch(0.60 0.04 55 / 15%);
  --ai-fmt-epigraph: oklch(0.48 0 0);
  --ai-fmt-timeskip: oklch(0.50 0 0);
  --ai-fmt-poetry: oklch(0.42 0.06 264);
  --ai-fmt-scream: oklch(0.50 0.18 25);

  /* Wuxia / Xianxia / Cultivation */
  --ai-fmt-qi: oklch(0.42 0.14 200);
  --ai-fmt-qi-bg: oklch(0.42 0.14 200 / 8%);
  --ai-fmt-technique: oklch(0.50 0.14 50);
  --ai-fmt-technique-bg: oklch(0.50 0.14 50 / 8%);
  --ai-fmt-breakthrough: oklch(0.55 0.20 65);
  --ai-fmt-breakthrough-bg: oklch(0.55 0.20 65 / 8%);
  --ai-fmt-sect: oklch(0.48 0.12 300);

  /* Combat */
  --ai-fmt-crit: oklch(0.55 0.20 65);
  --ai-fmt-crit-bg: oklch(0.55 0.20 65 / 10%);
  --ai-fmt-miss: oklch(0.55 0 0);
  --ai-fmt-heal-text: oklch(0.45 0.14 150);
  --ai-fmt-combo: oklch(0.50 0.18 300);
  --ai-fmt-combo-bg: oklch(0.50 0.18 300 / 8%);
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
  --ai-fmt-system-color: oklch(0.48 0.03 55);
  --ai-fmt-system-rule: oklch(0.40 0.04 75 / 12%);
  --ai-fmt-icon-filter: brightness(0.4) sepia(0.3);

  /* Horror */
  --ai-fmt-horror-text: oklch(0.48 0.14 25);
  --ai-fmt-horror-bg: oklch(0.48 0.14 25 / 6%);
  --ai-fmt-horror-border: oklch(0.48 0.14 25 / 12%);
  --ai-fmt-whisper: oklch(0.56 0.02 55);
  --ai-fmt-glitch: oklch(0.48 0.18 25);
  --ai-fmt-corruption-bg: oklch(0.84 0.02 55);

  /* Sci-Fi */
  --ai-fmt-terminal-bg: oklch(0.86 0.02 160);
  --ai-fmt-terminal-text: oklch(0.40 0.10 160);
  --ai-fmt-terminal-border: oklch(0.40 0.10 160 / 18%);
  --ai-fmt-hologram: oklch(0.45 0.12 200);
  --ai-fmt-hologram-bg: oklch(0.45 0.12 200 / 8%);
  --ai-fmt-ai-voice: oklch(0.44 0.10 200);
  --ai-fmt-data-stream: oklch(0.42 0.10 160);

  /* Romance */
  --ai-fmt-romance: oklch(0.50 0.14 350);
  --ai-fmt-romance-bg: oklch(0.50 0.14 350 / 8%);
  --ai-fmt-blush: oklch(0.52 0.12 15);
  --ai-fmt-heartbeat: oklch(0.48 0.18 350);

  /* Mystery */
  --ai-fmt-clue: oklch(0.50 0.12 80);
  --ai-fmt-clue-bg: oklch(0.50 0.12 80 / 8%);
  --ai-fmt-evidence-border: oklch(0.50 0.12 80 / 14%);
  --ai-fmt-redacted-bg: oklch(0.20 0.02 55);
  --ai-fmt-suspect: oklch(0.50 0.10 40);

  /* Ranker / Progression / Tower */
  --ai-fmt-rank-s: oklch(0.52 0.14 65);
  --ai-fmt-rank-a: oklch(0.48 0.18 300);
  --ai-fmt-rank-b: oklch(0.48 0.14 264);
  --ai-fmt-rank-c: oklch(0.45 0.10 150);
  --ai-fmt-rank-d: oklch(0.45 0.03 55);
  --ai-fmt-rank-f: oklch(0.42 0.02 55);
  --ai-fmt-floor-bg: oklch(0.86 0.02 264);
  --ai-fmt-floor-border: oklch(0.48 0.14 264 / 14%);
  --ai-fmt-skill-active: oklch(0.48 0.14 264);
  --ai-fmt-skill-passive: oklch(0.45 0.08 150);
  --ai-fmt-class-badge: oklch(0.52 0.10 40);
  --ai-fmt-class-badge-bg: oklch(0.52 0.10 40 / 8%);

  /* Status Window / Game UI */
  --ai-fmt-window-bg: oklch(0.87 0.02 75);
  --ai-fmt-window-border: oklch(0.48 0.10 264 / 15%);
  --ai-fmt-window-header-bg: oklch(0.84 0.03 75);
  --ai-fmt-window-title: oklch(0.42 0.08 264);
  --ai-fmt-window-text: oklch(0.28 0.02 55);
  --ai-fmt-window-dim: oklch(0.50 0.03 55);
  --ai-fmt-progress-bg: oklch(0.82 0.02 55);
  --ai-fmt-progress-fill: oklch(0.48 0.14 264);
  --ai-fmt-hp-fill: oklch(0.48 0.16 25);
  --ai-fmt-mp-fill: oklch(0.45 0.16 264);
  --ai-fmt-exp-fill: oklch(0.45 0.10 150);
  --ai-fmt-quest-active: oklch(0.50 0.10 80);
  --ai-fmt-quest-complete: oklch(0.45 0.10 150);

  /* Translator / Meta */
  --ai-fmt-tn-bg: oklch(0.86 0.02 75);
  --ai-fmt-tn-border: oklch(0.40 0.04 75 / 12%);
  --ai-fmt-tn-text: oklch(0.50 0.03 55);
  --ai-fmt-footnote: oklch(0.50 0.03 55);

  /* Literary */
  --ai-fmt-flashback-border: oklch(0.40 0.04 75 / 12%);
  --ai-fmt-flashback-bg: oklch(0.40 0.04 75 / 4%);
  --ai-fmt-letter-bg: oklch(0.86 0.03 65);
  --ai-fmt-letter-border: oklch(0.50 0.05 55 / 15%);
  --ai-fmt-epigraph: oklch(0.48 0.03 55);
  --ai-fmt-timeskip: oklch(0.50 0.03 55);
  --ai-fmt-poetry: oklch(0.45 0.06 264);
  --ai-fmt-scream: oklch(0.48 0.14 25);

  /* Wuxia / Xianxia / Cultivation */
  --ai-fmt-qi: oklch(0.42 0.12 200);
  --ai-fmt-qi-bg: oklch(0.42 0.12 200 / 8%);
  --ai-fmt-technique: oklch(0.50 0.10 50);
  --ai-fmt-technique-bg: oklch(0.50 0.10 50 / 8%);
  --ai-fmt-breakthrough: oklch(0.52 0.16 65);
  --ai-fmt-breakthrough-bg: oklch(0.52 0.16 65 / 8%);
  --ai-fmt-sect: oklch(0.48 0.10 300);

  /* Combat */
  --ai-fmt-crit: oklch(0.52 0.16 65);
  --ai-fmt-crit-bg: oklch(0.52 0.16 65 / 8%);
  --ai-fmt-miss: oklch(0.52 0.02 55);
  --ai-fmt-heal-text: oklch(0.45 0.10 150);
  --ai-fmt-combo: oklch(0.48 0.14 300);
  --ai-fmt-combo-bg: oklch(0.48 0.14 300 / 8%);
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

/* New icons */
.ai-fmt-icon-ghost::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M9 10h.01'/%3E%3Cpath d='M15 10h.01'/%3E%3Cpath d='M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-moon::before    { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-sun::before     { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='4'/%3E%3Cpath d='M12 2v2'/%3E%3Cpath d='M12 20v2'/%3E%3Cpath d='m4.93 4.93 1.41 1.41'/%3E%3Cpath d='m17.66 17.66 1.41 1.41'/%3E%3Cpath d='M2 12h2'/%3E%3Cpath d='M20 12h2'/%3E%3Cpath d='m6.34 17.66-1.41 1.41'/%3E%3Cpath d='m19.07 4.93-1.41 1.41'/%3E%3C/svg%3E"); }
.ai-fmt-icon-lock::before    { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Crect width='18' height='11' x='3' y='11' rx='2' ry='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 10 0v4'/%3E%3C/svg%3E"); }
.ai-fmt-icon-unlock::before  { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Crect width='18' height='11' x='3' y='11' rx='2' ry='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 9.9-1'/%3E%3C/svg%3E"); }
.ai-fmt-icon-alert::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'/%3E%3Cpath d='M12 9v4'/%3E%3Cpath d='M12 17h.01'/%3E%3C/svg%3E"); }
.ai-fmt-icon-clock::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 6v6l4 2'/%3E%3C/svg%3E"); }
.ai-fmt-icon-map::before     { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z'/%3E%3Cpath d='M15 5.764v15'/%3E%3Cpath d='M9 3.236v15'/%3E%3C/svg%3E"); }
.ai-fmt-icon-potion::before  { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M10 2v6.292a1 1 0 0 1-.175.565L4.43 16.78A3 3 0 0 0 6.963 22h10.074a3 3 0 0 0 2.533-5.22l-5.395-7.923A1 1 0 0 1 14 8.292V2'/%3E%3Cpath d='M8.5 2h7'/%3E%3Cpath d='M7 16.5h10'/%3E%3C/svg%3E"); }
.ai-fmt-icon-music::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E"); }
.ai-fmt-icon-search::before  { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E"); }
.ai-fmt-icon-wind::before    { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2'/%3E%3Cpath d='M9.6 4.6A2 2 0 1 1 11 8H2'/%3E%3Cpath d='M12.6 19.4A2 2 0 1 0 14 16H2'/%3E%3C/svg%3E"); }
.ai-fmt-icon-droplet::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-mountain::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m8 3 4 8 5-5 5 15H2L8 3z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-terminal::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m4 17 6-6-6-6'/%3E%3Cpath d='M12 19h8'/%3E%3C/svg%3E"); }
.ai-fmt-icon-fingerprint::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4'/%3E%3Cpath d='M14 13.12c0 2.38 0 6.38-1 8.88'/%3E%3Cpath d='M17.29 21.02c.12-.6.43-2.3.5-3.02'/%3E%3Cpath d='M2 12a10 10 0 0 1 18-6'/%3E%3Cpath d='M2 16h.01'/%3E%3Cpath d='M21.8 16c.2-2 .131-5.354 0-6'/%3E%3Cpath d='M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2'/%3E%3Cpath d='M8.65 22c.21-.66.45-1.32.57-2'/%3E%3Cpath d='M9 6.8a6 6 0 0 1 9 5.2v2'/%3E%3C/svg%3E"); }
.ai-fmt-icon-layers::before  { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z'/%3E%3Cpath d='m22.54 12.43-1.96-.89-8.58 3.9a2 2 0 0 1-1.66 0L2.16 11.54l-1.96.89a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z'/%3E%3C/svg%3E"); }
.ai-fmt-icon-coins::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='8' cy='8' r='6'/%3E%3Cpath d='M18.09 10.37A6 6 0 1 1 10.34 18'/%3E%3Cpath d='M7 6h1v4'/%3E%3Cpath d='m16.71 13.88.7.71-2.82 2.82'/%3E%3C/svg%3E"); }
.ai-fmt-icon-swords::before  { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M14.5 17.5 3 6V3h3l11.5 11.5'/%3E%3Cpath d='M13 19l6-6'/%3E%3Cpath d='m16 16 3.5 3.5'/%3E%3Cpath d='m19 21-2-2'/%3E%3Cpath d='M9.5 6.5 21 18v3h-3L6.5 9.5'/%3E%3Cpath d='M11 5l-6 6'/%3E%3Cpath d='m8 8-3.5-3.5'/%3E%3Cpath d='m5 3 2 2'/%3E%3C/svg%3E"); }
.ai-fmt-icon-hourglass::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M5 22h14'/%3E%3Cpath d='M5 2h14'/%3E%3Cpath d='M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22'/%3E%3Cpath d='M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2'/%3E%3C/svg%3E"); }
.ai-fmt-icon-compass::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpolygon points='16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76'/%3E%3C/svg%3E"); }
.ai-fmt-icon-feather::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z'/%3E%3Cpath d='M16 8 2 22'/%3E%3Cpath d='M17.5 15H9'/%3E%3C/svg%3E"); }
.ai-fmt-icon-radio::before   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M4.9 19.1C1 15.2 1 8.8 4.9 4.9'/%3E%3Cpath d='M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4'/%3E%3Ccircle cx='12' cy='12' r='2'/%3E%3Cpath d='M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4'/%3E%3Cpath d='M19.1 4.9C23 8.8 23 15.1 19.1 19'/%3E%3C/svg%3E"); }

/* ── Column break fix ────────────────────────────────────── */
.ai-fmt-stat-block,
.ai-fmt-system-msg,
.ai-fmt-item-card,
.ai-fmt-thought,
.ai-fmt-window,
.ai-fmt-terminal,
.ai-fmt-evidence-card,
.ai-fmt-letter-block,
.ai-fmt-flashback,
.ai-fmt-epigraph-block,
.ai-fmt-tn-block,
.ai-fmt-quest-card,
.ai-fmt-cultivation-stage,
.ai-fmt-combat-log {
  -webkit-column-break-inside: avoid;
  page-break-inside: avoid;
  break-inside: avoid;
  overflow: hidden;
}

/* ── Adjacent block collision mitigation ─────────────────────
 * When multiple block-level formatted elements end up stacked
 * (despite AI guidance to avoid this), these rules:
 * 1. Collapse excess vertical margin between them
 * 2. Visually merge adjacent cards/windows into a grouped feel
 * 3. Remove redundant borders at touching edges
 *
 * Selectors target all block-level ai-fmt elements. The AI is
 * instructed to avoid stacking blocks, but this is the fallback.
 * ──────────────────────────────────────────────────────────── */

/* Define the set of block-level elements once via a shared class behavior */
.ai-fmt-stat-block,
.ai-fmt-system-msg,
.ai-fmt-item-card,
.ai-fmt-window,
.ai-fmt-terminal,
.ai-fmt-evidence-card,
.ai-fmt-letter-block,
.ai-fmt-flashback,
.ai-fmt-epigraph-block,
.ai-fmt-tn-block,
.ai-fmt-quest-card,
.ai-fmt-combat-log,
.ai-fmt-notification,
.ai-fmt-location-card,
.ai-fmt-lore-block,
.ai-fmt-corruption,
.ai-fmt-transmission,
.ai-fmt-creepy-note,
.ai-fmt-thought,
.ai-fmt-emotional,
.ai-fmt-case-note,
.ai-fmt-breakthrough,
.ai-fmt-insight,
.ai-fmt-dream,
.ai-fmt-prophecy,
.ai-fmt-poetry,
.ai-fmt-editor-note,
.ai-fmt-author-note {
  /* Ensure consistent base margins for adjacency rules to work */
}

/* When any block element directly follows another block element,
   collapse the gap to avoid the "wall of boxes" look */
.ai-fmt-stat-block + .ai-fmt-stat-block,
.ai-fmt-stat-block + .ai-fmt-item-card,
.ai-fmt-stat-block + .ai-fmt-window,
.ai-fmt-item-card + .ai-fmt-item-card,
.ai-fmt-item-card + .ai-fmt-stat-block,
.ai-fmt-window + .ai-fmt-window,
.ai-fmt-window + .ai-fmt-stat-block,
.ai-fmt-notification + .ai-fmt-notification,
.ai-fmt-quest-card + .ai-fmt-quest-card,
.ai-fmt-evidence-card + .ai-fmt-evidence-card,
.ai-fmt-combat-log + .ai-fmt-combat-log,
.ai-fmt-lore-block + .ai-fmt-lore-block,
.ai-fmt-location-card + .ai-fmt-location-card,
.ai-fmt-footnote + .ai-fmt-footnote {
  margin-top: 1px;
}

/* Same-type bordered blocks: remove top border + flatten top radius
   so they visually merge into one continuous panel */
.ai-fmt-item-card + .ai-fmt-item-card,
.ai-fmt-notification + .ai-fmt-notification,
.ai-fmt-quest-card + .ai-fmt-quest-card,
.ai-fmt-evidence-card + .ai-fmt-evidence-card,
.ai-fmt-location-card + .ai-fmt-location-card,
.ai-fmt-lore-block + .ai-fmt-lore-block {
  border-top-color: transparent;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

/* And round off the bottom of the preceding card in a merged stack */
.ai-fmt-item-card:has(+ .ai-fmt-item-card),
.ai-fmt-notification:has(+ .ai-fmt-notification),
.ai-fmt-quest-card:has(+ .ai-fmt-quest-card),
.ai-fmt-evidence-card:has(+ .ai-fmt-evidence-card),
.ai-fmt-location-card:has(+ .ai-fmt-location-card),
.ai-fmt-lore-block:has(+ .ai-fmt-lore-block) {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  margin-bottom: 0;
}

/* System messages stacked: collapse into a single ruled section */
.ai-fmt-system-msg + .ai-fmt-system-msg {
  border-top: none;
  margin-top: 0;
  padding-top: 4px;
}

/* Mixed block types adjacent: tighter margin, subtle separator */
.ai-fmt-system-msg + .ai-fmt-stat-block,
.ai-fmt-system-msg + .ai-fmt-window,
.ai-fmt-system-msg + .ai-fmt-item-card,
.ai-fmt-system-msg + .ai-fmt-notification,
.ai-fmt-system-msg + .ai-fmt-quest-card,
.ai-fmt-stat-block + .ai-fmt-system-msg,
.ai-fmt-window + .ai-fmt-system-msg,
.ai-fmt-window + .ai-fmt-notification,
.ai-fmt-window + .ai-fmt-item-card,
.ai-fmt-notification + .ai-fmt-system-msg,
.ai-fmt-notification + .ai-fmt-quest-card,
.ai-fmt-notification + .ai-fmt-item-card,
.ai-fmt-notification + .ai-fmt-stat-block,
.ai-fmt-notification + .ai-fmt-window,
.ai-fmt-quest-card + .ai-fmt-notification,
.ai-fmt-quest-card + .ai-fmt-item-card,
.ai-fmt-quest-card + .ai-fmt-system-msg,
.ai-fmt-combat-log + .ai-fmt-system-msg,
.ai-fmt-combat-log + .ai-fmt-stat-block,
.ai-fmt-combat-log + .ai-fmt-notification,
.ai-fmt-combat-log + .ai-fmt-item-card,
.ai-fmt-breakthrough + .ai-fmt-system-msg,
.ai-fmt-breakthrough + .ai-fmt-stat-block,
.ai-fmt-breakthrough + .ai-fmt-window,
.ai-fmt-breakthrough + .ai-fmt-notification {
  margin-top: 2px;
}

/* Thought blocks and literary blocks stacked: merge borders */
.ai-fmt-thought + .ai-fmt-thought,
.ai-fmt-flashback + .ai-fmt-flashback,
.ai-fmt-dream + .ai-fmt-dream,
.ai-fmt-insight + .ai-fmt-insight,
.ai-fmt-emotional + .ai-fmt-emotional {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

/* TN/editor/author note blocks stacked: merge into one notes section */
.ai-fmt-tn-block + .ai-fmt-tn-block,
.ai-fmt-tn-block + .ai-fmt-editor-note,
.ai-fmt-tn-block + .ai-fmt-author-note,
.ai-fmt-editor-note + .ai-fmt-tn-block,
.ai-fmt-editor-note + .ai-fmt-editor-note,
.ai-fmt-editor-note + .ai-fmt-author-note,
.ai-fmt-author-note + .ai-fmt-tn-block,
.ai-fmt-author-note + .ai-fmt-editor-note,
.ai-fmt-author-note + .ai-fmt-author-note {
  margin-top: 1px;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.ai-fmt-tn-block:has(+ .ai-fmt-tn-block),
.ai-fmt-tn-block:has(+ .ai-fmt-editor-note),
.ai-fmt-tn-block:has(+ .ai-fmt-author-note),
.ai-fmt-editor-note:has(+ .ai-fmt-tn-block),
.ai-fmt-editor-note:has(+ .ai-fmt-editor-note),
.ai-fmt-editor-note:has(+ .ai-fmt-author-note),
.ai-fmt-author-note:has(+ .ai-fmt-tn-block),
.ai-fmt-author-note:has(+ .ai-fmt-editor-note),
.ai-fmt-author-note:has(+ .ai-fmt-author-note) {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  margin-bottom: 0;
}

/* ════════════════════════════════════════════════════════════
   CORE — Stat Block, System Msg, XP Badge, Item Card,
   Dialogue, Thought, SFX, Reveal (unchanged from original)
   ════════════════════════════════════════════════════════════ */

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

/* ── System Message — centered announcement block ─────────── */
.ai-fmt-system-msg {
  display: block;
  text-align: center;
  padding: 6px 16px;
  margin: 8px 0;
  font-size: 0.82em;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ai-fmt-system-color);
  border-top: 1px solid var(--ai-fmt-system-rule);
  border-bottom: 1px solid var(--ai-fmt-system-rule);
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
.ai-fmt-rarity-mythic    { color: oklch(0.65 0.20 350); }

/* ── Status Effect Badges — tiny inline pills ────────────── */
.ai-fmt-status-badge {
  display: inline-block;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.82em;
  font-weight: 500;
  margin: 1px 2px 1px 0;
  white-space: nowrap;
}

.ai-fmt-status-buff {
  background: var(--ai-fmt-buff-bg);
  color: var(--ai-fmt-buff);
}

.ai-fmt-status-debuff {
  background: var(--ai-fmt-debuff-bg);
  color: var(--ai-fmt-debuff);
}

.ai-fmt-status-neutral {
  background: var(--ai-fmt-accent-dim);
  color: var(--ai-fmt-text-dim);
}

.ai-fmt-status-immune {
  background: oklch(0.60 0.12 264 / 10%);
  color: oklch(0.60 0.12 264);
}

/* ── Dialogue Tags — tiny colored pill before the quote ────── */
.ai-fmt-dialogue-villain,
.ai-fmt-dialogue-divine,
.ai-fmt-dialogue-hero,
.ai-fmt-dialogue-npc,
.ai-fmt-dialogue-narrator,
.ai-fmt-dialogue-monster,
.ai-fmt-dialogue-ai {
  display: inline;
  font-size: 0.7em;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 4px;
  padding: 1px 5px;
  margin-right: 4px;
  vertical-align: middle;
}

.ai-fmt-dialogue-villain {
  background: var(--ai-fmt-debuff-bg);
  color: var(--ai-fmt-villain);
}

.ai-fmt-dialogue-divine {
  background: oklch(0.78 0.12 80 / 12%);
  color: var(--ai-fmt-divine);
}

.ai-fmt-dialogue-hero {
  background: var(--ai-fmt-accent-dim);
  color: var(--ai-fmt-hero);
}

.ai-fmt-dialogue-npc {
  background: oklch(0.65 0.10 150 / 10%);
  color: oklch(0.60 0.10 150);
}

.ai-fmt-dialogue-narrator {
  background: oklch(0.55 0 0 / 8%);
  color: var(--ai-fmt-text-dim);
  font-style: italic;
}

.ai-fmt-dialogue-monster {
  background: oklch(0.60 0.18 25 / 10%);
  color: oklch(0.62 0.18 25);
}

.ai-fmt-dialogue-ai {
  background: var(--ai-fmt-hologram-bg);
  color: var(--ai-fmt-ai-voice);
  font-family: monospace;
}

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


/* ════════════════════════════════════════════════════════════
   HORROR / THRILLER
   ════════════════════════════════════════════════════════════ */

/* Whisper — faint, small, eerie text */
.ai-fmt-whisper {
  font-size: 0.82em;
  color: var(--ai-fmt-whisper);
  font-style: italic;
  letter-spacing: 0.08em;
}

/* Scream — big, bold, alarming */
.ai-fmt-scream {
  font-weight: 800;
  font-size: 1.15em;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ai-fmt-scream);
}

/* Glitch — corrupted / unstable text */
.ai-fmt-glitch {
  color: var(--ai-fmt-glitch);
  text-decoration: line-through;
  text-decoration-style: wavy;
  text-decoration-color: var(--ai-fmt-glitch);
  font-family: monospace;
  letter-spacing: 0.02em;
}

/* Corruption block — dark background, distorted text area */
.ai-fmt-corruption {
  background: var(--ai-fmt-corruption-bg);
  border-left: 3px solid var(--ai-fmt-horror-border);
  padding: 6px 10px;
  margin: 6px 0;
  font-family: monospace;
  font-size: 0.88em;
  color: var(--ai-fmt-horror-text);
  border-radius: 4px;
}

/* Dread — ominous emphasis inline */
.ai-fmt-dread {
  color: var(--ai-fmt-horror-text);
  font-weight: 600;
  font-style: italic;
}

/* Horror system message variant */
.ai-fmt-system-msg.ai-fmt-system-horror {
  color: var(--ai-fmt-horror-text);
  border-color: var(--ai-fmt-horror-border);
}

/* Creepy note / journal entry */
.ai-fmt-creepy-note {
  background: var(--ai-fmt-horror-bg);
  border: 1px solid var(--ai-fmt-horror-border);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 4px 0;
  font-style: italic;
  font-size: 0.9em;
  color: var(--ai-fmt-horror-text);
}


/* ════════════════════════════════════════════════════════════
   SCI-FI / CYBERPUNK
   ════════════════════════════════════════════════════════════ */

/* Terminal / console output block */
.ai-fmt-terminal {
  background: var(--ai-fmt-terminal-bg);
  border: 1px solid var(--ai-fmt-terminal-border);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 6px 0;
  font-family: monospace;
  font-size: 0.85em;
  color: var(--ai-fmt-terminal-text);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Terminal prompt line */
.ai-fmt-terminal-prompt {
  color: var(--ai-fmt-terminal-text);
  opacity: 0.6;
  font-family: monospace;
}

/* Hologram text — glowy inline */
.ai-fmt-hologram {
  color: var(--ai-fmt-hologram);
  background: var(--ai-fmt-hologram-bg);
  padding: 0 4px;
  border-radius: 3px;
  font-weight: 500;
}

/* Data stream / readout inline */
.ai-fmt-data-stream {
  font-family: monospace;
  font-size: 0.88em;
  color: var(--ai-fmt-data-stream);
  letter-spacing: 0.04em;
}

/* AI voice / machine dialogue */
.ai-fmt-ai-voice {
  font-family: monospace;
  color: var(--ai-fmt-ai-voice);
  font-weight: 500;
}

/* Transmission / signal block */
.ai-fmt-transmission {
  border: 1px dashed var(--ai-fmt-terminal-border);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 6px 0;
  font-family: monospace;
  font-size: 0.85em;
  color: var(--ai-fmt-terminal-text);
  text-align: center;
}

/* Coordinates / tech readout */
.ai-fmt-coordinates {
  font-family: monospace;
  font-size: 0.84em;
  color: var(--ai-fmt-terminal-text);
  font-variant-numeric: tabular-nums;
  background: var(--ai-fmt-terminal-bg);
  padding: 0 4px;
  border-radius: 3px;
}


/* ════════════════════════════════════════════════════════════
   ROMANCE
   ════════════════════════════════════════════════════════════ */

/* Heartbeat — emotional emphasis inline */
.ai-fmt-heartbeat {
  color: var(--ai-fmt-heartbeat);
  font-weight: 600;
  font-style: italic;
}

/* Blush / flustered text */
.ai-fmt-blush {
  color: var(--ai-fmt-blush);
  font-style: italic;
}

/* Emotional moment — background highlight block */
.ai-fmt-emotional {
  background: var(--ai-fmt-romance-bg);
  border-left: 2px solid var(--ai-fmt-romance);
  padding: 4px 10px;
  margin: 4px 0;
  font-style: italic;
  color: var(--ai-fmt-text);
}

/* Love interest dialogue tag */
.ai-fmt-dialogue-love {
  display: inline;
  font-size: 0.7em;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 4px;
  padding: 1px 5px;
  margin-right: 4px;
  vertical-align: middle;
  background: var(--ai-fmt-romance-bg);
  color: var(--ai-fmt-romance);
}

/* Inner flutter / butterflies */
.ai-fmt-flutter {
  color: var(--ai-fmt-romance);
  font-style: italic;
  font-size: 0.92em;
}


/* ════════════════════════════════════════════════════════════
   MYSTERY / DETECTIVE
   ════════════════════════════════════════════════════════════ */

/* Clue highlight — inline emphasis */
.ai-fmt-clue {
  background: var(--ai-fmt-clue-bg);
  color: var(--ai-fmt-clue);
  padding: 0 4px;
  border-radius: 3px;
  font-weight: 600;
}

/* Evidence card — block for presenting evidence */
.ai-fmt-evidence-card {
  background: var(--ai-fmt-card-bg);
  border: 1px solid var(--ai-fmt-evidence-border);
  border-left: 3px solid var(--ai-fmt-clue);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 4px 0;
  font-size: 0.9em;
}

.ai-fmt-evidence-label {
  font-size: 0.78em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ai-fmt-clue);
  margin-bottom: 2px;
}

/* Redacted text */
.ai-fmt-redacted {
  background: var(--ai-fmt-redacted-bg);
  color: var(--ai-fmt-redacted-bg);
  padding: 0 4px;
  border-radius: 2px;
  user-select: none;
}

/* Suspect inline tag */
.ai-fmt-suspect {
  font-weight: 600;
  color: var(--ai-fmt-suspect);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
}

/* Case file / deduction block */
.ai-fmt-case-note {
  background: var(--ai-fmt-clue-bg);
  border: 1px solid var(--ai-fmt-evidence-border);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 4px 0;
  font-size: 0.88em;
  font-style: italic;
}


/* ════════════════════════════════════════════════════════════
   RANKER / PROGRESSION / TOWER
   ════════════════════════════════════════════════════════════ */

/* Rank badges — S through F */
.ai-fmt-rank-badge {
  display: inline-block;
  border-radius: 4px;
  padding: 1px 7px;
  font-size: 0.82em;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.ai-fmt-rank-s  { background: oklch(0.72 0.16 65 / 14%); color: var(--ai-fmt-rank-s); }
.ai-fmt-rank-a  { background: oklch(0.65 0.22 300 / 12%); color: var(--ai-fmt-rank-a); }
.ai-fmt-rank-b  { background: oklch(0.60 0.18 264 / 12%); color: var(--ai-fmt-rank-b); }
.ai-fmt-rank-c  { background: oklch(0.65 0.14 150 / 10%); color: var(--ai-fmt-rank-c); }
.ai-fmt-rank-d  { background: oklch(0.50 0 0 / 10%); color: var(--ai-fmt-rank-d); }
.ai-fmt-rank-f  { background: oklch(0.40 0 0 / 10%); color: var(--ai-fmt-rank-f); }
.ai-fmt-rank-ss { background: oklch(0.78 0.20 65 / 16%); color: oklch(0.78 0.20 65); font-weight: 800; }
.ai-fmt-rank-sss { background: oklch(0.82 0.22 65 / 18%); color: oklch(0.82 0.22 65); font-weight: 800; }
.ai-fmt-rank-e  { background: oklch(0.45 0 0 / 10%); color: oklch(0.45 0 0); }

/* Floor / level indicator */
.ai-fmt-floor-badge {
  display: inline-block;
  background: var(--ai-fmt-floor-bg);
  border: 1px solid var(--ai-fmt-floor-border);
  border-radius: 4px;
  padding: 1px 7px;
  font-size: 0.82em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ai-fmt-accent);
}

/* Skill tag — active vs passive */
.ai-fmt-skill-tag {
  display: inline-block;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.82em;
  font-weight: 600;
  white-space: nowrap;
  margin: 1px 2px 1px 0;
}

.ai-fmt-skill-active {
  background: oklch(0.60 0.18 264 / 10%);
  color: var(--ai-fmt-skill-active);
}

.ai-fmt-skill-passive {
  background: oklch(0.55 0.10 150 / 10%);
  color: var(--ai-fmt-skill-passive);
}

.ai-fmt-skill-ultimate {
  background: oklch(0.72 0.16 65 / 12%);
  color: oklch(0.72 0.16 65);
  font-weight: 700;
}

/* Class / job badge */
.ai-fmt-class-badge {
  display: inline-block;
  background: var(--ai-fmt-class-badge-bg);
  color: var(--ai-fmt-class-badge);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.82em;
  font-weight: 600;
  white-space: nowrap;
}

/* Title / achievement badge */
.ai-fmt-title-badge {
  display: inline-block;
  background: oklch(0.72 0.16 65 / 10%);
  color: oklch(0.72 0.16 65);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.82em;
  font-weight: 600;
  white-space: nowrap;
}

/* Dungeon / gate name inline */
.ai-fmt-dungeon-name {
  font-weight: 700;
  color: var(--ai-fmt-accent);
}

/* Penalty / death message variant */
.ai-fmt-system-msg.ai-fmt-system-danger {
  color: var(--ai-fmt-debuff);
  border-color: var(--ai-fmt-debuff-bg);
}

/* Success / reward message variant */
.ai-fmt-system-msg.ai-fmt-system-success {
  color: var(--ai-fmt-buff);
  border-color: var(--ai-fmt-buff-bg);
}

/* Warning message variant */
.ai-fmt-system-msg.ai-fmt-system-warning {
  color: var(--ai-fmt-clue);
  border-color: oklch(0.72 0.16 80 / 12%);
}

/* Level up / rank up message variant */
.ai-fmt-system-msg.ai-fmt-system-levelup {
  color: var(--ai-fmt-rank-s);
  border-color: oklch(0.72 0.16 65 / 15%);
}


/* ════════════════════════════════════════════════════════════
   STATUS WINDOW / GAME UI PANELS
   ════════════════════════════════════════════════════════════ */

/* Main window container */
.ai-fmt-window {
  background: var(--ai-fmt-window-bg);
  border: 1px solid var(--ai-fmt-window-border);
  border-radius: 8px;
  margin: 8px 0;
  overflow: hidden;
  font-size: 0.88em;
}

/* Window title bar */
.ai-fmt-window-header {
  background: var(--ai-fmt-window-header-bg);
  padding: 5px 12px;
  font-size: 0.82em;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ai-fmt-window-title);
  border-bottom: 1px solid var(--ai-fmt-window-border);
}

/* Window body */
.ai-fmt-window-body {
  padding: 8px 12px;
  color: var(--ai-fmt-window-text);
}

/* Window rows — like stat block but inside a window */
.ai-fmt-window-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}

.ai-fmt-window-label {
  color: var(--ai-fmt-window-dim);
  font-size: 0.9em;
}

.ai-fmt-window-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ai-fmt-window-text);
}

/* Progress bars (HP, MP, EXP, generic) */
.ai-fmt-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.ai-fmt-progress-bar {
  flex: 1;
  height: 6px;
  background: var(--ai-fmt-progress-bg);
  border-radius: 3px;
  overflow: hidden;
}

.ai-fmt-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--ai-fmt-progress-fill);
}

.ai-fmt-progress-fill.ai-fmt-hp { background: var(--ai-fmt-hp-fill); }
.ai-fmt-progress-fill.ai-fmt-mp { background: var(--ai-fmt-mp-fill); }
.ai-fmt-progress-fill.ai-fmt-exp { background: var(--ai-fmt-exp-fill); }

.ai-fmt-progress-text {
  font-size: 0.82em;
  font-variant-numeric: tabular-nums;
  color: var(--ai-fmt-window-dim);
  white-space: nowrap;
  min-width: 55px;
  text-align: right;
}

/* Window separator */
.ai-fmt-window-divider {
  border: none;
  border-top: 1px solid var(--ai-fmt-window-border);
  margin: 4px 0;
}

/* Quest card */
.ai-fmt-quest-card {
  background: var(--ai-fmt-card-bg);
  border: 1px solid var(--ai-fmt-card-border);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 4px 0;
  font-size: 0.9em;
}

.ai-fmt-quest-title {
  font-weight: 600;
  color: var(--ai-fmt-quest-active);
}

.ai-fmt-quest-title.ai-fmt-quest-done {
  color: var(--ai-fmt-quest-complete);
  text-decoration: line-through;
}

.ai-fmt-quest-objective {
  font-size: 0.88em;
  color: var(--ai-fmt-window-dim);
  padding-left: 8px;
}

.ai-fmt-quest-reward {
  font-size: 0.85em;
  color: var(--ai-fmt-rank-s);
  font-weight: 500;
}

/* Notification popup — smaller system msg with left accent */
.ai-fmt-notification {
  display: block;
  background: var(--ai-fmt-card-bg);
  border: 1px solid var(--ai-fmt-card-border);
  border-left: 3px solid var(--ai-fmt-accent);
  border-radius: 8px;
  padding: 5px 10px;
  margin: 4px 0;
  font-size: 0.85em;
}

.ai-fmt-notification.ai-fmt-notif-danger {
  border-left-color: var(--ai-fmt-debuff);
}

.ai-fmt-notification.ai-fmt-notif-success {
  border-left-color: var(--ai-fmt-buff);
}

.ai-fmt-notification.ai-fmt-notif-warning {
  border-left-color: var(--ai-fmt-clue);
}

/* Inventory slot inline */
.ai-fmt-inventory-slot {
  display: inline-block;
  background: var(--ai-fmt-card-bg);
  border: 1px solid var(--ai-fmt-card-border);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.88em;
  margin: 1px 2px;
}

/* Countdown / timer inline */
.ai-fmt-timer {
  font-family: monospace;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ai-fmt-debuff);
  font-size: 0.92em;
}


/* ════════════════════════════════════════════════════════════
   COMBAT / ACTION
   ════════════════════════════════════════════════════════════ */

/* Critical hit inline */
.ai-fmt-crit {
  background: var(--ai-fmt-crit-bg);
  color: var(--ai-fmt-crit);
  font-weight: 800;
  padding: 0 4px;
  border-radius: 3px;
  font-variant-numeric: tabular-nums;
}

/* Miss / evade inline */
.ai-fmt-miss {
  color: var(--ai-fmt-miss);
  font-style: italic;
  text-decoration: line-through;
}

/* Heal number inline */
.ai-fmt-heal {
  color: var(--ai-fmt-heal-text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Damage number inline */
.ai-fmt-damage {
  color: var(--ai-fmt-debuff);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Combo / chain inline */
.ai-fmt-combo {
  background: var(--ai-fmt-combo-bg);
  color: var(--ai-fmt-combo);
  font-weight: 700;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 0.9em;
}

/* Combat log — block for battle sequences */
.ai-fmt-combat-log {
  background: var(--ai-fmt-card-bg);
  border: 1px solid var(--ai-fmt-card-border);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 6px 0;
  font-size: 0.88em;
}

/* Skill activation inline */
.ai-fmt-skill-activate {
  color: var(--ai-fmt-accent);
  font-weight: 700;
}


/* ════════════════════════════════════════════════════════════
   WUXIA / XIANXIA / CULTIVATION
   ════════════════════════════════════════════════════════════ */

/* Qi / energy inline */
.ai-fmt-qi {
  background: var(--ai-fmt-qi-bg);
  color: var(--ai-fmt-qi);
  padding: 0 4px;
  border-radius: 3px;
  font-weight: 600;
}

/* Martial technique name inline */
.ai-fmt-technique {
  background: var(--ai-fmt-technique-bg);
  color: var(--ai-fmt-technique);
  padding: 0 4px;
  border-radius: 3px;
  font-weight: 700;
  font-style: italic;
}

/* Breakthrough announcement */
.ai-fmt-breakthrough {
  display: block;
  text-align: center;
  padding: 6px 16px;
  margin: 8px 0;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ai-fmt-breakthrough);
  background: var(--ai-fmt-breakthrough-bg);
  border-radius: 8px;
}

/* Cultivation stage / realm badge */
.ai-fmt-cultivation-stage {
  display: inline-block;
  background: var(--ai-fmt-qi-bg);
  border: 1px solid oklch(0.65 0.16 200 / 15%);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.85em;
  font-weight: 600;
  color: var(--ai-fmt-qi);
}

/* Sect / clan name inline */
.ai-fmt-sect {
  font-weight: 700;
  color: var(--ai-fmt-sect);
}

/* Dao comprehension / insight */
.ai-fmt-insight {
  font-style: italic;
  color: var(--ai-fmt-divine);
  border-left: 2px solid oklch(0.78 0.12 80 / 15%);
  padding-left: 8px;
  margin: 2px 0;
}


/* ════════════════════════════════════════════════════════════
   LITERARY / GENERAL FICTION
   ════════════════════════════════════════════════════════════ */

/* Flashback block */
.ai-fmt-flashback {
  background: var(--ai-fmt-flashback-bg);
  border-left: 2px solid var(--ai-fmt-flashback-border);
  padding: 4px 10px;
  margin: 6px 0;
  font-style: italic;
  color: var(--ai-fmt-text-dim);
}

/* Letter / note block */
.ai-fmt-letter-block {
  background: var(--ai-fmt-letter-bg);
  border: 1px solid var(--ai-fmt-letter-border);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 6px 0;
  font-style: italic;
  font-size: 0.92em;
}

/* Epigraph / chapter quote */
.ai-fmt-epigraph-block {
  text-align: center;
  padding: 6px 20px;
  margin: 8px 0;
  font-style: italic;
  color: var(--ai-fmt-epigraph);
  font-size: 0.9em;
}

.ai-fmt-epigraph-source {
  display: block;
  font-size: 0.85em;
  margin-top: 4px;
  color: var(--ai-fmt-text-dim);
  font-style: normal;
}

/* Time skip / scene break marker */
.ai-fmt-timeskip {
  display: block;
  text-align: center;
  padding: 8px 0;
  margin: 6px 0;
  font-size: 0.82em;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--ai-fmt-timeskip);
}

/* Chapter heading */
.ai-fmt-chapter-heading {
  display: block;
  text-align: center;
  font-size: 1.1em;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ai-fmt-text);
  padding: 8px 0;
  margin: 8px 0;
  border-bottom: 1px solid var(--ai-fmt-system-rule);
}

/* Poetry / verse block */
.ai-fmt-poetry {
  padding-left: 16px;
  margin: 6px 0;
  font-style: italic;
  color: var(--ai-fmt-poetry);
  line-height: 1.6;
}

/* Song / chant inline */
.ai-fmt-song {
  font-style: italic;
  color: var(--ai-fmt-poetry);
}

/* Emphasis / dramatic moment inline */
.ai-fmt-dramatic {
  font-weight: 700;
  color: var(--ai-fmt-text);
}

/* Foreign / untranslated word inline */
.ai-fmt-foreign {
  font-style: italic;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
  color: var(--ai-fmt-text);
}

/* Memory / recall — similar to flashback but inline */
.ai-fmt-memory {
  font-style: italic;
  color: var(--ai-fmt-text-dim);
  opacity: 0.85;
}

/* Prophecy / foreshadowing block */
.ai-fmt-prophecy {
  text-align: center;
  padding: 6px 16px;
  margin: 8px 0;
  font-style: italic;
  font-weight: 500;
  color: var(--ai-fmt-divine);
  border-top: 1px solid oklch(0.78 0.12 80 / 10%);
  border-bottom: 1px solid oklch(0.78 0.12 80 / 10%);
}

/* Dream sequence block */
.ai-fmt-dream {
  background: oklch(0.58 0.22 300 / 4%);
  border-left: 2px solid oklch(0.58 0.22 300 / 15%);
  padding: 4px 10px;
  margin: 6px 0;
  font-style: italic;
  color: var(--ai-fmt-text-dim);
}


/* ════════════════════════════════════════════════════════════
   TRANSLATOR / META / FOOTNOTES
   ════════════════════════════════════════════════════════════ */

/* Translator note block */
.ai-fmt-tn-block {
  background: var(--ai-fmt-tn-bg);
  border: 1px solid var(--ai-fmt-tn-border);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 6px 0;
  font-size: 0.85em;
  color: var(--ai-fmt-tn-text);
}

.ai-fmt-tn-label {
  font-size: 0.78em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ai-fmt-text-dim);
  margin-bottom: 2px;
}

/* Inline translator note / aside */
.ai-fmt-tn-inline {
  font-size: 0.84em;
  color: var(--ai-fmt-tn-text);
  font-style: italic;
}

/* Editor note block */
.ai-fmt-editor-note {
  background: var(--ai-fmt-tn-bg);
  border-left: 3px solid var(--ai-fmt-accent);
  border-radius: 4px;
  padding: 5px 10px;
  margin: 4px 0;
  font-size: 0.85em;
  color: var(--ai-fmt-tn-text);
}

/* Author note block */
.ai-fmt-author-note {
  background: var(--ai-fmt-tn-bg);
  border-left: 3px solid var(--ai-fmt-divine);
  border-radius: 4px;
  padding: 5px 10px;
  margin: 4px 0;
  font-size: 0.85em;
  color: var(--ai-fmt-tn-text);
}

/* Footnote superscript */
.ai-fmt-footnote-ref {
  font-size: 0.72em;
  vertical-align: super;
  color: var(--ai-fmt-accent);
  font-weight: 600;
}

/* Footnote body */
.ai-fmt-footnote {
  font-size: 0.82em;
  color: var(--ai-fmt-footnote);
  padding-left: 12px;
  margin: 2px 0;
  border-left: 1px solid var(--ai-fmt-tn-border);
}

/* Publisher / studio credit inline */
.ai-fmt-credit {
  font-size: 0.8em;
  color: var(--ai-fmt-text-dim);
  font-style: italic;
}

/* Original language text inline */
.ai-fmt-original-text {
  font-style: italic;
  color: var(--ai-fmt-text-dim);
  font-size: 0.9em;
}


/* ════════════════════════════════════════════════════════════
   WORLD-BUILDING / LOCATIONS / FACTIONS
   ════════════════════════════════════════════════════════════ */

/* Location card */
.ai-fmt-location-card {
  background: var(--ai-fmt-card-bg);
  border: 1px solid var(--ai-fmt-card-border);
  border-radius: 8px;
  padding: 5px 10px;
  margin: 4px 0;
  font-size: 0.92em;
}

.ai-fmt-location-name {
  font-weight: 700;
  color: var(--ai-fmt-accent);
}

/* Faction badge */
.ai-fmt-faction {
  display: inline-block;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.82em;
  font-weight: 600;
  white-space: nowrap;
  background: var(--ai-fmt-accent-dim);
  color: var(--ai-fmt-accent);
}

/* Faction variant colors */
.ai-fmt-faction-hostile {
  background: var(--ai-fmt-debuff-bg);
  color: var(--ai-fmt-debuff);
}

.ai-fmt-faction-friendly {
  background: var(--ai-fmt-buff-bg);
  color: var(--ai-fmt-buff);
}

.ai-fmt-faction-neutral {
  background: oklch(0.55 0 0 / 10%);
  color: var(--ai-fmt-text-dim);
}

/* Lore entry block */
.ai-fmt-lore-block {
  background: var(--ai-fmt-card-bg);
  border: 1px solid var(--ai-fmt-card-border);
  border-left: 3px solid var(--ai-fmt-divine);
  border-radius: 8px;
  padding: 6px 10px;
  margin: 4px 0;
  font-size: 0.9em;
}

/* Race / species name inline */
.ai-fmt-race {
  font-weight: 600;
  color: var(--ai-fmt-text);
  font-variant: small-caps;
}

/* Era / time period inline */
.ai-fmt-era {
  font-style: italic;
  color: var(--ai-fmt-text-dim);
}


/* ════════════════════════════════════════════════════════════
   MISC / UTILITY
   ════════════════════════════════════════════════════════════ */

/* Separator / scene break */
.ai-fmt-separator {
  display: block;
  text-align: center;
  padding: 6px 0;
  margin: 4px 0;
  font-size: 0.8em;
  letter-spacing: 0.3em;
  color: var(--ai-fmt-text-dim);
}

/* Warning / danger inline */
.ai-fmt-warning {
  color: var(--ai-fmt-debuff);
  font-weight: 600;
}

/* Muted / de-emphasized text */
.ai-fmt-muted {
  color: var(--ai-fmt-text-dim);
  font-size: 0.9em;
}

/* Small caps for titles and special names */
.ai-fmt-smallcaps {
  font-variant: small-caps;
  letter-spacing: 0.02em;
}

/* Monospace for codes, IDs, serial numbers */
.ai-fmt-mono {
  font-family: monospace;
  font-size: 0.88em;
}

/* Currency / money inline */
.ai-fmt-currency {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ai-fmt-rank-s);
}

/* Strikethrough / cancelled */
.ai-fmt-strike {
  text-decoration: line-through;
  color: var(--ai-fmt-text-dim);
}

/* Glow emphasis — for important reveals or divine moments */
.ai-fmt-glow {
  font-weight: 700;
  color: var(--ai-fmt-divine);
}

/* Condensed info row — for compact stat-like info without full stat block */
.ai-fmt-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1px 0;
  font-size: 0.88em;
}

.ai-fmt-info-label {
  color: var(--ai-fmt-text-dim);
  font-size: 0.9em;
}

.ai-fmt-info-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ai-fmt-text);
}
`;