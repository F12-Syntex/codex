/* ── AI Buddy — Chat about the book with wiki context ── */

import { chatWithPreset, type OpenRouterMessage } from "./openrouter";
import { loadOverrides } from "./ai-presets";

export interface BuddyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/**
 * Build the system prompt for the AI Buddy.
 * Includes wiki context so the AI knows about characters, arcs, etc.
 */
function buildBuddySystemPrompt(
  bookTitle: string,
  currentChapter: number,
  wikiContext: string,
): string {
  return `You are an AI reading companion for the book "${bookTitle}". The reader is currently on chapter ${currentChapter + 1}.

You have access to the book's wiki — a progressive encyclopedia built from chapters the reader has already read. Use it to answer questions accurately.

## Your Personality
- Enthusiastic but not overbearing — like a well-read friend
- Give thoughtful, specific answers grounded in the wiki data
- You can speculate when asked, but clearly label speculation vs. confirmed facts
- Be spoiler-aware: only reference information from chapters up to and including chapter ${currentChapter + 1}

## Response Format — IMPORTANT
You can use rich formatting in your responses. Your output supports a custom markup system:

### Text Formatting
- **Bold**: \`**text**\`
- *Italic*: \`*text*\`
- Inline code: \`\\\`text\\\`\`
- Blockquotes: \`> text\`
- Headings: \`## Heading\` (use ##, ###, ####)
- Lists: \`- item\` or \`1. item\`
- Horizontal rule: \`---\`

### Wiki Entity References
Link to wiki entries using: \`[[entity-id|Display Name]]\`
Example: \`[[kim-soyoung|Kim Soyoung]]\` — this creates a clickable link that opens the wiki entry.
Always use the entity's ID (kebab-case slug) from the wiki data.

### Special Blocks
You can create visually distinct blocks:

\`\`\`card:Title Here
Content inside the card. Supports **bold** and *italic*.
\`\`\`

\`\`\`quote:Character Name
A memorable quote from the character.
\`\`\`

\`\`\`info:Section Title
Informational content — good for summaries or explanations.
\`\`\`

\`\`\`warning:Speculation
Content that is speculative rather than confirmed.
\`\`\`

\`\`\`list:Related Characters
- [[entity-id|Name]] — relationship description
- [[entity-id|Name]] — relationship description
\`\`\`

### Guidelines
- Use wiki references liberally — every character/location/item mentioned should be a [[link]]
- Use special blocks to organize longer responses
- Keep responses focused and readable
- Use cards for character profiles, location summaries, etc.
- Use quote blocks for memorable lines from the text

## Wiki Data (up to chapter ${currentChapter + 1})
${wikiContext || "No wiki data available yet. The reader needs to enable and process the AI Wiki first."}`;
}

/**
 * Build wiki context string from DB for the buddy system prompt.
 */
export async function buildBuddyWikiContext(
  filePath: string,
  maxChapter: number,
): Promise<string> {
  const api = window.electronAPI;
  if (!api) return "";

  const [entries, summaries, arcs] = await Promise.all([
    api.wikiGetEntries(filePath),
    api.wikiGetChapterSummaries(filePath, 0, maxChapter),
    api.wikiGetActiveArcs(filePath),
  ]);

  if (entries.length === 0) return "";

  const sections: string[] = [];

  // Entity roster
  const entityLines: string[] = [];
  for (const e of entries) {
    if (e.first_appearance > maxChapter) continue;
    const aliases = await api.wikiGetAliases(filePath, e.id);
    const rels = await api.wikiGetRelationships(filePath, e.id, maxChapter);
    const aliasStr = aliases.length > 0 ? ` (aka ${aliases.join(", ")})` : "";
    let line = `- [${e.type}] ${e.name}${aliasStr} (id: ${e.id}, significance: ${e.significance}, status: ${e.status}): ${e.short_description}`;
    if (rels.length > 0) {
      const relStrs = rels.slice(0, 5).map((r) => {
        const targetName = entries.find((x) => x.id === (r.source_id === e.id ? r.target_id : r.source_id))?.name ?? r.target_id;
        return `${r.relation} → ${targetName}`;
      });
      line += ` | Relations: ${relStrs.join(", ")}`;
    }
    entityLines.push(line);
  }
  if (entityLines.length > 0) {
    sections.push(`### Entities\n${entityLines.join("\n")}`);
  }

  // Recent summaries (last 10)
  const recentSummaries = summaries.slice(-10);
  if (recentSummaries.length > 0) {
    const sumLines = recentSummaries.map((s) => `- Ch. ${s.chapter_index + 1}: ${s.summary}`);
    sections.push(`### Recent Chapter Summaries\n${sumLines.join("\n")}`);
  }

  // Active arcs
  if (arcs.length > 0) {
    const arcLines = arcs.map((a) => `- [${a.arc_type}] "${a.name}" (${a.status}): ${a.description}`);
    sections.push(`### Active Story Arcs\n${arcLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * Send a message to the AI Buddy and get a response.
 */
export async function sendBuddyMessage(
  bookTitle: string,
  currentChapter: number,
  wikiContext: string,
  history: BuddyMessage[],
  userMessage: string,
): Promise<string> {
  const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("OpenRouter API key not set");

  const systemPrompt = buildBuddySystemPrompt(bookTitle, currentChapter, wikiContext);
  const overrides = await loadOverrides();

  // Build message history (keep last 20 messages for context)
  const recentHistory = history.slice(-20);
  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    ...recentHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await chatWithPreset(apiKey, "quick", messages, overrides);
  return response.choices?.[0]?.message?.content?.trim() ?? "";
}
