/* ── AI Wiki Prompt Templates ──────────────────────────── */

export const WIKI_SYSTEM_PROMPT = `You are a literary analyst building a progressive wiki/encyclopedia for a book. You extract entities (characters, items, locations, events, concepts) from a single chapter, given the existing wiki state so far.

## Rules
- Only extract information that is EXPLICITLY stated or strongly implied in the chapter text
- Do NOT speculate or infer information not present
- Tag every detail with the chapter it comes from
- For existing entities: only add NEW details not already in the wiki
- For relationships: only add relationships established or revealed in this chapter
- Use the entity's most common name as the primary name, put variants in aliases
- Keep shortDescription to 1 sentence (for tooltips)
- Keep detail content concise but specific
- Assign appropriate categories: "personality", "ability", "backstory", "appearance", "speech_pattern", "motivation", "status", "role", "trait", "power", "skill", "title", "affiliation", etc.

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

## Response Format
Respond with ONLY valid JSON, no markdown code fences:
{
  "new_entries": [
    {
      "id": "kebab-case-slug",
      "name": "Display Name",
      "type": "character|item|location|event|concept",
      "aliases": ["Alt Name", "Title"],
      "shortDescription": "One-line summary for tooltips",
      "description": "Full wiki description in markdown",
      "firstAppearance": <chapter_index>,
      "details": [
        {
          "chapterIndex": <chapter_index>,
          "content": "What is revealed/happens",
          "category": "personality|ability|backstory|appearance|speech_pattern|motivation|status|role|trait|power|skill|title|affiliation"
        }
      ],
      "relationships": [
        {
          "targetId": "other-entity-slug",
          "relation": "ally|enemy|mentor|student|parent|child|sibling|friend|rival|subordinate|leader|owner|creator|member",
          "since": <chapter_index>
        }
      ],
      "color": "blue|amber|emerald|rose|violet"
    }
  ],
  "updates": [
    {
      "id": "existing-entity-slug",
      "newAliases": ["Any New Aliases"],
      "descriptionAppend": "Additional description text to append (or empty string)",
      "details": [
        {
          "chapterIndex": <chapter_index>,
          "content": "New information revealed in this chapter",
          "category": "category"
        }
      ],
      "relationships": [
        {
          "targetId": "other-entity-slug",
          "relation": "relation type",
          "since": <chapter_index>
        }
      ]
    }
  ]
}

If no entities are found, return: { "new_entries": [], "updates": [] }`;

export function buildWikiUserPrompt(
  chapterIndex: number,
  chapterText: string,
  bookTitle: string,
  existingWikiSummary: string,
): string {
  const truncated = chapterText.slice(0, 12000);

  let prompt = `Book: "${bookTitle}"
Chapter Index: ${chapterIndex}

`;

  if (existingWikiSummary) {
    prompt += `## Existing Wiki State
${existingWikiSummary}

`;
  }

  prompt += `## Chapter Text
${truncated}

Extract all entities (characters, items, locations, events, concepts) from this chapter. For entities already in the wiki, only add NEW details revealed in this chapter.`;

  return prompt;
}

/**
 * Build a compact summary of existing wiki state for the AI prompt.
 * This avoids sending the full wiki JSON and keeps the prompt size manageable.
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
