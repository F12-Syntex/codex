/**
 * Style dictionary: extraction, merge and storage (`book_style`), owner WS-D.
 * Ported from `src/lib/ai-style-dictionary.ts`.
 *
 * Fixes AI_AUDIT S1-7: the merge is a synchronous read-modify-write inside one SQLite transaction
 * on main's thread, so concurrent format jobs (current + next chapter, bulk, regeneration) can never
 * lose rules or flip a character's dialogue class. Character styles are first-writer-wins; rules
 * are deduped by component (existing id kept, newest example).
 */

import type { SqlDb } from "../db/sql";
import type { StyleDictionary, StyleRule } from "../shared/ai/types";
import { fnv1a64 } from "./prompts/util";
import { sanitizeHtml } from "../shared/pipeline/sanitize";

const EXAMPLE_MAX = 300;

/** A short example of the component: cut at a tag boundary, then re-sanitized so every open tag
 *  is closed (the dictionary view renders it as HTML; QA-P2-15). */
export function exampleOf(html: string): string {
  if (html.length <= EXAMPLE_MAX) return html;
  let cut = html.slice(0, EXAMPLE_MAX);
  const lt = cut.lastIndexOf("<");
  if (lt > cut.lastIndexOf(">")) cut = cut.slice(0, lt); // never end inside a tag
  return sanitizeHtml(`${cut}…`, "ai-format");
}

// ── Class metadata ──────────────────────────────────────────────────────────

const CLASS_CATEGORY: Record<string, string> = {
  "ai-fmt-stat-block": "stat",
  "ai-fmt-xp-badge": "badge",
  "ai-fmt-system-msg": "system",
  "ai-fmt-item-card": "item",
  "ai-fmt-status-badge": "badge",
  "ai-fmt-status-buff": "badge",
  "ai-fmt-status-debuff": "badge",
  "ai-fmt-dialogue-villain": "dialogue",
  "ai-fmt-dialogue-divine": "dialogue",
  "ai-fmt-dialogue-hero": "dialogue",
  "ai-fmt-thought": "effect",
  "ai-fmt-sfx": "effect",
  "ai-fmt-reveal": "effect",
  "ai-fmt-rarity-common": "item",
  "ai-fmt-rarity-uncommon": "item",
  "ai-fmt-rarity-rare": "item",
  "ai-fmt-rarity-epic": "item",
  "ai-fmt-rarity-legendary": "item",
};

const CLASS_PATTERN: Record<string, string> = {
  "ai-fmt-stat-block": "Stat block",
  "ai-fmt-xp-badge": "XP / numeric badge",
  "ai-fmt-system-msg": "System message",
  "ai-fmt-item-card": "Item card",
  "ai-fmt-status-badge": "Status tag",
  "ai-fmt-status-buff": "Buff tag",
  "ai-fmt-status-debuff": "Debuff tag",
  "ai-fmt-dialogue-villain": "Villain dialogue",
  "ai-fmt-dialogue-divine": "Divine dialogue",
  "ai-fmt-dialogue-hero": "Hero dialogue",
  "ai-fmt-thought": "Internal monologue",
  "ai-fmt-sfx": "Sound effect / emphasis",
  "ai-fmt-reveal": "First-mention highlight",
  "ai-fmt-rarity-common": "Common rarity item",
  "ai-fmt-rarity-uncommon": "Uncommon rarity item",
  "ai-fmt-rarity-rare": "Rare rarity item",
  "ai-fmt-rarity-epic": "Epic rarity item",
  "ai-fmt-rarity-legendary": "Legendary rarity item",
};

/** Sub-components never recorded as rules of their own. */
const SUB_COMPONENTS = new Set(["ai-fmt-stat-row", "ai-fmt-stat-label", "ai-fmt-stat-value", "ai-fmt-item-name"]);

function inferCategory(cls: string): string {
  const name = cls.replace("ai-fmt-", "");
  if (/stat|row|label|value/.test(name)) return "stat";
  if (/badge|buff|debuff|status|xp/.test(name)) return "badge";
  if (/dialogue|speech|quote/.test(name)) return "dialogue";
  if (/item|card|rarity/.test(name)) return "item";
  if (/system|msg|notification/.test(name)) return "system";
  return name.split("-")[0] || "effect";
}

// ── Extraction ──────────────────────────────────────────────────────────────

/** Rules for every ai-fmt-* component used in `formatted` (one per component; id = hash of component). */
export function extractRules(formatted: string[]): StyleRule[] {
  const rules: StyleRule[] = [];
  const seen = new Set<string>();
  for (const html of formatted) {
    if (!html) continue;
    for (const m of html.matchAll(/class="([^"]*)"/g)) {
      for (const cls of m[1].split(/\s+/)) {
        if (!cls.startsWith("ai-fmt-") || cls.startsWith("ai-fmt-icon") || SUB_COMPONENTS.has(cls) || seen.has(cls)) continue;
        seen.add(cls);
        rules.push({
          id: `r${fnv1a64(cls).slice(0, 12)}`,
          pattern: CLASS_PATTERN[cls] ?? cls.replace("ai-fmt-", "").replace(/-/g, " "),
          component: cls,
          exampleHtml: exampleOf(html),
          category: CLASS_CATEGORY[cls] ?? inferCategory(cls),
        });
      }
    }
  }
  return rules;
}

