/**
 * `knowledge.getContext` (owner: WS-B): ONE builder for every prompt that needs book knowledge
 * (replaces the five legacy builders). Frontier-gated, budgeted, and ranked by mentions:
 * the focus text is pre-scanned against every visible name and alias, so the entities that
 * actually appear in the passage come first, then recent ones, then significant ones.
 *
 * Chapter numbering in `text` is always "Chapter <label>" (1-based story labels).
 */

import type { SqlDb } from "../db/sql";
import type {
  EntitySnapshot, Frontier, KnowledgeContext, KnowledgeContextPurpose, KnowledgeContextRequest,
} from "../shared/knowledge/types";
import { maxChapterSql } from "./frontier";
import {
  arcItems, arcsAt, defaultLabel, mcAt, mcStatsBrief, snapshotsFor, summariesAt, versionsAt, visibleEntries,
  type ChapterLabeler,
} from "./read";
import type { WikiEntryRow } from "./store";

interface Shares {
  summaries: number;
  arcs: number;
  entities: number;
  index: number;
  mc: number;
  /** Max recent summaries when no `summaryFrom` is given. */
  recentSummaries: number;
  /** Max entities rendered in full. */
  roster: number;
  charactersOnly?: boolean;
  /** Include relationship lines per entity. */
  relations: boolean;
}

const PROFILES: Record<KnowledgeContextPurpose, Shares> = {
  ingest: { summaries: 0.2, arcs: 0.1, entities: 0.45, index: 0.25, mc: 0, recentSummaries: 8, roster: 60, relations: true },
  recap: { summaries: 0.55, arcs: 0.15, entities: 0.3, index: 0, mc: 0, recentSummaries: 8, roster: 12, relations: false },
  assistant: { summaries: 0.3, arcs: 0.15, entities: 0.45, index: 0.05, mc: 0.05, recentSummaries: 10, roster: 30, relations: true },
  explain: { summaries: 0.25, arcs: 0.1, entities: 0.6, index: 0, mc: 0.05, recentSummaries: 5, roster: 15, relations: true },
  simulate: { summaries: 0.35, arcs: 0.15, entities: 0.45, index: 0, mc: 0.05, recentSummaries: 6, roster: 20, relations: true },
  lookup: { summaries: 0.15, arcs: 0, entities: 0.85, index: 0, mc: 0, recentSummaries: 3, roster: 10, relations: true },
  comments: { summaries: 0.4, arcs: 0.1, entities: 0.5, index: 0, mc: 0, recentSummaries: 3, roster: 15, relations: false },
  format: { summaries: 0, arcs: 0, entities: 1, index: 0, mc: 0, recentSummaries: 0, roster: 25, charactersOnly: true, relations: false },
};

export interface ContextDeps {
  /** Frontier used when the request has none. */
  frontierOf(filePath: string): Frontier;
  labelOf?: ChapterLabeler;
}

