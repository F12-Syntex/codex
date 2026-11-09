/**
 * Wiki (knowledge) model response: types, tolerant parsing and normalisation (owner: WS-B).
 * Moved from `src/lib/ai-wiki.ts`. Kept local (rather than `shared/ai/json.ts`) because the
 * batch salvage is specific to this format and also recovers chapters from a truncated
 * response (`AIError("truncated").partial`). PURE.
 */

import type { WikiEntryType } from "../shared/knowledge/types";
import type { AIAliasInput } from "./alias-gate";

export interface WikiRelationshipInput {
  targetId: string;
  relation: string;
  since: number;
}

/* ── AI Response Types ──────────────────────────────────── */



export interface AIChapterSummary {
  summary: string;
  mood: string;
  key_events: string[];
}

export interface AIArcUpdate {
  arc_id: string;
  status: string;
  beat: { beat_type: string; description: string };
}

export interface AINewArc {
  id: string;
  name: string;
  arc_type: string;
  description: string;
  entities?: { entry_id: string; role: string }[];
  initial_beat: { beat_type: string; description: string };
}

export interface AINewEntry {
  id: string;
  name: string;
  type: WikiEntryType;
  aliases?: AIAliasInput[];
  shortDescription: string;
  description: string;
  significance?: number;
  status?: string;
  firstAppearance?: number;
  details?: { chapterIndex: number; content: string; category: string; relevance?: number; source?: string }[];
  relationships?: WikiRelationshipInput[];
  color?: string;
}

export interface AISupersede {
  category: string;
  reason?: string;
}

export interface AIUpdate {
  id: string;
  newAliases?: AIAliasInput[];
  descriptionAppend?: string;
  significance?: number;
  status?: string;
  details?: { chapterIndex: number; content: string; category: string; relevance?: number; source?: string }[];
  relationships?: WikiRelationshipInput[];
  supersede?: AISupersede[];
}

export interface AIArcAmendment {
  action: "merge" | "delete";
  source_arc_ids?: string[];
  target_arc_id?: string;
  arc_id?: string;
  reason?: string;
}

export interface AIEntityMerge {
  source_id: string;
  target_id: string;
  reason?: string;
}

export interface AIMCStat {
  key: string;
  category: string;
  name: string;
  value: string | null;
  is_active: boolean;
}

export interface AIWikiChapterData {
  chapter_index: number;
  chapter_summary?: AIChapterSummary;
  arc_updates?: AIArcUpdate[];
  new_arcs?: AINewArc[];
  arc_amendments?: AIArcAmendment[];
  entity_merges?: AIEntityMerge[];
  new_entries: AINewEntry[];
  updates: AIUpdate[];
  mc_stats?: AIMCStat[];
}

export interface AIWikiResponse {
  mc_entity_id?: string;
  batch?: AIWikiChapterData[];
  // Legacy single-chapter fields
  chapter_summary?: AIChapterSummary;
  arc_updates?: AIArcUpdate[];
  new_arcs?: AINewArc[];
  arc_amendments?: AIArcAmendment[];
  new_entries?: AINewEntry[];
  updates?: AIUpdate[];
}


export function parseWikiResponse(raw: string): AIWikiResponse | null {
  let cleaned = raw;

  // Extract from ```json ... ``` fence if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1];
  cleaned = cleaned.trim();

  // Try parsing with progressively more aggressive fixes
  const attempts: Array<() => string> = [
    () => sanitizeJSONControlChars(cleaned),
    () => sanitizeJSONControlChars(sanitizeUnescapedQuotes(cleaned)),
  ];

  for (const makeFixed of attempts) {
    const fixed = makeFixed();

    const direct = tryParseJSON(fixed);
    if (direct) return validateWikiResponse(direct);

    // Strip preamble: find first {
    const objStart = fixed.indexOf("{");
    if (objStart !== -1) {
      const fromBrace = fixed.slice(objStart);
      const direct2 = tryParseJSON(fromBrace);
      if (direct2) return validateWikiResponse(direct2);

      const repaired2 = repairTruncatedJSON(fromBrace);
      const parsed2 = tryParseJSON(repaired2);
      if (parsed2) {
                return validateWikiResponse(parsed2);
      }
    }

    const repaired = repairTruncatedJSON(fixed);
    const parsed = tryParseJSON(repaired);
    if (parsed) {
            return validateWikiResponse(parsed);
    }
  }

  // Last resort: salvage complete batch entries
  // Try with unescaped-quote fix first (dialogue quotes like "Tarot" inside strings
  // corrupt bracket-depth tracking without sanitization)
  const sanitized = sanitizeJSONControlChars(sanitizeUnescapedQuotes(cleaned));
  const salvaged = salvageBatchEntries(sanitized) ?? salvageBatchEntries(cleaned);
  if (salvaged) {
    return salvaged;
  }

  return null;
}

function tryParseJSON(s: string): AIWikiResponse | null {
  try {
    return JSON.parse(s) as AIWikiResponse;
  } catch {
    return null;
  }
}

const VALID_ENTRY_TYPES = new Set(["character", "item", "location", "event", "concept"]);

