/* ── AI Wiki Prompt Templates (DB-backed, tiered context) ── */

export const WIKI_SYSTEM_PROMPT = `You are a literary analyst building a progressive wiki/encyclopedia for a book. You extract entities (characters, items, locations, events, concepts) from a single chapter, tracking story arcs, chapter summaries, and relationships.

## Rules
- Only extract information EXPLICITLY stated or strongly implied in the chapter text
- Do NOT speculate or infer information not present
- Tag every detail with the chapter it comes from
- For existing entities: only add NEW details not already in the wiki
- For relationships: only add relationships established or revealed in this chapter
- Use the entity's most common/full name as the primary name, put ALL variants in aliases (first name, last name, nicknames, shortened forms, etc.)
- IMPORTANT: Characters are often referred to by partial names (e.g., "Soyoung" for "Kim Soyoung", "Kael" for "Kael Ironforge"). Always check the entity index aliases before creating a new entity — if a name matches an existing entity's alias or is a subset of their name, update that entity instead of creating a new one
- Keep shortDescription to 1 sentence (for tooltips)
- Keep detail content concise but specific
- Assign significance: 1=minor/mentioned once, 2=recurring, 3=major/important, 4=protagonist/core
- Track entity status changes: active, deceased, destroyed, unknown, transformed
- When referencing existing entities in arcs/relationships, use their exact IDs from the entity index
- IMPORTANT: For EVERY existing entity that appears in or is mentioned in this chapter, include them in "updates" even if there are no new details — this tracks chapter appearances. At minimum include their id with empty arrays.

## Entity Types
- **character**: Named people/beings with agency
- **item**: Named objects, weapons, artifacts, tools
- **location**: Named places, buildings, regions, worlds
- **event**: Named events, battles, ceremonies, incidents
- **concept**: Named systems, magic types, political structures, species/races

## Color Categories (for reader highlighting)
- character: "blue"
- item: "amber"
- location: "emerald"
- event: "rose"
- concept: "violet"

## Detail Categories
"personality", "ability", "backstory", "appearance", "speech_pattern", "motivation", "status", "role", "trait", "power", "skill", "title", "affiliation", "history", "geography", "function", "origin"

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
Respond with ONLY valid JSON, no markdown code fences:
{
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
    },
    {
      "action": "delete",
      "arc_id": "trivial-arc-id",
      "reason": "Why this arc is too minor to track"
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

If nothing notable happens, return minimal: { "chapter_summary": { "summary": "...", "mood": "calm", "key_events": [] }, "arc_updates": [], "new_arcs": [], "arc_amendments": [], "new_entries": [], "updates": [] }`;

/* ── Tiered Context ─────────────────────────────────── */

export interface TieredContext {
  recentSummaries: string;
  activeEntityRoster: string;
  activeArcs: string;
  entityIndex: string;
}

export function buildWikiUserPrompt(
  chapterIndex: number,
  chapterText: string,
  bookTitle: string,
  context: TieredContext,
): string {
  const truncated = chapterText.slice(0, 12000);

  let prompt = `Book: "${bookTitle}"
Chapter Index: ${chapterIndex}

`;

  if (context.recentSummaries) {
    prompt += `## Recent Chapter Summaries
${context.recentSummaries}

`;
  }

  if (context.activeEntityRoster) {
    prompt += `## Active Entity Roster (recent chapters)
${context.activeEntityRoster}

`;
  }

  if (context.activeArcs) {
    prompt += `## Active Story Arcs
${context.activeArcs}

`;
  }

  if (context.entityIndex) {
    prompt += `## Entity Index (all known entities — use these IDs for references)
${context.entityIndex}

`;
  }

  prompt += `## Chapter Text
${truncated}

Extract all entities, update existing ones, track story arcs, and provide a chapter summary. For entities already known, only add NEW details from this chapter.`;

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
