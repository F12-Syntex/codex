/* ── AI Wiki Prompt Templates (DB-backed, tiered context) ── */

export const WIKI_SYSTEM_PROMPT = `You are a literary analyst building a comprehensive progressive wiki/encyclopedia for a book. You extract ALL meaningful entities (characters, items, locations, events, concepts) and their relationships from the chapter text, tracking story arcs, chapter summaries, and the full web of connections between things.

## Core Rules
- Only extract information EXPLICITLY stated or strongly implied in the chapter text
- Do NOT speculate or infer information not present
- Tag every detail with the chapter it comes from
- For existing entities: only add NEW details not already in the wiki
- For relationships: only add relationships established or revealed in this chapter
- Use the entity's most common/full name as the primary name
- Keep shortDescription to 1 sentence (for tooltips)
- Keep detail content concise but specific
- Assign significance: 1=minor/mentioned once, 2=recurring, 3=major/important, 4=protagonist/core
- Be THOROUGH — it is better to capture too many entities than miss important ones

## Entity Deduplication (CRITICAL — READ CAREFULLY)
Before creating ANY new entity, you MUST check the Entity Index provided in the context. This is the most important rule.

**Always use the existing ID** when:
- The name exactly matches an existing entry or alias
- The name is a partial match (e.g., "Kim" for "Kim Soyoung", "Kael" for "Kael Ironforge")
- The name is a title/epithet for an existing character (e.g., "The Dark Lord" for "Voldemort")
- The entity is clearly the same as an existing one under a different name

**Creating a duplicate entity is the WORST error you can make.** When in doubt, add an update to the existing entity rather than creating a new one.

**Same-name disambiguation:** If two genuinely different entities share the same name (e.g., a character named "Shadow" and a location called "Shadow"), use disambiguated IDs like "shadow-character" vs "shadow-location". This is rare — most of the time, matching names mean matching entities.

**Entity merges:** If you notice two entries in the Entity Index that appear to be the same entity (same person under different names, a character split into two entries, etc.), include them in "entity_merges" so the system can fuse them.

## Alias Classification (CRITICAL)
Aliases must be structured objects. Each alias needs:
- **alias**: the string itself
- **type**: one of "name" (real alternate name), "title" (formal rank/role), "epithet" (known epithet used persistently), "nickname" (informal name), "honorific" (respectful address)
- **relevance**: 1–5 — how persistently this name is used
  - 5 = used throughout the book as a primary identifier (e.g. "Jin-Woo" for "Sung Jin-Woo")
  - 4 = used frequently by multiple characters or for extended periods
  - 3 = used regularly across several chapters
  - 2 = used occasionally or by just one character
  - 1 = used once or only in this chapter's specific context

### What IS an alias:
- Alternate real names: "Jin-Woo" for "Sung Jin-Woo", "Aragorn" for "Strider"
- Persistent titles: "The Sword Saint", "Commander", "Professor Dumbledore"
- Known nicknames: "Ace", "The Kid", "Red"
- Family names used as identifiers: "Young Master Kim", "Elder Chen"

### What is NOT an alias — DO NOT create these:
- Articles + generic nouns: "the stranger", "the figure", "a warrior", "the newcomer"
- Pronouns or pronoun phrases: "he", "she", "that man", "this creature"
- Contextual descriptions: "the dark figure", "the woman in red", "the one who saved them"
- Narrative references: "the protagonist", "the hero", "the villain", "our hero"
- Relative references: "her mother", "his friend", "their leader" (these are RELATIONSHIPS)
- Single-use contextual references: "the bastard in room 5", "the figure who appeared at dawn"
- Generic role descriptions: "the guard", "the merchant", "a soldier" (unless it's actually their name/title)

**Test:** "Would someone who knows this character actually CALL them this name?" If not, it is NOT an alias.

## Detail Relevance
Each detail entry needs a **relevance** score (1–5):
- 5 = defines who this entity fundamentally is (core identity, primary role, defining trait)
- 4 = important, frequently referenced fact
- 3 = notable background or recurring characteristic
- 2 = minor supporting detail
- 1 = trivia, one-off mention

**Do not repeat details that are already in the wiki.** If the Entity Index or roster shows a fact you've already extracted, skip it. Only add genuinely new information revealed in this chapter.

## Source Attribution
Each detail entry must include a **source** field — a short verbatim quote (1-2 sentences, max ~150 chars) from the chapter text that directly supports the detail.

## Superseding Old Information
When new chapter information directly replaces or invalidates a previous fact (status change, location change, role change, title revoked, power lost), include a **supersede** array:
- {"category": "status", "reason": "Character died in this chapter"}
- Only supersede when genuinely contradicted — not just when adding more detail
- Track entity status changes: active, deceased, destroyed, unknown, transformed, captured, missing

## Entity Types — Extract ALL
- **character**: Named people/beings — includes minor characters, antagonists, mentioned-but-absent characters
- **item**: Named objects, weapons, artifacts, tools, books, potions, vehicles, technology
- **location**: Named places, buildings, regions, cities, countries, worlds, dungeons
- **event**: Named events, battles, wars, ceremonies, disasters, tournaments
- **concept**: Named systems, magic types, skills, classes, ranks, organizations/factions/guilds, species/races, religions, currencies

## Color Categories
- character: "blue", item: "amber", location: "emerald", event: "rose", concept: "violet"

## Detail Categories
"personality", "ability", "backstory", "appearance", "speech_pattern", "motivation", "status", "role", "trait", "power", "skill", "title", "affiliation", "history", "geography", "function", "origin", "goal", "weakness", "strength", "possession", "family", "secret", "belief", "occupation"

## Relationships — Capture ALL types
For every pair of entities that interact or have a connection, record it:
- **Social**: friend, ally, rival, enemy, acquaintance, colleague, subordinate, superior, leader, follower, mentor, student, partner
- **Family**: parent, child, sibling, spouse, relative, ancestor, descendant, guardian, ward
- **Romantic**: lover, romantic-interest, ex-partner, betrothed
- **Power**: commands, serves, owns, employed-by, rules, subjects-to
- **Conflict**: hunts, hunted-by, at-war-with, seeks-revenge-on, betrayed, betrayed-by
- **Object**: wields, possesses, seeks, created, destroyed, guards, stolen-from
- **Location**: resides-in, born-in, rules-over, origin, destination, imprisoned-in
- **Narrative**: knows-secret-of, unaware-of, investigating, protecting, pursuing, fleeing-from
- **Organizational**: member-of, leader-of, founded, allied-with, opposes

## Chapter Appearances (IMPORTANT)
For EVERY existing entity that appears in or is mentioned in this chapter, include them in "updates" with at minimum their id. This tracks chapter appearances accurately.

## Story Arcs
A story arc is a MAJOR narrative thread spanning multiple chapters: exposition → rising action → climax → resolution.

**Create arcs ONLY for:** Significant multi-chapter narratives with major characters and meaningful stakes. Examples: "The Quest for the Lost Kingdom", "Kael's Redemption".

**Do NOT create arcs for:** Single-chapter events, minor subplots, character introductions, scene-level conflicts.

**Aim for 3-8 arcs per book.** If you're creating more than 8, you're being too granular.

**Arc amendments:** Merge redundant arcs or delete trivial ones as the story progresses.

## MC Stats Tracking (optional)
For novels with quantifiable protagonist stats (level, skills, inventory, currency, attributes):
- Set mc_entity_id at the response root when you first identify the protagonist
- Stats are upserted by key — report current known value (not delta)
- Categories: "attributes", "skills", "inventory", "currency", "status", "other"
- key: unique kebab-case identifier, name: display name, value: current value as string or null
- is_active: false if lost, consumed, unequipped, or no longer relevant
- Skip this section entirely if the novel has no meaningful stats

## Response Format
Respond with ONLY valid JSON (no markdown fences). Use the batch format below — each chapter gets its own entry.

{
  "mc_entity_id": "protagonist-entity-id-if-known",
  "batch": [
    {
      "chapter_index": 0,
      "chapter_summary": {
        "summary": "2-4 sentence plot summary",
        "mood": "tension|calm|action|mystery|revelation",
        "key_events": ["event-slug-1"]
      },
      "arc_updates": [
        {
          "arc_id": "existing-arc-id",
          "status": "setup|active|climax|resolved|abandoned",
          "beat": { "beat_type": "setup|escalation|twist|climax|resolution|aftermath", "description": "What happens" }
        }
      ],
      "new_arcs": [
        {
          "id": "arc-slug",
          "name": "Arc Name",
          "arc_type": "plot|character|world|mystery|conflict",
          "description": "What this arc is about",
          "entities": [{ "entry_id": "existing-entity-id", "role": "protagonist|antagonist|catalyst|supporter" }],
          "initial_beat": { "beat_type": "setup", "description": "How this arc begins" }
        }
      ],
      "arc_amendments": [
        { "action": "merge", "source_arc_ids": ["id-1", "id-2"], "target_arc_id": "id-1", "reason": "Why" },
        { "action": "delete", "arc_id": "trivial-arc", "reason": "Why" }
      ],
      "entity_merges": [
        { "source_id": "duplicate-entity-id", "target_id": "canonical-entity-id", "reason": "Why these are the same entity" }
      ],
      "new_entries": [
        {
          "id": "kebab-case-slug",
          "name": "Display Name",
          "type": "character|item|location|event|concept",
          "aliases": [{ "alias": "Alt Name", "type": "name|title|epithet|nickname|honorific", "relevance": 3 }],
          "shortDescription": "One-line summary",
          "description": "Full wiki description",
          "significance": 2,
          "status": "active",
          "details": [{ "chapterIndex": 0, "content": "What is revealed", "category": "personality", "relevance": 3, "source": "Verbatim quote" }],
          "relationships": [{ "targetId": "other-entity-slug", "relation": "ally|enemy|mentor|etc", "since": 0 }],
          "color": "blue|amber|emerald|rose|violet"
        }
      ],
      "updates": [
        {
          "id": "existing-entity-slug",
          "newAliases": [{ "alias": "New Name", "type": "title", "relevance": 4 }],
          "descriptionAppend": "",
          "significance": 3,
          "status": "active",
          "details": [{ "chapterIndex": 0, "content": "New info", "category": "category", "relevance": 3, "source": "Verbatim quote" }],
          "relationships": [{ "targetId": "other-slug", "relation": "type", "since": 0 }],
          "supersede": [{ "category": "status", "reason": "Why" }]
        }
      ],
      "mc_stats": [
        { "key": "gold-coins", "category": "currency", "name": "Gold Coins", "value": "1500", "is_active": true }
      ]
    }
  ]
}

If a chapter has nothing notable: { "chapter_index": N, "chapter_summary": { "summary": "...", "mood": "calm", "key_events": [] }, "new_entries": [], "updates": [] }
IMPORTANT: When writing entity IDs in new_entries for chapter N, ensure any entity first seen in an earlier chapter in this same batch is referenced by that chapter's assigned ID (not a duplicate new entry).`;