// ── Mention scan ────────────────────────────────────────────────────────────

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/** Count whole-word, case-insensitive mentions of each name in `text`. */
export function countMentions(text: string, names: Map<string, string[]>): Map<string, number> {
  const out = new Map<string, number>();
  if (!text) return out;
  const lower = text.toLowerCase();
  const words = new Set(lower.match(WORD_RE) ?? []);
  for (const [id, list] of names) {
    let total = 0;
    for (const raw of list) {
      const name = raw.toLowerCase().trim();
      if (name.length < 2) continue;
      const first = name.match(WORD_RE)?.[0];
      if (first && !words.has(first)) continue; // cheap reject
      for (let i = lower.indexOf(name); i !== -1; i = lower.indexOf(name, i + name.length)) {
        if (!isWordChar(lower[i - 1]) && !isWordChar(lower[i + name.length])) total++;
      }
    }
    if (total > 0) out.set(id, total);
  }
  return out;
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function getContext(db: SqlDb, req: KnowledgeContextRequest, deps: ContextDeps): KnowledgeContext {
  const frontier = req.frontier ?? deps.frontierOf(req.filePath);
  const labelOf = deps.labelOf ?? defaultLabel;
  const profile = PROFILES[req.purpose] ?? PROFILES.assistant;
  const budget = Math.max(0, Math.floor(req.budgetChars));
  const filePath = req.filePath;
  const max = maxChapterSql(frontier);

  // ── Candidates and ranking ──
  let entries = visibleEntries(db, filePath, frontier);
  if (profile.charactersOnly) entries = entries.filter((e) => e.type === "character");
  const versions = versionsAt(db, filePath, frontier);

  const names = new Map<string, string[]>();
  for (const e of entries) names.set(e.id, [e.name]);
  for (const a of db.all<{ entry_id: string; alias: string }>(
    `SELECT a.entry_id, a.alias FROM wiki_aliases a JOIN wiki_entries e ON e.file_path = a.file_path AND e.id = a.entry_id
     WHERE a.file_path = ? AND a.relevance >= 2 AND COALESCE(a.first_chapter, e.first_appearance) <= ?`,
    [filePath, max],
  )) names.get(a.entry_id)?.push(a.alias);

  const mentions = countMentions(req.focusText ?? "", names);
  const focus = new Set(req.focusEntityIds ?? []);
  const lastSeen = new Map<string, number>();
  for (const r of db.all<{ entry_id: string; last: number }>(
    "SELECT entry_id, MAX(chapter_index) AS last FROM wiki_appearances WHERE file_path = ? AND chapter_index <= ? GROUP BY entry_id",
    [filePath, max],
  )) lastSeen.set(r.entry_id, Number(r.last));

  const anchor = frontier.mode === "off" ? Math.max(0, ...lastSeen.values()) : frontier.chapterIndex;
  const sig = (e: WikiEntryRow) => versions.at.get(e.id)?.significance ?? (versions.versioned.has(e.id) ? 1 : e.significance ?? 1);
  const score = (e: WikiEntryRow) => {
    let s = 0;
    if (focus.has(e.id)) s += 2000;
    const m = mentions.get(e.id) ?? 0;
    if (m > 0) s += 1000 + Math.min(m, 50) * 10;
    const seen = lastSeen.get(e.id) ?? e.first_appearance;
    const gap = anchor - seen;
    if (gap <= 1) s += 60;
    else if (gap <= 8) s += 30;
    s += sig(e) * 15;
    return s;
  };
  const ranked = entries
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => b.s - a.s || a.e.first_appearance - b.e.first_appearance || a.e.name.localeCompare(b.e.name));

  // ── Sections (in priority order; unused budget flows to the next one) ──
  const sections: { title: string; lines: string[] }[] = [];
  let carry = 0;
  const take = (share: number, title: string, lines: string[]): string[] => {
    const cap = Math.floor(budget * share) + carry;
    const out: string[] = [];
    let used = lines.length ? title.length + 2 : 0;
    for (const line of lines) {
      if (used + line.length + 1 > cap) break;
      out.push(line);
      used += line.length + 1;
    }
    carry = Math.max(0, cap - (out.length ? used : 0));
    if (out.length) sections.push({ title, lines: out });
    return out;
  };

  // Entities in full (most relevant first).
  const rosterRows = ranked.slice(0, profile.roster).map((r) => r.e);
  const snaps = snapshotsFor(db, filePath, rosterRows, frontier);
  const entityLine = (s: EntitySnapshot) => {
    const aka = s.aliases.length ? `, aka ${s.aliases.slice(0, 4).join("/")}` : "";
    let line = `- [${s.type}] ${s.name} (id: ${s.id}${aka}; significance ${s.significance}; ${s.status}; since Chapter ${labelOf(s.firstAppearance)}): ${s.shortDescription}`;
    if (profile.relations && s.relationships.length) {
      line += ` | ${s.relationships.slice(0, 3).map((r) => `${r.relation}→${r.targetName}`).join(", ")}`;
    }
    return line;
  };
  const entityHeading = profile.charactersOnly ? "## Characters" : "## Characters & entities";

  // Summaries.
  const allSummaries = summariesAt(db, filePath, frontier, labelOf, req.summaryFrom ?? 0);
  const summaryPool = req.summaryFrom != null ? allSummaries : allSummaries.slice(-profile.recentSummaries);
  const summaryLine = (s: { label: string; summary: string; mood?: string }) => `- Chapter ${s.label}: ${s.summary}${s.mood ? ` [${s.mood}]` : ""}`;

  // Arcs.
  const arcs = arcItems(arcsAt(db, filePath, frontier)).filter((a) => a.status !== "resolved" && a.status !== "abandoned" || req.purpose === "recap");
  const arcLine = (a: { id: string; name: string; type: string; status: string; latestBeat?: string }) =>
    `- [${a.type}] "${a.name}" (id: ${a.id}, ${a.status})${a.latestBeat ? ` | latest: ${a.latestBeat}` : ""}`;

  const upTo = frontier.mode === "off" ? "" : frontier.chapterIndex >= 0 ? ` (up to Chapter ${labelOf(frontier.chapterIndex)})` : "";
  const order: { key: keyof Shares; run: () => void }[] = req.purpose === "recap"
    ? [
        { key: "summaries", run: () => { keptSummaries = takeSummaries(); } },
        { key: "arcs", run: () => { keptArcs = take(profile.arcs, "## Story arcs", arcs.map(arcLine)).length; } },
        { key: "entities", run: () => { keptEntities = take(profile.entities, entityHeading, snaps.map(entityLine)).length; } },
      ]
    : [
        { key: "entities", run: () => { keptEntities = take(profile.entities, entityHeading, snaps.map(entityLine)).length; } },
        { key: "summaries", run: () => { keptSummaries = takeSummaries(); } },
        { key: "arcs", run: () => { keptArcs = take(profile.arcs, "## Story arcs", arcs.map(arcLine)).length; } },
      ];

  let keptEntities = 0;
  let keptSummaries: typeof summaryPool = [];
  let keptArcs = 0;
  // Summaries keep the most recent ones when the budget is short, rendered chronologically.
  function takeSummaries(): typeof summaryPool {
    const newestFirst = [...summaryPool].reverse();
    const lines = newestFirst.map(summaryLine);
    const kept = take(profile.summaries, `## Story so far${upTo}`, lines);
    const section = sections[sections.length - 1];
    if (kept.length && section?.lines === kept) section.lines = [...kept].reverse();
    return newestFirst.slice(0, kept.length).reverse();
  }
  for (const step of order) step.run();

  // Compact index of the remaining visible entities (ids for de-duplication).
  if (profile.index > 0) {
    const rendered = new Set(snaps.slice(0, keptEntities).map((s) => s.id));
    const indexLines = ranked
      .filter((r) => !rendered.has(r.e.id))
      .map(({ e }) => {
        const v = versions.at.get(e.id);
        const desc = v?.shortDescription ?? (versions.versioned.has(e.id) ? "" : e.short_description ?? "");
        const aka = (names.get(e.id) ?? []).slice(1, 4);
        return `${e.id}: ${e.name}${aka.length ? ` (aka ${aka.join(", ")})` : ""} [${e.type}]${desc ? `: ${truncate(desc, 90)}` : ""}`;
      });
    take(profile.index, "## Entity index (use these ids; do not create duplicates)", indexLines);
  }

  const mcFull = profile.mc > 0 ? mcAt(db, filePath, frontier) : undefined;
  const mc = mcStatsBrief(mcFull);
  if (mc && mc.stats.length) {
    take(profile.mc, "## Main character stats", mc.stats.map((s) => `- ${s.name}: ${s.value ?? "—"}`));
  }

  let text = sections.map((s) => `${s.title}\n${s.lines.join("\n")}`).join("\n\n");
  if (text.length > budget) text = text.slice(0, budget); // belt and braces; lines are pre-budgeted

  const ctx: KnowledgeContext = {
    frontier,
    entities: snaps.slice(0, keptEntities),
    summaries: keptSummaries.map(({ chapter, label, summary, mood }) => (mood ? { chapter, label, summary, mood } : { chapter, label, summary })),
    arcs: arcs.slice(0, keptArcs),
    text,
  };
  if (mc) ctx.mc = mc;
  return ctx;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
