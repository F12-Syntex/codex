/* ── AI Wiki Prompt Templates (DB-backed, tiered context) ── */

export const WIKI_SYSTEM_PROMPT = `You are a literary analyst building a comprehensive progressive wiki/encyclopedia for a book. You extract ALL meaningful entities (characters, items, locations, events, concepts) and their relationships from the chapter text, tracking story arcs, chapter summaries, and the full web of connections between things.

## Core Rules
- Only extract information EXPLICITLY stated or strongly implied in the chapter text
- Do NOT speculate or infer information not present
- Tag every detail with the chapter it comes from
- For existing entities: only add NEW details not already in the wiki
- For relationships: only add relationships established or revealed in this chapter
- Use the entity's most common/full name as the primary name, put ALL variants in aliases (first name, last name, nicknames, titles, shortened forms, etc.)
- IMPORTANT: Characters are often referred to by partial names (e.g., "Soyoung" for "Kim Soyoung", "Kael" for "Kael Ironforge"). Always check the entity index aliases before creating a new entity — if a name matches an existing entity's alias or is a subset of their name, update that entity instead of creating a new one
- Keep shortDescription to 1 sentence (for tooltips)
- Keep detail content concise but specific
- Assign significance: 1=minor/mentioned once, 2=recurring, 3=major/important, 4=protagonist/core
- Track entity status changes: active, deceased, destroyed, unknown, transformed, captured, missing
- When referencing existing entities in arcs/relationships, use their exact IDs from the entity index
- IMPORTANT: For EVERY existing entity that appears in or is mentioned in this chapter, include them in "updates" even if there are no new details — this tracks chapter appearances. At minimum include their id with empty arrays.
- Be THOROUGH — it is better to capture too many entities than miss important ones. Extract every named character, place, item, group, and concept.

## Entity Types — Extract ALL of these
- **character**: Named people/beings with agency — includes minor characters, side characters, mentioned-but-not-present characters, antagonists, villains, monsters with names
- **item**: Named objects, weapons, armor, artifacts, tools, books, potions, vehicles, technology, food/drink of significance
- **location**: Named places, buildings, rooms, regions, cities, countries, worlds, dungeons, streets, organizations' headquarters
- **event**: Named events, battles, wars, ceremonies, disasters, tournaments, historical incidents, ongoing conflicts
- **concept**: Named systems, magic types, skills, classes, ranks, political structures, species/races, religions, laws, currencies, techniques, organizations/factions/guilds

## Color Categories (for reader highlighting)
- character: "blue"
- item: "amber"
- location: "emerald"
- event: "rose"
- concept: "violet"

## Detail Categories — Use the most specific one
"personality", "ability", "backstory", "appearance", "speech_pattern", "motivation", "status", "role", "trait", "power", "skill", "title", "affiliation", "history", "geography", "function", "origin", "goal", "weakness", "strength", "possession", "family", "secret", "belief", "occupation"

## Relationships — Capture ALL types
Be exhaustive with relationships. For every pair of entities that interact or have a connection, record it:
- **Social**: friend, ally, rival, enemy, acquaintance, colleague, subordinate, superior, leader, follower, mentor, student, partner
- **Family**: parent, child, sibling, spouse, relative, ancestor, descendant, guardian, ward
- **Romantic**: lover, romantic-interest, ex-partner, betrothed
- **Power**: commands, serves, owns, employed-by, rules, subjects-to
- **Conflict**: hunts, hunted-by, at-war-with, seeks-revenge-on, betrayed, betrayed-by
- **Object relations**: wields, possesses, seeks, created, destroyed, guards, stolen-from
- **Location relations**: resides-in, born-in, rules-over, origin, destination, imprisoned-in
- **Narrative**: knows-secret-of, unaware-of, investigating, protecting, pursuing, fleeing-from
- **Organizational**: member-of, leader-of, founded, allied-with, opposes

## Story Arcs — IMPORTANT
A story arc is a MAJOR narrative thread that spans multiple chapters and follows the classic structure: exposition → rising action → climax → falling action → resolution. Think of it as a macro-level plot line.

**Create a new arc ONLY when:**
- A significant, multi-chapter narrative thread is clearly being established
- It involves major characters and meaningful stakes
- It has a clear dramatic question that needs resolution
- Examples: "The Quest for the Lost Kingdom", "Kael's Redemption", "The War Against the Dark Lord"

**Do NOT create arcs for:**
- Single-chapter events or encounters (those are just events/entities)
- Minor subplots that resolve within 1-2 chapters
- Character introductions or backstory reveals (those are entity details)
- Repeated themes without narrative progression (those are concepts)
- Scene-level conflicts or conversations

**Aim for 3-8 arcs per book.** A typical novel has a main plot arc, 1-3 major subplot arcs, and maybe 1-2 character arcs. If you find yourself creating more than 8, you are being too granular.

**Arc amendments:** You can merge redundant arcs or delete trivial ones as the story progresses. If two arcs are really the same narrative thread, merge them. If an arc turned out to be a minor event, delete it.

## Response Format
You may be asked to analyse one chapter or multiple chapters in a single request. Always respond with ONLY valid JSON using the batch format below (no markdown code fences). Each chapter gets its own entry in the "batch" array.

{
  "batch": [
    {
      "chapter_index": 0,
      "chapter_summary": {
        "summary": "2-4 sentence plot summary of what happens in this chapter",
        "mood": "tension|calm|action|mystery|revelation",
        "key_events": ["event-slug-1"]
      },
      "arc_updates": [
        {
          "arc_id": "existing-arc-id",
          "status": "setup|active|climax|resolved|abandoned",
          "beat": { "beat_type": "setup|escalation|twist|climax|resolution|aftermath", "description": "What happens in this arc beat" }
        }
      ],
      "new_arcs": [
        {
          "id": "arc-slug",
          "name": "Arc Name",
          "arc_type": "plot|character|world|mystery|conflict",
          "description": "What this arc is about — must be a significant multi-chapter narrative thread",
          "entities": [{ "entry_id": "existing-entity-id", "role": "protagonist|antagonist|catalyst|supporter" }],
          "initial_beat": { "beat_type": "setup", "description": "How this arc begins" }
        }
      ],
      "arc_amendments": [
        {
          "action": "merge",
          "source_arc_ids": ["arc-id-1", "arc-id-2"],
          "target_arc_id": "arc-id-1",
          "reason": "Why these arcs are really the same narrative thread"
        }
      ],
      "new_entries": [
        {
          "id": "kebab-case-slug",
          "name": "Display Name",
          "type": "character|item|location|event|concept",
          "aliases": ["Alt Name"],
          "shortDescription": "One-line summary",
          "description": "Full wiki description",
          "significance": 2,
          "status": "active",
          "details": [{ "chapterIndex": 0, "content": "What is revealed", "category": "personality" }],
          "relationships": [{ "targetId": "other-entity-slug", "relation": "ally|enemy|mentor|etc", "since": 0 }],
          "color": "blue|amber|emerald|rose|violet"
        }
      ],
      "updates": [
        {
          "id": "existing-entity-slug",
          "newAliases": [],
          "descriptionAppend": "",
          "significance": 3,
          "status": "active",
          "details": [{ "chapterIndex": 0, "content": "New information", "category": "category" }],
          "relationships": [{ "targetId": "other-slug", "relation": "type", "since": 0 }]
        }
      ]
    }
  ]
}

If a chapter has nothing notable, use minimal: { "chapter_index": N, "chapter_summary": { "summary": "...", "mood": "calm", "key_events": [] }, "arc_updates": [], "new_arcs": [], "arc_amendments": [], "new_entries": [], "updates": [] }
IMPORTANT: When writing entity IDs in new_entries for chapter N, ensure any entity first seen in an earlier chapter in this same batch is referenced by that chapter's assigned ID (not a duplicate new entry).`;

