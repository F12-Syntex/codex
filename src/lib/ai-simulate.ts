/* ── AI Simulate — Branching Narrative Continuation ────────── */

import { chatWithPreset, type OpenRouterMessage } from "./openrouter";
import { parseOverrides, PRESET_OVERRIDES_KEY } from "./ai-presets";

interface EntityData {
  name: string;
  description: string;
  shortDescription: string;
  details: { category: string; content: string }[];
  relationships: { targetName: string; relation: string }[];
  voiceLines: string[];
}

/**
 * Extract dialogue lines attributed to a character from HTML paragraphs.
 * Looks for quoted speech near the character's name or aliases.
 */
export function extractVoiceLines(
  htmlParagraphs: string[],
  names: string[],
  maxLines = 15,
): string[] {
  const lines: string[] = [];
  const lowerNames = names.map(n => n.toLowerCase());

  // Common dialogue patterns: "...", '...', \u201c...\u201d (smart quotes)
  const dialogueRegex = /["'\u201c]([^"'\u201d]{5,200})["'\u201d]/g;

  for (const html of htmlParagraphs) {
    const text = html.replace(/<[^>]+>/g, "").trim();
    if (!text) continue;

    const lowerText = text.toLowerCase();
    const mentionsChar = lowerNames.some(n => lowerText.includes(n));
    if (!mentionsChar) continue;

    let match;
    dialogueRegex.lastIndex = 0;
    while ((match = dialogueRegex.exec(text)) !== null) {
      const line = match[1].trim();
      if (line.length < 5) continue;
      if (lines.length < maxLines) {
        lines.push(line);
      }
    }
  }

  return lines;
}

/** Strip HTML tags from a string */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

/**
 * Build a large prose excerpt from paragraphs, capped at ~charLimit characters.
 * Takes from the END (most recent text) so the AI sees what's right before the branch.
 */
function buildProseContext(htmlParagraphs: string[], charLimit: number): string {
  const stripped: string[] = [];
  let total = 0;

  // Walk backwards to get the most recent text first
  for (let i = htmlParagraphs.length - 1; i >= 0; i--) {
    const text = stripHtml(htmlParagraphs[i]);
    if (!text) continue;
    if (total + text.length > charLimit) break;
    stripped.unshift(text);
    total += text.length;
  }

  return stripped.join("\n\n");
}

function buildSimulatePrompt(
  bookTitle: string,
  entity: EntityData,
  precedingParagraphs: string[],
  prevChapterText: string,
  chapterSummaries: string[],
  userInput: string,
): string {
  const detailsByCategory = new Map<string, string[]>();
  for (const d of entity.details) {
    const cat = d.category || "general";
    if (!detailsByCategory.has(cat)) detailsByCategory.set(cat, []);
    detailsByCategory.get(cat)!.push(d.content);
  }

  const detailsSection = Array.from(detailsByCategory.entries())
    .map(([cat, items]) => `### ${cat}\n${items.map(i => `- ${i}`).join("\n")}`)
    .join("\n\n");

  const relSection = entity.relationships.length > 0
    ? entity.relationships.map(r => `- ${r.targetName}: ${r.relation}`).join("\n")
    : "None known";

  const voiceSection = entity.voiceLines.length > 0
    ? entity.voiceLines.map(l => `> "${l}"`).join("\n")
    : "No voice samples available";

  // Recent summaries for broader narrative context
  const summarySection = chapterSummaries.length > 0
    ? chapterSummaries.join("\n")
    : "";

  // Build generous prose context — current chapter text right before the branch point
  const immediateContext = buildProseContext(precedingParagraphs, 8000);

  return `You are the author of "${bookTitle}", continuing the story from a specific point.
The reader wants to explore an alternate path involving "${entity.name}".

## Character: ${entity.name}
${entity.shortDescription || entity.description || "No description available."}

${detailsSection ? `## Character Details\n${detailsSection}\n` : ""}
## Relationships
${relSection}

## ${entity.name}'s Voice — How They Speak
These are actual dialogue lines from the book. You MUST replicate this exact speech style:
${voiceSection}
${summarySection ? `\n## Story So Far (chapter summaries)\n${summarySection}\n` : ""}
${prevChapterText ? `## Previous Chapter (excerpt)\n${prevChapterText}\n` : ""}
## Current Chapter Text (up to the branch point)
${immediateContext}

## Reader's Direction
${userInput}

## Instructions
Write 2-5 continuation paragraphs that naturally follow the text above.
- Your prose style, sentence structure, vocabulary, and tone MUST match the original text exactly — you are the same author
- When ${entity.name} speaks, use the exact speech patterns from the voice samples
- Follow the reader's direction while staying true to the characters
- Return ONLY the story paragraphs wrapped in <p> tags
- No commentary, no preamble, no meta-text`;
}

/**
 * Generate continuation paragraphs for a branching narrative simulation.
 * Returns an array of HTML paragraph strings.
 */
export async function generateSimContinuation(
  bookTitle: string,
  entity: EntityData,
  precedingParagraphs: string[],
  prevChapterText: string,
  chapterSummaries: string[],
  userInput: string,
): Promise<string[]> {
  const api = window.electronAPI;
  if (!api) throw new Error("No API");

  const apiKey = await api.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("No API key configured");

  const overrides = parseOverrides(
    (await api.getSetting(PRESET_OVERRIDES_KEY)) ?? null,
  );

  const systemPrompt = buildSimulatePrompt(bookTitle, entity, precedingParagraphs, prevChapterText, chapterSummaries, userInput);

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userInput },
  ];

  const response = await chatWithPreset(apiKey, "quick", messages, overrides, { max_tokens: 4096 });
  const content = response.choices?.[0]?.message?.content?.trim();

  if (!content) throw new Error("No response from AI");

  // Parse paragraphs from response — extract <p>...</p> tags, or split by double newline
  const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const matches = [...content.matchAll(pTagRegex)];

  if (matches.length > 0) {
    return matches.map(m => `<p>${m[1].trim()}</p>`);
  }

  // Fallback: split by double newline and wrap in <p> tags
  return content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${p}</p>`);
}
