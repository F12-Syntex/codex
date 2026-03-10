/* ── AI Style Dictionary — consistency across formatted chapters ── */

function generateId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Types ──────────────────────────────────────────

export interface StyleRule {
  id: string;
  pattern: string;           // semantic trigger, e.g. "XP gains", "Health stat"
  component: string;         // CSS component, e.g. "ai-fmt-xp-badge"
  exampleHtml: string;       // rendered HTML snippet
  category: string;          // free-form: "stat", "badge", "dialogue", "item", etc.
}

export interface StyleDictionary {
  rules: StyleRule[];
  /** characterName (lowercase) → dialogue CSS class, for visual consistency across chapters */
  characterStyles?: Record<string, string>;
  bookTitle: string;
  updatedAt: string;
}

// ── Class → category mapping ───────────────────────

const CLASS_CATEGORY: Record<string, string> = {
  "ai-fmt-stat-block": "stat",
  "ai-fmt-stat-row": "stat",
  "ai-fmt-stat-label": "stat",
  "ai-fmt-stat-value": "stat",
  "ai-fmt-xp-badge": "badge",
  "ai-fmt-system-msg": "system",
  "ai-fmt-item-card": "item",
  "ai-fmt-item-name": "item",
  "ai-fmt-status-badge": "badge",
  "ai-fmt-status-buff": "badge",
  "ai-fmt-status-debuff": "badge",
  "ai-fmt-dialogue-villain": "dialogue",
  "ai-fmt-dialogue-divine": "dialogue",
  "ai-fmt-dialogue-hero": "dialogue",
  "ai-fmt-thought": "effect",
  "ai-fmt-sfx": "effect",
  "ai-fmt-reveal": "effect",
};

// Rarity classes map to "item" category
const RARITY_CLASSES = [
  "ai-fmt-rarity-common",
  "ai-fmt-rarity-uncommon",
  "ai-fmt-rarity-rare",
  "ai-fmt-rarity-epic",
  "ai-fmt-rarity-legendary",
];
for (const r of RARITY_CLASSES) CLASS_CATEGORY[r] = "item";

// ── Class → human-readable pattern ─────────────────

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

// ── Category inference for unknown classes ─────────

function inferCategory(cls: string): string {
  const name = cls.replace("ai-fmt-", "");
  if (name.includes("stat") || name.includes("row") || name.includes("label") || name.includes("value")) return "stat";
  if (name.includes("badge") || name.includes("buff") || name.includes("debuff") || name.includes("status") || name.includes("xp")) return "badge";
  if (name.includes("dialogue") || name.includes("speech") || name.includes("quote")) return "dialogue";
  if (name.includes("item") || name.includes("card") || name.includes("rarity")) return "item";
  if (name.includes("system") || name.includes("msg") || name.includes("notification")) return "system";
  // Default: use the first segment as category
  const firstSegment = name.split("-")[0];
  return firstSegment || "effect";
}

// ── Extraction ─────────────────────────────────────

/**
 * Scan formatted HTML for ai-fmt-* classes and extract style rules.
 * Compares original and formatted paragraphs to find changes.
 */
export function extractRulesFromFormatted(
  originals: string[],
  formatted: string[],
): StyleRule[] {
  const rules: StyleRule[] = [];
  const seenComponents = new Set<string>();

  for (let i = 0; i < formatted.length; i++) {
    const html = formatted[i];
    if (!html || html === originals[i]) continue;

    // Find all ai-fmt-* classes in this paragraph
    const classMatches = html.matchAll(/class="([^"]*)"/g);
    for (const match of classMatches) {
      const classes = match[1].split(/\s+/).filter(c => c.startsWith("ai-fmt-"));
      for (const cls of classes) {
        // Skip icon classes and sub-components (stat-row, stat-label, stat-value)
        if (cls.startsWith("ai-fmt-icon")) continue;
        if (["ai-fmt-stat-row", "ai-fmt-stat-label", "ai-fmt-stat-value", "ai-fmt-item-name"].includes(cls)) continue;

        if (seenComponents.has(cls)) continue;
        seenComponents.add(cls);

        const category = CLASS_CATEGORY[cls] ?? inferCategory(cls);
        const pattern = CLASS_PATTERN[cls] ?? cls.replace("ai-fmt-", "").replace(/-/g, " ");

        // Extract a trimmed example (first 300 chars of the formatted paragraph)
        const example = html.length > 300 ? html.slice(0, 300) + "..." : html;

        rules.push({
          id: generateId(),
          pattern,
          component: cls,
          exampleHtml: example,
          category,
        });
      }
    }
  }

  return rules;
}