/* ── Tiered Context ─────────────────────────────────── */

export interface TieredContext {
  recentSummaries: string;
  activeEntityRoster: string;
  activeArcs: string;
  entityIndex: string;
}

/** Per-chapter text budget before truncation */
export const CHAPTER_TEXT_BUDGET = 40_000;
/** Total chapter text budget per batch call */
export const BATCH_TEXT_BUDGET = 120_000;

function buildContextHeader(bookTitle: string, context: TieredContext): string {
  let header = `Book: "${bookTitle}"\n\n`;
  if (context.recentSummaries) header += `## Recent Chapter Summaries\n${context.recentSummaries}\n\n`;
  if (context.activeEntityRoster) header += `## Active Entity Roster (recent chapters)\n${context.activeEntityRoster}\n\n`;
  if (context.activeArcs) header += `## Active Story Arcs\n${context.activeArcs}\n\n`;
  if (context.entityIndex) header += `## Entity Index (all known entities — use these IDs for references)\n${context.entityIndex}\n\n`;
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
  prompt += `## Chapter ${chapterIndex}\n${truncated}\n\nExtract ALL entities and relationships. Be thorough — do not skip minor characters or named items. Update existing entities with new details. Track story arcs. Return a batch array with one entry for chapter_index ${chapterIndex}.`;
  return prompt;
}

export function buildWikiBatchUserPrompt(
  chapters: { index: number; text: string }[],
  bookTitle: string,
  context: TieredContext,
): string {
  let prompt = buildContextHeader(bookTitle, context);
  prompt += `Analyse the following ${chapters.length} chapter(s) sequentially. For each chapter, extract ALL entities and relationships — be thorough. Track how entities evolve across chapters. Return one batch entry per chapter in order.\n\n`;
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

  // Tier 4: Entity index with descriptions (so AI can recognize all tracked entities)
  const rosterIds = new Set(data.recentEntities.map((e) => e.id));
  const entityIndex = data.entityIndex
    .filter((e) => !rosterIds.has(e.id)) // skip entities already in roster
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
