/* ── AI Simulate — Branching Narrative Continuation ────────── */

import { chatWithPreset, type OpenRouterMessage } from "./openrouter";
import { loadOverrides } from "./ai-presets";

interface EntityData {
  name: string;
  description: string;
  shortDescription: string;
  details: { category: string; content: string }[];
  relationships: { targetName: string; relation: string }[];
  voiceLines: string[];
}

export interface SimChoice {
  label: string;
  description: string;
}

export interface SimResult {
  htmlParagraphs: string[];
  choices: SimChoice[];
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
  const immediateContext = buildProseContext(precedingParagraphs, 10000);

  return `You are ghostwriting a continuation of "${bookTitle}". You are NOT an AI assistant — you ARE the original author. Your job is to write the next section of the story as if it were published in the actual book.

The reader wants to explore an alternate path involving "${entity.name}".

## Character: ${entity.name}
${entity.shortDescription || entity.description || "No description available."}

${detailsSection ? `## Character Details\n${detailsSection}\n` : ""}
## Relationships
${relSection}

## ${entity.name}'s Voice — How They Speak
These are actual dialogue lines from the book. You MUST replicate this exact speech style — their vocabulary, sentence length, verbal tics, formality level, and emotional register:
${voiceSection}
${summarySection ? `\n## Story So Far (chapter summaries)\n${summarySection}\n` : ""}
${prevChapterText ? `## Previous Chapter (excerpt)\n${prevChapterText}\n` : ""}
## Current Chapter Text (up to the branch point)
${immediateContext}

## Reader's Direction
${userInput}

## Instructions
Write a LONG continuation — at minimum 1500 words, ideally 2000-3000 words. This should feel like reading the next several pages of the actual book.

CRITICAL STYLE RULES:
- You are the original author. Match the prose style EXACTLY — sentence structure, paragraph length, vocabulary level, pacing, narrative voice (first/third person), tense, and tone
- Study the text above carefully. If it uses short punchy sentences, you do too. If it's flowery and descriptive, match that. If dialogue is sparse, keep it sparse. If it's dialogue-heavy, write lots of dialogue
- When ${entity.name} speaks, replicate their exact speech patterns from the voice samples — their word choices, contractions, slang, formality
- Maintain the same ratio of dialogue to narration as the source material
- Include inner thoughts, sensory details, and environmental description at the same density as the original
- DO NOT summarize or skip ahead. Write scene-by-scene, moment-by-moment, just like the original book does
- DO NOT use phrases like "little did they know" or "and so it was" or any other cliché narrative shortcuts

After the story text, provide exactly 3 branching choices for where the story could go next.

OUTPUT FORMAT (follow exactly):
<story>
Your continuation paragraphs here, each wrapped in <p> tags.
</story>
<choices>
<choice label="Short action label (2-5 words)">Brief description of what happens if the reader picks this path (1 sentence)</choice>
<choice label="Short action label (2-5 words)">Brief description of what happens if the reader picks this path (1 sentence)</choice>
<choice label="Short action label (2-5 words)">Brief description of what happens if the reader picks this path (1 sentence)</choice>
</choices>`;
}

/**
 * Parse the structured response from the AI into paragraphs + choices.
 */
function parseSimResponse(content: string): SimResult {
  // Extract story section
  const storyMatch = content.match(/<story>([\s\S]*?)<\/story>/i);
  const choicesMatch = content.match(/<choices>([\s\S]*?)<\/choices>/i);

  let htmlParagraphs: string[];

  if (storyMatch) {
    const storyContent = storyMatch[1].trim();
    const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const matches = [...storyContent.matchAll(pTagRegex)];
    if (matches.length > 0) {
      htmlParagraphs = matches.map(m => `<p>${m[1].trim()}</p>`);
    } else {
      htmlParagraphs = storyContent
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${p}</p>`);
    }
  } else {
    // No <story> tags — try to extract everything before <choices> or the whole thing
    const textBeforeChoices = choicesMatch
      ? content.slice(0, content.indexOf(choicesMatch[0])).trim()
      : content.trim();

    const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const matches = [...textBeforeChoices.matchAll(pTagRegex)];
    if (matches.length > 0) {
      htmlParagraphs = matches.map(m => `<p>${m[1].trim()}</p>`);
    } else {
      htmlParagraphs = textBeforeChoices
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(p => p && !p.startsWith("<choice") && !p.startsWith("<choices"))
        .map(p => `<p>${p}</p>`);
    }
  }

  // Parse choices
  const choices: SimChoice[] = [];
  if (choicesMatch) {
    const choiceRegex = /<choice\s+label="([^"]+)">([\s\S]*?)<\/choice>/gi;
    let choiceMatch;
    while ((choiceMatch = choiceRegex.exec(choicesMatch[1])) !== null) {
      choices.push({
        label: choiceMatch[1].trim(),
        description: choiceMatch[2].trim(),
      });
    }
  }

  return { htmlParagraphs, choices };
}

/**
 * Generate continuation paragraphs for a branching narrative simulation.
 * Returns paragraphs + branching choices.
 */
export async function generateSimContinuation(
  bookTitle: string,
  entity: EntityData,
  precedingParagraphs: string[],
  prevChapterText: string,
  chapterSummaries: string[],
  userInput: string,
): Promise<SimResult> {
  const api = window.electronAPI;
  if (!api) throw new Error("No API");

  const apiKey = await api.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("No API key configured");

  const overrides = await loadOverrides();

  const systemPrompt = buildSimulatePrompt(bookTitle, entity, precedingParagraphs, prevChapterText, chapterSummaries, userInput);

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userInput },
  ];

  const response = await chatWithPreset(apiKey, "creative", messages, overrides);
  const content = response.choices?.[0]?.message?.content?.trim();

  if (!content) throw new Error("No response from AI");

  return parseSimResponse(content);
}
