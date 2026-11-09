/**
 * Knowledge prompts (owner: WS-B). Moved from `src/lib/ai-wiki-prompt.ts`; the context now comes
 * from `context.ts` (budgeted, frontier-gated, mention-ranked) instead of the whole entity index,
 * and chapters are always shown as "Chapter <label>" with the 0-based `chapter_index` echoed back.
 */

/** Bump when the ingest prompt or response handling changes (task version). */
export const INGEST_PROMPT_VERSION = 1;

/** Per-chapter text budget before truncation. */
export const CHAPTER_TEXT_BUDGET = 160_000;
/** Budget for the knowledge context sent with each chapter. */
export const INGEST_CONTEXT_BUDGET = 24_000;

export const INGEST_SYSTEM_PROMPT = `You are a literary analyst building a comprehensive progressive wiki/encyclopedia for a book. You extract ALL meaningful entities (characters, items, locations, events, concepts) and their relationships from the chapter text, tracking story arcs, chapter summaries, and the full web of connections between things.

## Core Rules
- Chapters are shown as "Chapter <label>" (the reader-facing number). Echo the given chapter_index exactly; never use the label as an index
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

export function buildIngestUserPrompt(input: {
  bookTitle: string;
  chapterIndex: number;
  label: string;
  chapterTitle?: string;
  text: string;
  context: string;
}): string {
  const text = input.text.slice(0, CHAPTER_TEXT_BUDGET);
  const title = input.chapterTitle ? ` — ${input.chapterTitle}` : "";
  let prompt = `Book: "${input.bookTitle}"\n\n`;
  if (input.context) prompt += `${input.context}\n\n`;
  prompt += `## Chapter ${input.label}${title} (chapter_index: ${input.chapterIndex})\n${text}\n\n`;
  prompt += `Extract ALL entities and relationships from Chapter ${input.label}. Be thorough — do not skip minor characters or named items. ALWAYS check the entities and the Entity index above before creating new entries; use their ids. Update existing entities with new details. Track story arcs. Return a batch array with exactly one entry, with chapter_index ${input.chapterIndex}.`;
  return prompt;
}

// ── "Previously on…" recap (F1) ─────────────────────────────────────────────

export const RECAP_PROMPT_VERSION = 1;

export function buildRecapSystemPrompt(bookTitle: string, lastLabel: string): string {
  return [
    `You write a "Previously on…" recap for a returning reader of "${bookTitle}".`,
    `Use ONLY the provided chapter summaries, excerpts and entities. Never mention, hint at or speculate about anything after Chapter ${lastLabel}.`,
    "Present tense. 4–6 bullets of at most 25 words each, in story order, most recent last.",
    `Then "leftOff": 1–2 sentences on the exact situation at the end of the final excerpt ("Where we left off").`,
    `"entityIds": ids (from the provided entities only) of the characters that matter most for picking the story back up, at most 6.`,
    'Return ONLY JSON: {"bullets": string[], "leftOff": string, "entityIds": string[]}',
  ].join("\n");
}

export function buildRecapUserPrompt(input: { context: string; excerpts: { label: string; text: string }[]; lastParagraphs: string[] }): string {
  let p = input.context ? `${input.context}\n\n` : "";
  for (const ex of input.excerpts) p += `## Excerpt from Chapter ${ex.label}\n${ex.text}\n\n`;
  if (input.lastParagraphs.length) p += `## The last paragraphs the reader read\n${input.lastParagraphs.join("\n\n")}\n\n`;
  p += "Write the recap now.";
  return p;
}

// ── "Who's this?" lookup for names not in the wiki (F2) ─────────────────────

export const LOOKUP_PROMPT_VERSION = 1;

export function buildLookupSystemPrompt(lastLabel: string): string {
  return [
    `Using ONLY the passages below (all from chapters up to Chapter ${lastLabel}), identify who or what the named thing is, in at most 2 sentences.`,
    "Never speculate about later events. If the passages are insufficient, say so plainly and use confidence 0.",
    'Return ONLY JSON: {"name": string, "type": "character"|"item"|"location"|"event"|"concept", "description": string, "confidence": number (0-1), "refs": string[] (ids of the passages you used)}',
  ].join("\n");
}

export function buildLookupUserPrompt(name: string, passages: { id: string; label: string; text: string }[], context: string): string {
  let p = context ? `${context}\n\n` : "";
  p += `Name: "${name}"\n\n## Passages\n`;
  for (const ps of passages) p += `[${ps.id}] (Chapter ${ps.label}) ${ps.text}\n\n`;
  return p;
}
