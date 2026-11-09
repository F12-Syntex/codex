/**
 * Assistant answer protocol (owner: WS-E). AI_AUDIT §4.4.7.
 *
 * PURE: no `electron`, Node or DOM imports. Used by main (`assistant.turn`, which persists the
 * parsed result) and by the renderer (streaming preview).
 *
 * The model writes Markdown with two inline markers:
 *   [[cite:<chapterLabel>:<paraOrdinal>]]   e.g. [[cite:12:4]] → "Ch 12 ¶4" (ordinal is 1-based)
 *   [[entity:<id>|<Name>]]                  e.g. [[entity:kim-dokja|Kim Dokja]]
 *
 * `parseAssistantText` validates every marker through a `MarkerResolver` (which applies the
 * frontier), then rewrites the text into the stored Markdown dialect understood by
 * `./markdown.ts`:
 *   - valid cite   → `[^n]` (n = 1-based index into `citations`; repeated refs share n)
 *   - dropped cite → removed (unknown chapter/paragraph, or past the frontier)
 *   - valid entity → `[Name](entity:<id>)`
 *   - hidden entity→ `Name` (plain text; the name itself was in the model's output)
 */

import type { ParaRef } from "../pipeline/types";
import type { Citation } from "./types";

/** Sent as a `delta` when a streamed round turned out to be a tool round: discard the buffer. */
export const STREAM_RESET = "\u0000reset\u0000";

const CITE_RE = /\[\[\s*cite\s*:\s*([^\]\n]+?)\s*:\s*(\d+)\s*\]\]/gi;
const ENTITY_RE = /\[\[\s*entity\s*:\s*([^|\]\n]+?)\s*\|\s*([^\]\n]+?)\s*\]\]/gi;
const ANY_MARKER_RE = /\[\[\s*(cite|entity)\s*:[^\]\n]*\]\]/gi;

export interface ResolvedCite {
  ref: ParaRef;
  chapterIndex: number;
  /** Optional; defaults to "Ch <label> ¶<ordinal>". */
  label?: string;
  snippet?: string;
}

export interface MarkerResolver {
  /** Null when the chapter/paragraph does not exist or is past the frontier. */
  resolveCite(chapterLabel: string, paraOrdinal: number): ResolvedCite | null;
  /** False when the entity is unknown or not yet introduced at the frontier. */
  isEntityVisible(entityId: string): boolean;
}

export interface ParsedAnswer {
  markdown: string;
  citations: Citation[];
  entityLinks: string[];
  dropped: { cites: number; entities: number };
}

/** Escape characters that would break `[text](entity:id)` link syntax. */
function linkText(name: string): string {
  return name.replace(/[[\]]/g, "").trim();
}

function refKey(r: ParaRef): string {
  return `${r.chapterId}\u0001${r.paraId}`;
}

export function parseAssistantText(raw: string, resolver: MarkerResolver): ParsedAnswer {
  const citations: Citation[] = [];
  const indexByRef = new Map<string, number>();
  const entityLinks: string[] = [];
  let droppedCites = 0;
  let droppedEntities = 0;

  let text = raw.replace(CITE_RE, (_m, label: string, ord: string) => {
    const ordinal = Number.parseInt(ord, 10);
    const hit = Number.isFinite(ordinal) && ordinal > 0 ? resolver.resolveCite(label.trim(), ordinal) : null;
    if (!hit) {
      droppedCites++;
      return "\u0002"; // placeholder: collapse surrounding whitespace below
    }
    const key = refKey(hit.ref);
    let n = indexByRef.get(key);
    if (n === undefined) {
      citations.push({
        ref: hit.ref,
        chapterIndex: hit.chapterIndex,
        label: hit.label ?? `Ch ${label.trim()} ¶${ordinal}`,
        ...(hit.snippet ? { snippet: hit.snippet } : {}),
      });
      n = citations.length;
      indexByRef.set(key, n);
    }
    return `[^${n}]`;
  });

  text = text.replace(ENTITY_RE, (_m, id: string, name: string) => {
    const clean = linkText(name);
    if (!resolver.isEntityVisible(id.trim())) {
      droppedEntities++;
      return clean;
    }
    if (!entityLinks.includes(id.trim())) entityLinks.push(id.trim());
    return `[${clean}](entity:${id.trim()})`;
  });

  // Remove dropped-cite placeholders with the whitespace that preceded them ("claim [[cite]]." → "claim.").
  text = text.replace(/[ \t]*\u0002/g, "");
  // Any malformed marker left over must not reach the user.
  text = text.replace(ANY_MARKER_RE, "");

  return { markdown: text.trim(), citations, entityLinks, dropped: { cites: droppedCites, entities: droppedEntities } };
}

/** Cut a trailing, not-yet-closed `[[…` so streaming text never flashes raw marker syntax. */
export function stripPartialMarker(text: string): string {
  const open = text.lastIndexOf("[[");
  if (open < 0) {
    return text.endsWith("[") ? text.slice(0, -1) : text;
  }
  const close = text.indexOf("]]", open);
  return close < 0 ? text.slice(0, open) : text;
}

/**
 * Renderer-side preview of a streaming answer (no resolver available yet): cite markers are
 * hidden (chips appear when the final, validated message lands) and entity markers become plain
 * names. Handles the `STREAM_RESET` sentinel.
 */
export function streamingPreview(buffer: string): string {
  const reset = buffer.lastIndexOf(STREAM_RESET);
  let text = reset >= 0 ? buffer.slice(reset + STREAM_RESET.length) : buffer;
  text = stripPartialMarker(text);
  text = text.replace(CITE_RE, "").replace(ENTITY_RE, (_m, _id: string, name: string) => linkText(name));
  text = text.replace(ANY_MARKER_RE, "");
  return text.replace(/[ \t]+([.,;:!?])/g, "$1");
}

/** Parse a "12", "Chapter 12", "Ch 12", "ch.12" chapter reference into its label. */
export function normalizeChapterLabel(input: string | number): string {
  const s = String(input).trim();
  const m = /^(?:chapter|chap\.?|ch\.?)\s*(.+)$/i.exec(s);
  return (m ? m[1] : s).trim();
}
