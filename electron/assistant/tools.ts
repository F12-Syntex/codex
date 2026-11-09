/**
 * Assistant tools (owner: WS-E). AI_AUDIT §4.4.7 / §6 F3.
 *
 * Executed in main and ALWAYS clamped to the frontier (via `BookView` for book text and the
 * frontier-gated `KnowledgeReader` for knowledge, re-checked here as defence in depth):
 *   search_book(query, limit)                 FTS hits ≤ frontier, ±1 paragraph of context
 *   read_passage(chapter, fromPara, toPara)   past the frontier → "Not yet read"
 *   get_entity(nameOrId)                      snapshot as of the frontier
 *   list_summaries(fromChapter, toChapter)    chapter summaries ≤ frontier
 *   propose_wiki_edits(summary, edits)        TERMINAL: nothing is applied until the user confirms
 *
 * Tool output lists paragraphs with ready-to-copy `[[cite:<label>:<ordinal>]]` markers.
 */

import type { ToolCall, ToolSpec } from "../shared/ai/types";
import type { AssistantToolName } from "../shared/assistant/types";
import type { EntitySnapshot, KnowledgeReader, SearchHit, WikiEdit, WikiEntryType } from "../shared/knowledge/types";
import type { SourceChapter } from "../shared/pipeline/types";
import type { BookView } from "./book-view";
import { clip } from "./text";

export const MAX_SEARCH_RESULTS = 8;
export const MAX_PASSAGE_PARAS = 16;
const PASSAGE_CHAR_BUDGET = 7000;
const PARA_CHARS = 700;
export const NOT_YET_READ = "Not yet read";

export interface ToolEnv {
  filePath: string;
  view: BookView;
  knowledge: KnowledgeReader | null;
}

export interface ToolOutcome {
  /** Sent back to the model as the tool message. */
  content: string;
  /** True for `propose_wiki_edits`: the loop stops and the proposal goes to the user. */
  terminal?: boolean;
  proposal?: { summary: string; edits: WikiEdit[]; rejected: { edit: unknown; reason: string }[] };
  error?: boolean;
}

// ── Specs ───────────────────────────────────────────────────────────────────

const EDIT_DOC = `Each edit is one of:
{"op":"create","entry":{"name","type":"character|item|location|event|concept","shortDescription","firstAppearance":<chapter label>,"aliases"?:[…]}}
{"op":"update","id","fields":{"name"?,"type"?,"shortDescription"?,"status"?,"significance"?:1-5},"asOfChapter":<label>}
{"op":"delete","id"}
{"op":"alias","id","aliases":[…],"asOfChapter":<label>}
{"op":"relate","sourceId","targetId","relation","sinceChapter":<label>}
{"op":"merge","sourceId","targetId"}   (source is folded into target)`;

export const ASSISTANT_TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: "search_book",
    description:
      "Full-text search over the parts of the book the reader has already read. Returns matching paragraphs with one paragraph of context and their citation markers.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words or a short phrase to find (names, objects, quotes)." },
        limit: { type: "integer", minimum: 1, maximum: MAX_SEARCH_RESULTS, description: "Max hits (default 5)." },
      },
      required: ["query"],
    },
  },
  {
    name: "read_passage",
    description: `Read consecutive paragraphs of a chapter (at most ${MAX_PASSAGE_PARAS}). Paragraph numbers are 1-based. Chapters past the reader's progress return "${NOT_YET_READ}".`,
    parameters: {
      type: "object",
      properties: {
        chapter: { type: "string", description: 'Chapter label as shown in markers, e.g. "12".' },
        fromPara: { type: "integer", minimum: 1 },
        toPara: { type: "integer", minimum: 1 },
      },
      required: ["chapter", "fromPara", "toPara"],
    },
  },
  {
    name: "get_entity",
    description: "Look up a character, place, item, event or concept from the book's wiki, as known at the reader's progress.",
    parameters: {
      type: "object",
      properties: { nameOrId: { type: "string", description: "Entity id or (part of) a name/alias." } },
      required: ["nameOrId"],
    },
  },
  {
    name: "list_summaries",
    description: "Chapter summaries for a range of chapters the reader has finished.",
    parameters: {
      type: "object",
      properties: {
        fromChapter: { type: "string", description: "First chapter label (inclusive)." },
        toChapter: { type: "string", description: "Last chapter label (inclusive)." },
      },
      required: ["fromChapter", "toChapter"],
    },
  },
  {
    name: "propose_wiki_edits",
    description: `Propose corrections or additions to the book's wiki. Nothing is applied until the user approves. Call this only when the user asks to fix or add wiki information, and only for things the reader has read. ${EDIT_DOC}`,
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One or two sentences telling the user what will change and why." },
        edits: { type: "array", items: { type: "object" }, minItems: 1, maxItems: 20 },
      },
      required: ["summary", "edits"],
    },
  },
];

