/**
 * Local series detection (AI_AUDIT §6 F5): regex rules on titles and file names, grouped by a
 * normalised stem. Runs before (and instead of) the model; `library.tag` only fills the gaps.
 *
 * PURE: no `electron`, Node or DOM imports.
 */

import type { SeriesSuggestion, SeriesVolume } from "./types";

export interface SeriesCandidateInput {
  filePath: string;
  title: string;
}

export interface SeriesGuess {
  name: string;
  number: number | null;
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

function romanToInt(s: string): number | null {
  const r = s.toLowerCase();
  if (!/^[ivxlc]+$/.test(r)) return null;
  let total = 0;
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN[r[i]];
    const next = ROMAN[r[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total > 0 && total < 200 ? total : null;
}

function toNumber(raw: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) && n < 10000 ? n : null;
  }
  return romanToInt(raw);
}

/** Normalised series key: lowercase, punctuation-free, without a leading article. */
export function seriesKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9À-￿]+/g, " ")
    .replace(/^(the|a|an) /, "")
    .trim();
}

/** "Solo_Leveling.v03.[Group](2019).cbz" → "Solo Leveling v03". */
export function cleanFilename(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  return base
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, " ")
    .replace(/\((?:\d{4}|digital|f|c2c|[a-z]+-?(?:dcp|scan)s?)\)/gi, " ")
    .replace(/[_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "<stem> Vol. 3", "<stem> v03", "<stem> #12", "<stem>, Book 2: subtitle" — a volume keyword + digits. */
const DIGIT_RE = /^(.*?)[\s,:;\-–—(]+(?:volume|vol|v|book|bk|part|pt|tome|tomo|band|issue|no|number|#)\.?\s*(\d{1,4}(?:\.\d)?)(?!\d)(.*)$/i;
/** "<stem> Book II" — roman numerals only after a spelled-out keyword and a space. */
const ROMAN_RE = /^(.*?)[\s,:;\-–—(]+(?:volume|vol|book|part|tome)\.?\s+([ivxlc]{1,6})\b(.*)$/i;
/** "<stem> 03" / "<stem> 12 - subtitle" — a bare trailing number (no years). */
const TRAILING_RE = /^(.*?\D)\s+(\d{1,3}(?:\.\d)?)(?:\s*(?:[-–—:(]|$).*)$/;

function cleanStem(stem: string): string {
  return stem.replace(/[\s,:;\-–—(#]+$/, "").replace(/^[\s,:;\-–—]+/, "").trim();
}

/** Series name + number from one string, or null. Stems must contain a letter. */
export function guessFromText(text: string): SeriesGuess | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const re of [DIGIT_RE, ROMAN_RE]) {
    const k = re.exec(t);
    if (!k) continue;
    const stem = cleanStem(k[1]);
    const n = toNumber(k[2]);
    if (stem && /\p{L}/u.test(stem) && n !== null) return { name: stem, number: n };
  }
  const tr = TRAILING_RE.exec(t);
  if (tr) {
    const stem = cleanStem(tr[1]);
    const n = toNumber(tr[2]);
    if (stem && /\p{L}/u.test(stem) && n !== null) return { name: stem, number: n };
  }
  return null;
}

/** Title first, then the cleaned file name. */
export function guessSeries(item: SeriesCandidateInput): SeriesGuess | null {
  return guessFromText(item.title) ?? guessFromText(cleanFilename(item.filePath));
}

function mostCommon(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0][0];
}

function sortVolumes(v: SeriesVolume[]): SeriesVolume[] {
  return [...v].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.title.localeCompare(b.title));
}

/**
 * Groups items into series suggestions. Local rules group items sharing a stem (≥ `minVolumes`).
 * `aiSeries` (filePath → name/number from `library.tag`) fills gaps: it joins items to a local group
 * with the same key, or forms its own group when ≥ `minVolumes` items agree. `exclude(filePath, key)`
 * skips items whose decision for that series is already made.
 */
export function detectSeries(
  items: readonly SeriesCandidateInput[],
  opts: {
    aiSeries?: ReadonlyMap<string, SeriesGuess>;
    exclude?: (filePath: string, key: string) => boolean;
    minVolumes?: number;
  } = {},
): SeriesSuggestion[] {
  const min = Math.max(2, opts.minVolumes ?? 2);
  const groups = new Map<string, { names: string[]; source: "local" | "ai"; volumes: SeriesVolume[] }>();
  const placed = new Set<string>();

  const add = (key: string, name: string, source: "local" | "ai", vol: SeriesVolume) => {
    const g = groups.get(key) ?? { names: [], source, volumes: [] };
    g.names.push(name);
    g.volumes.push(vol);
    groups.set(key, g);
    placed.add(vol.filePath);
  };

  for (const item of items) {
    const g = guessSeries(item);
    if (!g) continue;
    const key = seriesKey(g.name);
    if (!key || opts.exclude?.(item.filePath, key)) continue;
    add(key, g.name, "local", { filePath: item.filePath, title: item.title, number: g.number });
  }

  if (opts.aiSeries) {
    for (const item of items) {
      if (placed.has(item.filePath)) continue;
      const g = opts.aiSeries.get(item.filePath);
      if (!g?.name) continue;
      const key = seriesKey(g.name);
      if (!key || opts.exclude?.(item.filePath, key)) continue;
      const existing = groups.get(key);
      add(key, g.name, existing ? existing.source : "ai", { filePath: item.filePath, title: item.title, number: g.number });
    }
  }

  const out: SeriesSuggestion[] = [];
  for (const [key, g] of groups) {
    if (g.volumes.length < min) continue;
    out.push({ key, name: mostCommon(g.names), source: g.source, volumes: sortVolumes(g.volumes) });
  }
  return out.sort((a, b) => b.volumes.length - a.volumes.length || a.name.localeCompare(b.name));
}