function validateChapterData(d: AIWikiChapterData): AIWikiChapterData {
  if (!Array.isArray(d.new_entries)) d.new_entries = [];
  if (!Array.isArray(d.updates)) d.updates = [];
  if (!Array.isArray(d.arc_updates)) d.arc_updates = [];
  if (!Array.isArray(d.new_arcs)) d.new_arcs = [];
  if (!Array.isArray(d.arc_amendments)) d.arc_amendments = [];
  if (!Array.isArray(d.entity_merges)) d.entity_merges = [];
  d.new_entries = d.new_entries.filter(e =>
    e &&
    typeof e.id === "string" && e.id.trim().length > 0 &&
    typeof e.name === "string" && e.name.trim().length > 0 &&
    typeof e.type === "string" && VALID_ENTRY_TYPES.has(e.type) &&
    typeof e.shortDescription === "string" && e.shortDescription.trim().length > 0,
  );
  d.updates = d.updates.filter(u => u && typeof u.id === "string" && u.id.trim().length > 0);
  return d;
}

function validateWikiResponse(parsed: AIWikiResponse): AIWikiResponse {
  if (parsed.batch) {
    parsed.batch = parsed.batch
      .filter(d => d && typeof d.chapter_index === "number")
      .map(validateChapterData);
    return parsed;
  }
  if (!Array.isArray(parsed.new_entries)) parsed.new_entries = [];
  if (!Array.isArray(parsed.updates)) parsed.updates = [];
  if (!Array.isArray(parsed.arc_updates)) parsed.arc_updates = [];
  if (!Array.isArray(parsed.new_arcs)) parsed.new_arcs = [];
  if (!Array.isArray(parsed.arc_amendments)) parsed.arc_amendments = [];
  parsed.new_entries = (parsed.new_entries ?? []).filter(e => e && typeof e.id === "string" && typeof e.name === "string");
  parsed.updates = (parsed.updates ?? []).filter(u => u && typeof u.id === "string");
  return parsed;
}

export function getChapterDataFromResponse(response: AIWikiResponse, fallbackChapterIndex: number): AIWikiChapterData[] {
  if (response.batch && response.batch.length > 0) return response.batch;
  return [{
    chapter_index: fallbackChapterIndex,
    chapter_summary: response.chapter_summary,
    arc_updates: response.arc_updates ?? [],
    new_arcs: response.new_arcs ?? [],
    arc_amendments: response.arc_amendments ?? [],
    new_entries: response.new_entries ?? [],
    updates: response.updates ?? [],
    entity_merges: (response as { entity_merges?: AIEntityMerge[] }).entity_merges ?? [],
    mc_stats: (response as { mc_stats?: AIMCStat[] }).mc_stats,
  }];
}

function sanitizeJSONControlChars(s: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      const code = ch.charCodeAt(0);
      if (ch === "\n") { result += "\\n"; continue; }
      if (ch === "\r") { result += "\\r"; continue; }
      if (ch === "\t") { result += "\\t"; continue; }
      if (code < 0x20) { result += "\\u" + code.toString(16).padStart(4, "0"); continue; }
    }

    result += ch;
  }

  return result;
}

function sanitizeUnescapedQuotes(s: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        inString = true;
        result += ch;
      } else {
        let j = i + 1;
        while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === "\n" || s[j] === "\r")) j++;
        const next = j < s.length ? s[j] : "";
        if (next === "" || next === "," || next === ":" || next === "}" || next === "]") {
          inString = false;
          result += ch;
        } else {
          result += '\\"';
        }
      }
      continue;
    }

    result += ch;
  }

  return result;
}

function repairTruncatedJSON(s: string): string {
  let repaired = s;

  repaired = repaired.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*$/, "");
  repaired = repaired.replace(/(\{)\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*$/, "$1");
  repaired = repaired.replace(/,\s*"(?:[^"\\]|\\.)*$/, "");
  repaired = repaired.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, "");
  repaired = repaired.replace(/,\s*$/, "");

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const ch of repaired) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, "");
  while (stack.length > 0) repaired += stack.pop()!;

  return repaired;
}

function salvageBatchEntries(raw: string): AIWikiResponse | null {
  const batchMatch = raw.match(/"batch"\s*:\s*\[/);
  if (!batchMatch || batchMatch.index === undefined) return null;

  const batchStart = batchMatch.index + batchMatch[0].length;

  let mcEntityId: string | undefined;
  const mcMatch = raw.match(/"mc_entity_id"\s*:\s*"([^"]+)"/);
  if (mcMatch) mcEntityId = mcMatch[1];

  const entries: AIWikiChapterData[] = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let objStart = -1;

  for (let i = batchStart; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;

    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const objStr = raw.slice(objStart, i + 1);
        const parsed = tryParseJSON(objStr);
        if (parsed && typeof (parsed as Record<string, unknown>).chapter_index === "number") {
          entries.push(validateChapterData(parsed as unknown as AIWikiChapterData));
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  if (entries.length === 0) return null;

  const result: AIWikiResponse = { batch: entries } as AIWikiResponse;
  if (mcEntityId) (result as Record<string, unknown>).mc_entity_id = mcEntityId;

  const mcStatsMatch = raw.match(/"mc_stats"\s*:\s*\[/);
  if (mcStatsMatch && mcStatsMatch.index !== undefined) {
    const statsStart = mcStatsMatch.index + mcStatsMatch[0].length;
    const statsEnd = raw.indexOf("]", statsStart);
    if (statsEnd !== -1) {
      const statsStr = "[" + raw.slice(statsStart, statsEnd + 1);
      const statsParsed = tryParseJSON(statsStr);
      if (Array.isArray(statsParsed)) {
        (result as Record<string, unknown>).mc_stats = statsParsed;
      }
    }
  }

  return result;
}