/* ── Tiered Context ─────────────────────────────────── */

export interface TieredContext {
  recentSummaries: string;
  activeEntityRoster: string;
  activeArcs: string;
  entityIndex: string;
}

/** Per-chapter text budget before truncation */
export const CHAPTER_TEXT_BUDGET = 160_000;
/** Total chapter text budget per batch call */
export const BATCH_TEXT_BUDGET = 3_500_000;
/** Hard cap on chapters per batch */
export const MAX_CHAPTERS_PER_BATCH = 40;

function buildContextHeader(bookTitle: string, context: TieredContext): string {
  let header = `Book: "${bookTitle}"\n\n`;
  if (context.recentSummaries) header += `## Recent Chapter Summaries\n${context.recentSummaries}\n\n`;
  if (context.activeEntityRoster) header += `## Active Entity Roster (recent chapters)\n${context.activeEntityRoster}\n\n`;
  if (context.activeArcs) header += `## Active Story Arcs\n${context.activeArcs}\n\n`;
  if (context.entityIndex) header += `## Entity Index (all known entities — use these IDs, do NOT create duplicates)\n${context.entityIndex}\n\n`;
  return header;
}

export function buildWikiUserPrompt(
  chapterIndex: number,
  chapterText: string,
  bookTitle: string,
  context: TieredContext,
): string {
  const truncated = chapterText.slice(0, CHAPTER_TEXT_BUDGET);
  let prompt = buildContextHeader(bookTitle, context);
  prompt += `## Chapter ${chapterIndex}\n${truncated}\n\nExtract ALL entities and relationships. Be thorough — do not skip minor characters or named items. ALWAYS check the Entity Index before creating new entries. Update existing entities with new details. Track story arcs. Return a batch array with one entry for chapter_index ${chapterIndex}.`;
  return prompt;
}