// ── Merging ────────────────────────────────────────

/**
 * Merge new rules into existing dictionary rules.
 * Deduplicates by component class — keeps newest example.
 */
export function mergeRules(
  existing: StyleRule[],
  newRules: StyleRule[],
): StyleRule[] {
  const map = new Map<string, StyleRule>();

  // Existing rules first
  for (const rule of existing) {
    map.set(rule.component, rule);
  }

  // New rules overwrite examples but keep existing IDs
  for (const rule of newRules) {
    const prev = map.get(rule.component);
    if (prev) {
      map.set(rule.component, { ...prev, exampleHtml: rule.exampleHtml });
    } else {
      map.set(rule.component, rule);
    }
  }

  return Array.from(map.values());
}

// ── Character style extraction ──────────────────────

/**
 * Scan formatted HTML for dialogue spans and extract character → class mappings.
 * Looks for: <span class="ai-fmt-dialogue-*">CharacterName</span>
 */
export function extractCharacterStyles(formatted: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const html of formatted) {
    if (!html) continue;
    for (const m of html.matchAll(/<span\s+class="(ai-fmt-dialogue-[^"\s]+)"[^>]*>([^<]+)<\/span>/g)) {
      const cls = m[1];
      const name = m[2].trim().toLowerCase();
      if (name && name.length > 0 && name.length < 60) {
        result[name] = cls;
      }
    }
  }
  return result;
}

/**
 * Merge character styles — existing wins (first assignment wins for visual consistency).
 */
export function mergeCharacterStyles(
  existing: Record<string, string> = {},
  incoming: Record<string, string>,
): Record<string, string> {
  return { ...incoming, ...existing };
}

// ── Style context for AI prompt ────────────────────

/**
 * Build a prompt addendum describing established style rules.
 * This gets appended to the system prompt so the AI follows existing patterns.
 */
export function buildStyleContext(dict: StyleDictionary): string {
  const parts: string[] = [];

  if (dict.rules.length > 0) {
    const ruleDescriptions = dict.rules.map(r => {
      const shortExample = r.exampleHtml.length > 150
        ? r.exampleHtml.slice(0, 150) + "..."
        : r.exampleHtml;
      return `- ${r.pattern}: use \`${r.component}\` — example: ${shortExample}`;
    }).join("\n");
    parts.push(`# ESTABLISHED STYLE RULES (follow these for consistency)\nThis book has already been partially formatted. Follow these established patterns:\n${ruleDescriptions}\n\nMaintain consistency with these choices. Use the same classes for the same types of content.`);
  }

  if (dict.characterStyles && Object.keys(dict.characterStyles).length > 0) {
    const assignments = Object.entries(dict.characterStyles)
      .map(([name, cls]) => `- "${name}": ALWAYS use \`${cls}\``)
      .join("\n");
    parts.push(`# CHARACTER DIALOGUE CLASSES — CRITICAL: never change these, always use exactly these classes for these characters\n${assignments}`);
  }

  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : "";
}

// ── Persistence ────────────────────────────────────

const STORAGE_PREFIX = "styleDictionary:";

export async function loadDictionary(filePath: string): Promise<StyleDictionary | null> {
  const raw = await window.electronAPI?.getSetting(`${STORAGE_PREFIX}${filePath}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StyleDictionary;
  } catch {
    return null;
  }
}

export async function saveDictionary(filePath: string, dict: StyleDictionary): Promise<void> {
  await window.electronAPI?.setSetting(
    `${STORAGE_PREFIX}${filePath}`,
    JSON.stringify(dict),
  );
}