/** Speaker badges → {lowercase name: dialogue class}. */
export function extractCharacterStyles(formatted: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const html of formatted) {
    if (!html) continue;
    for (const m of html.matchAll(/<span\s+class="(ai-fmt-dialogue-[^"\s]+)"[^>]*>([^<]+)<\/span>/g)) {
      const name = m[2].trim().toLowerCase();
      if (name && name.length < 60 && !(name in out)) out[name] = m[1];
    }
  }
  return out;
}

// ── Merge (pure) ────────────────────────────────────────────────────────────

/** Dedupe by component: an existing rule keeps its id/pattern/category and takes the newer example. */
export function mergeRules(existing: StyleRule[], incoming: StyleRule[]): StyleRule[] {
  const map = new Map<string, StyleRule>();
  for (const r of existing) map.set(r.component, r);
  for (const r of incoming) {
    const prev = map.get(r.component);
    map.set(r.component, prev ? { ...prev, exampleHtml: r.exampleHtml } : r);
  }
  return [...map.values()];
}

/** First writer wins, so a character never changes colour between chapters. */
export function mergeCharacterStyles(existing: Record<string, string> = {}, incoming: Record<string, string> = {}): Record<string, string> {
  return { ...incoming, ...existing };
}

export function emptyDictionary(bookTitle = ""): StyleDictionary {
  return { rules: [], bookTitle, updatedAt: new Date(0).toISOString() };
}

export function mergeDictionary(dict: StyleDictionary, formatted: string[], bookTitle: string, now: number): StyleDictionary {
  const characterStyles = mergeCharacterStyles(dict.characterStyles, extractCharacterStyles(formatted));
  return {
    rules: mergeRules(dict.rules, extractRules(formatted)),
    characterStyles: Object.keys(characterStyles).length > 0 ? characterStyles : undefined,
    bookTitle: bookTitle || dict.bookTitle,
    updatedAt: new Date(now).toISOString(),
  };
}

/** Prompt addendum describing the established rules (ported `buildStyleContext`). */
export function buildStyleContext(dict: StyleDictionary): string {
  const parts: string[] = [];
  if (dict.rules.length > 0) {
    const lines = dict.rules
      .map((r) => `- ${r.pattern}: use \`${r.component}\` — example: ${r.exampleHtml.length > 150 ? `${r.exampleHtml.slice(0, 150)}…` : r.exampleHtml}`)
      .join("\n");
    parts.push(`# ESTABLISHED STYLE RULES (follow these for consistency)\nThis book has already been partially formatted. Use the same classes for the same kinds of content:\n${lines}`);
  }
  if (dict.characterStyles && Object.keys(dict.characterStyles).length > 0) {
    const lines = Object.entries(dict.characterStyles).map(([n, c]) => `- "${n}": ALWAYS use \`${c}\``).join("\n");
    parts.push(`# CHARACTER DIALOGUE CLASSES — never change these\n${lines}`);
  }
  return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
}

// ── Storage ─────────────────────────────────────────────────────────────────

export class SqlStyleStore {
  constructor(private readonly db: SqlDb, private readonly now: () => number = Date.now) {}

  get(filePath: string, bookTitle = ""): StyleDictionary {
    const row = this.db.get<{ data: string }>("SELECT data FROM book_style WHERE file_path = ?", [filePath]);
    if (!row) return emptyDictionary(bookTitle);
    try {
      const d = JSON.parse(row.data) as StyleDictionary;
      return { ...d, rules: Array.isArray(d.rules) ? d.rules : [] };
    } catch {
      return emptyDictionary(bookTitle);
    }
  }

  version(filePath: string): number {
    return Number(this.db.get<{ version: number }>("SELECT version FROM book_style WHERE file_path = ?", [filePath])?.version ?? 0);
  }

  /** Atomic read-modify-write. `update` must be synchronous. */
  update(filePath: string, update: (d: StyleDictionary) => StyleDictionary): StyleDictionary {
    return this.db.transaction(() => {
      const next = update(this.get(filePath));
      this.db.run(
        `INSERT INTO book_style (file_path, data, version) VALUES (?, ?, 1)
         ON CONFLICT (file_path) DO UPDATE SET data = excluded.data, version = book_style.version + 1`,
        [filePath, JSON.stringify(next)],
      );
      return next;
    });
  }

  /** Merge the rules and speakers found in freshly formatted paragraphs. */
  mergeFormatted(filePath: string, formatted: string[], bookTitle: string): StyleDictionary {
    return this.update(filePath, (d) => mergeDictionary(d, formatted, bookTitle, this.now()));
  }

  clear(filePath: string): void {
    this.db.run("DELETE FROM book_style WHERE file_path = ?", [filePath]);
  }
}