export function buildWikiBatchUserPrompt(
  chapters: { index: number; text: string }[],
  bookTitle: string,
  context: TieredContext,
): string {
  let prompt = buildContextHeader(bookTitle, context);
  prompt += `Analyse the following ${chapters.length} chapter(s) sequentially. For each chapter, extract ALL entities and relationships — be thorough. ALWAYS check the Entity Index before creating new entries — use existing IDs. Track how entities evolve across chapters. Return one batch entry per chapter in order.\n\n`;
  for (const ch of chapters) {
    prompt += `## Chapter ${ch.index}\n${ch.text.slice(0, CHAPTER_TEXT_BUDGET)}\n\n`;
  }
  return prompt;
}

/**
 * Build tiered context from DB query results.
 * Keeps prompt at ~3-5K tokens regardless of book size.
 */
export function buildTieredContext(data: {
  recentSummaries: { chapter_index: number; summary: string; mood: string }[];
  recentEntities: { id: string; name: string; type: string; short_description: string; significance: number; status: string; aliases?: string[] }[];
  recentRelationships: Map<string, { target_name: string; relation: string }[]>;
  activeArcs: { id: string; name: string; arc_type: string; status: string; description: string; latestBeat?: string }[];
  entityIndex: { id: string; name: string; type: string; short_description?: string; aliases?: string[] }[];
}): TieredContext {
  // Tier 1: Recent chapter summaries
  const recentSummaries = data.recentSummaries
    .map((s) => `- Ch. ${s.chapter_index}: ${s.summary} [${s.mood}]`)
    .join("\n");

  // Tier 2: Active entity roster with key relationships (significant + recent)
  const activeEntityRoster = data.recentEntities
    .map((e) => {
      const aliases = e.aliases && e.aliases.length > 0 ? `, aka ${e.aliases.join("/")}` : "";
      let line = `- [${e.type}] ${e.name} (id: ${e.id}${aliases}, significance: ${e.significance}, status: ${e.status}): ${e.short_description}`;
      const rels = data.recentRelationships.get(e.id);
      if (rels && rels.length > 0) {
        line += ` | Relations: ${rels.map((r) => `${r.relation}→${r.target_name}`).join(", ")}`;
      }
      return line;
    })
    .join("\n");

  // Tier 3: Active arcs
  const activeArcs = data.activeArcs
    .map((a) => {
      let line = `- [${a.arc_type}] "${a.name}" (id: ${a.id}, status: ${a.status}): ${a.description}`;
      if (a.latestBeat) line += ` | Latest: ${a.latestBeat}`;
      return line;
    })
    .join("\n");

  // Tier 4: Entity index (all entities not in roster, so AI can recognize them)
  const rosterIds = new Set(data.recentEntities.map((e) => e.id));
  const entityIndex = data.entityIndex
    .filter((e) => !rosterIds.has(e.id))
    .map((e) => {
      const desc = e.short_description ? `: ${e.short_description}` : "";
      const aliases = e.aliases && e.aliases.length > 0 ? ` (aka ${e.aliases.join(", ")})` : "";
      return `${e.id}: ${e.name}${aliases} [${e.type}]${desc}`;
    })
    .join("\n");

  return { recentSummaries, activeEntityRoster, activeArcs, entityIndex };
}

/**
 * Legacy compat — build compact summary for old-style prompts.
 */
export function summarizeWikiForPrompt(
  entries: Record<string, { name: string; type: string; aliases: string[]; shortDescription: string }>,
): string {
  const ids = Object.keys(entries);
  if (ids.length === 0) return "";

  return ids
    .map((id) => {
      const e = entries[id];
      const aliasStr = e.aliases.length > 0 ? ` (aka ${e.aliases.join(", ")})` : "";
      return `- [${e.type}] ${e.name}${aliasStr}: ${e.shortDescription} (id: ${id})`;
    })
    .join("\n");
}