export const ASSISTANT_TOOL_NAMES: readonly AssistantToolName[] = ASSISTANT_TOOL_SPECS.map((s) => s.name as AssistantToolName);

// ── Helpers ─────────────────────────────────────────────────────────────────

function args(call: ToolCall): Record<string, unknown> {
  try {
    const v = JSON.parse(call.arguments || "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const int = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : Number.NaN;
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

function paraLine(view: BookView, ch: SourceChapter, i: number): string {
  return `[[cite:${view.label(ch.index)}:${i + 1}]] ${clip(ch.paras[i].text.replace(/\s+/g, " ").trim(), PARA_CHARS)}`;
}

function describeEntity(view: BookView, e: EntitySnapshot): string {
  const lines = [
    `[[entity:${e.id}|${e.name}]] — ${e.type}${e.status ? `, ${e.status}` : ""}`,
    e.aliases.length ? `Also known as: ${e.aliases.slice(0, 8).join(", ")}` : "",
    e.shortDescription ? `Description: ${e.shortDescription}` : "",
    `First seen: Chapter ${view.label(e.firstAppearance)} · last seen: Chapter ${view.label(e.lastSeen)}`,
  ].filter(Boolean);
  const details = e.details.filter((d) => !d.superseded).slice(-12);
  if (details.length) {
    lines.push("Details:");
    for (const d of details) lines.push(`- (Ch ${view.label(d.chapter)}, ${d.category}) ${clip(d.content, 300)}`);
  }
  if (e.relationships.length) {
    lines.push("Relationships:");
    for (const r of e.relationships.slice(0, 10)) lines.push(`- ${r.relation}: [[entity:${r.targetId}|${r.targetName}]] (since Ch ${view.label(r.since)})`);
  }
  return lines.join("\n");
}

const ENTRY_TYPES: readonly WikiEntryType[] = ["character", "item", "location", "event", "concept"];

// ── Executor ────────────────────────────────────────────────────────────────

export class AssistantTools {
  readonly specs = ASSISTANT_TOOL_SPECS;
  /** Tool calls made this turn (diagnostics; also lets the UI say "searched the book"). */
  readonly trace: { name: string; ok: boolean }[] = [];

  constructor(private readonly env: ToolEnv) {}

  private get view(): BookView {
    return this.env.view;
  }

  /** Last chapter index whose knowledge may be read (whole chapters only, for summaries/edits). */
  private finishedChapter(): number {
    const f = this.view.frontier;
    return f.mode === "off" ? Number.MAX_SAFE_INTEGER : f.chapterIndex;
  }

  /** Last chapter with any visible text (for entity first-appearance checks). */
  private lastReadableChapter(): number {
    const f = this.view.frontier;
    if (f.mode === "off") return Number.MAX_SAFE_INTEGER;
    const readable = this.view.readableChapters();
    return readable.length ? readable[readable.length - 1] : f.paraId ? f.chapterIndex + 1 : f.chapterIndex;
  }

  private chapterArg(v: unknown): number | undefined {
    if (typeof v === "number") return this.view.indexOfLabel(String(v));
    if (typeof v === "string" && v.trim()) return this.view.indexOfLabel(v);
    return undefined;
  }

  async execute(call: ToolCall): Promise<ToolOutcome> {
    let out: ToolOutcome;
    try {
      const a = args(call);
      switch (call.name as AssistantToolName) {
        case "search_book": out = await this.searchBook(String(a.query ?? ""), int(a.limit)); break;
        case "read_passage": out = await this.readPassage(a.chapter, int(a.fromPara), int(a.toPara)); break;
        case "get_entity": out = this.getEntity(String(a.nameOrId ?? "")); break;
        case "list_summaries": out = this.listSummaries(a.fromChapter, a.toChapter); break;
        case "propose_wiki_edits": out = this.proposeEdits(a.summary, a.edits); break;
        default: out = { content: `Unknown tool "${call.name}".`, error: true };
      }
    } catch (err) {
      out = { content: `Tool failed: ${err instanceof Error ? err.message : String(err)}`, error: true };
    }
    this.trace.push({ name: call.name, ok: !out.error });
    return out;
  }

  // search_book ──────────────────────────────────────────────────────────────
  async searchBook(query: string, limitArg?: number): Promise<ToolOutcome> {
    const q = query.trim().slice(0, 200);
    if (!q) return { content: "Empty query.", error: true };
    const limit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, limitArg ?? 5));

    let hits: SearchHit[] = [];
    if (this.env.knowledge) {
      try {
        hits = this.env.knowledge.search(this.env.filePath, q, this.view.frontier, limit * 2);
      } catch {
        hits = [];
      }
    }
    if (!hits.length) hits = await this.scan(q, limit * 2);

    const blocks: string[] = [];
    const seen = new Set<string>();
    for (const h of hits) {
      if (blocks.length >= limit) break;
      if (!this.view.chapterReadable(h.chapterIndex)) continue; // defence in depth
      const ch = await this.view.chapter(h.chapterIndex);
      if (!ch) continue;
      const at = ch.paras.findIndex((p) => p.id === h.paraId);
      if (!this.view.isVisible(ch, at)) continue;
      const key = `${ch.index}:${at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lines: string[] = [];
      for (let i = at - 1; i <= at + 1; i++) if (this.view.isVisible(ch, i)) lines.push(paraLine(this.view, ch, i));
      blocks.push(`Chapter ${this.view.label(ch.index)}:\n${lines.join("\n")}`);
    }
    if (!blocks.length) return { content: `No passages the reader has read mention "${q}".` };
    return { content: blocks.join("\n\n") };
  }

  /** Fallback when knowledge search is unavailable: a bounded scan of readable chapters. */
  private async scan(q: string, limit: number): Promise<SearchHit[]> {
    const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (!terms.length) return [];
    const out: SearchHit[] = [];
    const chapters = this.view.readableChapters().reverse(); // most recent first
    for (const idx of chapters) {
      const ch = await this.view.chapter(idx);
      if (!ch) continue;
      const n = this.view.visibleCount(ch);
      for (let i = 0; i < n; i++) {
        const t = ch.paras[i].text.toLowerCase();
        const score = terms.reduce((s, term) => s + (t.includes(term) ? 1 : 0), 0);
        if (score === terms.length || (terms.length > 2 && score >= terms.length - 1)) {
          out.push({ chapterIndex: idx, paraId: ch.paras[i].id, snippet: "", score });
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  // read_passage ─────────────────────────────────────────────────────────────
  async readPassage(chapterArg: unknown, fromArg?: number, toArg?: number): Promise<ToolOutcome> {
    const idx = this.chapterArg(chapterArg);
    if (idx === undefined) return { content: `Unknown chapter "${String(chapterArg)}".`, error: true };
    const label = this.view.label(idx);
    if (!this.view.chapterReadable(idx)) {
      return { content: `${NOT_YET_READ}: the reader has not reached Chapter ${label}. Do not reveal or guess what happens there.` };
    }
    const ch = await this.view.chapter(idx);
    if (!ch) return { content: `Chapter ${label} is unavailable.`, error: true };
    const visible = this.view.visibleCount(ch);
    const from = Math.max(1, fromArg ?? 1);
    if (from > visible) {
      return { content: `${NOT_YET_READ}: the reader has only read up to paragraph ${visible} of Chapter ${label}. Do not reveal or guess what comes next.` };
    }
    const to = Math.min(Math.max(from, toArg ?? from + 5), from + MAX_PASSAGE_PARAS - 1, visible, ch.paras.length);
    const lines: string[] = [];
    let used = 0;
    for (let i = from - 1; i < to; i++) {
      const line = paraLine(this.view, ch, i);
      if (used + line.length > PASSAGE_CHAR_BUDGET && lines.length) break;
      lines.push(line);
      used += line.length;
    }
    const clamped = (toArg ?? to) > visible ? ` (paragraphs after ${visible}: ${NOT_YET_READ.toLowerCase()})` : "";
    return { content: `Chapter ${label}, paragraphs ${from}–${from + lines.length - 1} of ${ch.paras.length}${clamped}:\n${lines.join("\n")}` };
  }

  // get_entity ───────────────────────────────────────────────────────────────
  findEntity(nameOrId: string): EntitySnapshot | null {
    const k = this.env.knowledge;
    if (!k) return null;
    const f = this.view.frontier;
    const q = nameOrId.trim();
    if (!q) return null;
    const accept = (e: EntitySnapshot | null) => (e && e.firstAppearance <= this.lastReadableChapter() ? e : null);
    try {
      const direct = accept(k.getEntity(this.env.filePath, q, f));
      if (direct) return direct;
      const lower = q.toLowerCase();
      const index = k.getEntityIndex(this.env.filePath, f);
      const names = (it: (typeof index)[number]) => [it.name, ...it.aliases].map((n) => n.toLowerCase());
      const match =
        index.find((it) => it.id.toLowerCase() === lower) ??
        index.find((it) => names(it).includes(lower)) ??
        index.find((it) => names(it).some((n) => n.startsWith(lower) || lower.startsWith(n))) ??
        index.find((it) => names(it).some((n) => n.includes(lower)));
      return match ? accept(k.getEntity(this.env.filePath, match.id, f)) : null;
    } catch {
      return null;
    }
  }

  getEntity(nameOrId: string): ToolOutcome {
    if (!this.env.knowledge) return { content: "The wiki is not available for this book." };
    const e = this.findEntity(nameOrId);
    if (!e) return { content: `No wiki entry for "${nameOrId}" among what the reader has read.` };
    return { content: describeEntity(this.view, e) };
  }

  // list_summaries ───────────────────────────────────────────────────────────
  listSummaries(fromArg: unknown, toArg: unknown): ToolOutcome {
    const k = this.env.knowledge;
    if (!k) return { content: "No chapter summaries are available for this book." };
    const last = this.finishedChapter();
    const from = this.chapterArg(fromArg) ?? 0;
    const to = Math.min(this.chapterArg(toArg) ?? last, last);
    if (from > last) return { content: `${NOT_YET_READ}: the reader has not finished Chapter ${this.view.label(from)}.` };
    let summaries: { chapter: number; label: string; summary: string }[] = [];
    try {
      summaries = k.getContext({ filePath: this.env.filePath, frontier: this.view.frontier, purpose: "recap", budgetChars: 9000 }).summaries;
    } catch {
      summaries = [];
    }
    const picked = summaries.filter((s) => s.chapter >= from && s.chapter <= to && s.chapter <= last).slice(-15);
    if (!picked.length) return { content: `No summaries for Chapters ${this.view.label(from)}–${this.view.label(Math.max(from, to))}.` };
    return { content: picked.map((s) => `Chapter ${s.label}: ${clip(s.summary, 900)}`).join("\n\n") };
  }

  // propose_wiki_edits ───────────────────────────────────────────────────────
  proposeEdits(summaryArg: unknown, editsArg: unknown): ToolOutcome {
    const summary = typeof summaryArg === "string" ? summaryArg.trim().slice(0, 600) : "";
    const raw = Array.isArray(editsArg) ? editsArg.slice(0, 20) : [];
    const edits: WikiEdit[] = [];
    const rejected: { edit: unknown; reason: string }[] = [];
    const cap = this.finishedChapter() < 0 ? 0 : Math.min(this.finishedChapter(), this.lastReadableChapter());
    const ch = (v: unknown): number => {
      const idx = this.chapterArg(v) ?? (int(v) !== undefined ? int(v)! - 1 : undefined);
      return Math.max(0, Math.min(idx ?? cap, this.lastReadableChapter()));
    };
    const known = (id: unknown) => typeof id === "string" && !!this.findEntity(id);
    const s = (v: unknown, n = 400) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);

    for (const e of raw) {
      const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      const reject = (reason: string) => rejected.push({ edit: e, reason });
      switch (o.op) {
        case "create": {
          const en = (o.entry && typeof o.entry === "object" ? o.entry : {}) as Record<string, unknown>;
          const name = s(en.name, 120);
          const type = ENTRY_TYPES.includes(en.type as WikiEntryType) ? (en.type as WikiEntryType) : undefined;
          if (!name || !type) { reject("create needs name and a valid type"); break; }
          const aliases = Array.isArray(en.aliases) ? en.aliases.filter((a): a is string => typeof a === "string").slice(0, 10) : undefined;
          edits.push({ op: "create", entry: { name, type, shortDescription: s(en.shortDescription) ?? "", firstAppearance: ch(en.firstAppearance), ...(aliases?.length ? { aliases } : {}) } });
          break;
        }
        case "update": {
          if (!known(o.id)) { reject("unknown entity"); break; }
          const f = (o.fields && typeof o.fields === "object" ? o.fields : {}) as Record<string, unknown>;
          const fields: Extract<WikiEdit, { op: "update" }>["fields"] = {};
          if (s(f.name, 120)) fields.name = s(f.name, 120);
          if (ENTRY_TYPES.includes(f.type as WikiEntryType)) fields.type = f.type as WikiEntryType;
          if (s(f.shortDescription)) fields.shortDescription = s(f.shortDescription);
          if (s(f.status, 60)) fields.status = s(f.status, 60);
          const sig = int(f.significance);
          if (sig !== undefined) fields.significance = Math.max(1, Math.min(5, sig));
          if (!Object.keys(fields).length) { reject("no fields to update"); break; }
          edits.push({ op: "update", id: o.id as string, fields, asOfChapter: ch(o.asOfChapter) });
          break;
        }
        case "delete":
          if (!known(o.id)) { reject("unknown entity"); break; }
          edits.push({ op: "delete", id: o.id as string });
          break;
        case "alias": {
          if (!known(o.id)) { reject("unknown entity"); break; }
          const aliases = Array.isArray(o.aliases) ? o.aliases.filter((a): a is string => typeof a === "string" && !!a.trim()).slice(0, 10) : [];
          if (!aliases.length) { reject("no aliases"); break; }
          edits.push({ op: "alias", id: o.id as string, aliases, asOfChapter: ch(o.asOfChapter) });
          break;
        }
        case "relate": {
          if (!known(o.sourceId) || !known(o.targetId)) { reject("unknown entity"); break; }
          const relation = s(o.relation, 120);
          if (!relation) { reject("relation missing"); break; }
          edits.push({ op: "relate", sourceId: o.sourceId as string, targetId: o.targetId as string, relation, sinceChapter: ch(o.sinceChapter) });
          break;
        }
        case "merge":
          if (!known(o.sourceId) || !known(o.targetId) || o.sourceId === o.targetId) { reject("merge needs two different known entities"); break; }
          edits.push({ op: "merge", sourceId: o.sourceId as string, targetId: o.targetId as string });
          break;
        default:
          reject(`unknown op "${String(o.op)}"`);
      }
    }

    if (!edits.length) {
      return {
        content: `No valid edits (${rejected.map((r) => r.reason).join("; ") || "empty list"}). Fix them or answer without proposing.`,
        error: true,
      };
    }
    return {
      content: `Proposed ${edits.length} edit(s) to the user for approval.`,
      terminal: true,
      proposal: { summary, edits, rejected },
    };
  }
}
