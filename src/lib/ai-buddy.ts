/* ── AI Buddy — Chat about the book with wiki context ── */

import { chatWithPreset, type OpenRouterMessage } from "./openrouter";
import { loadOverrides } from "./ai-presets";

export interface BuddyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** Pending wiki actions attached to this message (assistant only) */
  pendingActions?: WikiAction[];
  /** Whether the actions have been resolved (approved/rejected) */
  actionsResolved?: boolean;
  /** Pending plan attached to this message (assistant only) */
  pendingPlan?: BuddyPlan;
  /** Whether the plan has been resolved */
  planResolved?: boolean;
}

/* ── Wiki action types ─────────────────────────────────── */

export type WikiAction =
  | WikiCreateEntry
  | WikiUpdateEntry
  | WikiDeleteEntry
  | WikiAddAliases
  | WikiAddRelationship
  | WikiAddAppearance
  | WikiMergeEntities;

interface WikiCreateEntry {
  action: "create_entry";
  id: string;
  name: string;
  type: string;
  shortDescription: string;
  significance?: number;
  status?: string;
  firstAppearance: number;
  aliases?: string[];
}

interface WikiUpdateEntry {
  action: "update_entry";
  id: string;
  fields: {
    name?: string;
    type?: string;
    shortDescription?: string;
    significance?: number;
    status?: string;
  };
}

interface WikiDeleteEntry {
  action: "delete_entry";
  id: string;
  name: string;
}

interface WikiAddAliases {
  action: "add_aliases";
  id: string;
  name: string;
  aliases: string[];
}

interface WikiAddRelationship {
  action: "add_relationship";
  sourceId: string;
  targetId: string;
  relation: string;
  sinceChapter: number;
  description?: string;
}

interface WikiAddAppearance {
  action: "add_appearance";
  id: string;
  name: string;
  chapterIndex: number;
}

interface WikiMergeEntities {
  action: "merge_entities";
  keepId: string;
  keepName: string;
  removeId: string;
  removeName: string;
  addAliases?: string[];
}

/* ── Tool call types ───────────────────────────────────── */

export type BuddyToolCall =
  | { tool: "read_chapter"; chapterIndex: number }
  | { tool: "search_chapters"; query: string; maxResults?: number };

/* ── Plan types ────────────────────────────────────────── */

export interface BuddyPlanStep {
  description: string;
  toolCalls?: BuddyToolCall[];
  wikiActions?: WikiAction[];
}

export interface BuddyPlan {
  goal: string;
  steps: BuddyPlanStep[];
}

/** Callback for reading chapter content — provided by the Reader component */
export type ChapterReader = (chapterIndex: number) => string | null;

/* ── Parsed AI response ────────────────────────────────── */

interface ParsedBuddyResponse {
  html: string;
  wikiActions: WikiAction[];
  toolCalls: BuddyToolCall[];
  plan: BuddyPlan | null;
}

/**
 * Build the system prompt for the AI Buddy.
 */
function buildBuddySystemPrompt(
  bookTitle: string,
  currentChapter: number,
  totalChapters: number,
  wikiContext: string,
): string {
  return `You are an AI reading companion for "${bookTitle}". The reader is on chapter ${currentChapter + 1} of ${totalChapters}.

You have the book's wiki data. Answer questions accurately using it.

## Personality
- Like a well-read friend — enthusiastic but not overbearing
- Specific answers grounded in wiki data
- Label speculation clearly vs. confirmed facts
- Spoiler-aware: only reference info up to chapter ${currentChapter + 1}

## Response Format — CRITICAL
You return RAW HTML. You have full creative control over the visual output.
No markdown. No code fences. Just clean HTML.

### Available CSS Classes (ai-fmt-* system)
You can use ANY of these classes to make your responses visually rich:

**Layout & Cards:**
- \`ai-fmt-stat-block\` — key-value grid (use <div class="ai-fmt-stat-block"><span>Label</span><span>Value</span>...</div>)
- \`ai-fmt-item-card\` — bordered card for items/abilities
- \`ai-fmt-lore-box\` — info panel for world-building/lore
- \`ai-fmt-system-msg\` — system notification style box
- \`ai-fmt-cultivation-stage\` — progression/rank display
- \`ai-fmt-chapter-divider\` — decorative divider

**Inline:**
- \`ai-fmt-skill-name\` — highlighted skill/ability name
- \`ai-fmt-buff\` — positive stat/effect (green tint)
- \`ai-fmt-debuff\` — negative stat/effect (red tint)
- \`ai-fmt-badge\` — inline badge/tag
- \`ai-fmt-rank\` — rank/tier badge
- \`ai-fmt-reveal\` — dramatic reveal emphasis
- \`ai-fmt-villain-voice\` — menacing text style
- \`ai-fmt-divine-voice\` — sacred/divine text style
- \`ai-fmt-hero-voice\` — heroic text style

**Dialogue & Text:**
- \`ai-fmt-thought\` — internal thought block (italic, bordered)
- \`ai-fmt-sfx\` — sound effect text
- \`ai-fmt-whisper\` — quiet/whispered text
- \`ai-fmt-translator-note\` — meta note style

### Wiki Entity Links
Reference wiki entries with: <a data-entity="entity-id-slug" class="buddy-entity-link">Display Name</a>
These become clickable links that open the wiki. Use the entity ID from the wiki data.
ALWAYS link entity names when you mention them.

### Custom Buddy Classes (also available)
- \`buddy-section\` — section with subtle top border, padding
- \`buddy-heading\` — styled heading
- \`buddy-subheading\` — smaller heading
- \`buddy-text\` — body text paragraph
- \`buddy-muted\` — dimmed secondary text
- \`buddy-quote\` — blockquote with accent border
- \`buddy-list\` — styled unordered list
- \`buddy-grid\` — 2-column info grid
- \`buddy-card\` — card with border and background
- \`buddy-card-header\` — card header row
- \`buddy-tag\` — small inline tag/badge
- \`buddy-tag-accent\` — accent-colored tag
- \`buddy-tag-positive\` — green tag
- \`buddy-tag-negative\` — red tag
- \`buddy-tag-neutral\` — grey tag
- \`buddy-divider\` — horizontal divider
- \`buddy-highlight\` — text highlight
- \`buddy-spoiler-warning\` — spoiler warning block

### Examples

Character profile:
<div class="buddy-card">
  <div class="buddy-card-header">
    <strong><a data-entity="muyoung" class="buddy-entity-link">Muyoung</a></strong>
    <span class="buddy-tag-accent">Protagonist</span>
  </div>
  <p class="buddy-text">A former assassin of the Forest of Death...</p>
  <div class="buddy-grid">
    <span class="buddy-muted">Status</span><span class="ai-fmt-buff">Active</span>
    <span class="buddy-muted">Class</span><span>Necromancer</span>
    <span class="buddy-muted">Significance</span><span>Core</span>
  </div>
</div>

Simple answer:
<p class="buddy-text">The battle happened in chapter 12 when <a data-entity="muyoung" class="buddy-entity-link">Muyoung</a> fought the <a data-entity="forest-guardian" class="buddy-entity-link">Forest Guardian</a>. He used <span class="ai-fmt-skill-name">Shadow Slash</span> to deal the final blow.</p>

## Tools — Reading Chapters
You can request to read chapter content to answer questions that need the actual text.
When you need to read chapters, include a tool call block at the END of your HTML response:

<!--BUDDY_TOOLS:[
  { "tool": "read_chapter", "chapterIndex": 3 },
  { "tool": "search_chapters", "query": "Soyoung", "maxResults": 5 }
]-->

**Available tools:**
- \`read_chapter\` — Read full text of a chapter. Use 0-based index. Only request chapters ≤ ${currentChapter} (the reader's current position). The book has ${totalChapters} chapters total.
- \`search_chapters\` — Search for a text pattern across all chapters up to the current one. Returns matching chapter indices + surrounding context. maxResults defaults to 5.

**Tool call rules:**
- Tool results are automatically fed back to you — you will get a follow-up with the content and then respond with your final answer.
- You can request multiple chapters/searches at once.
- Include a brief HTML message explaining what you're doing (e.g. "Let me check that chapter...") BEFORE the tool block.
- Do NOT include <!--WIKI_ACTIONS--> in the same response as <!--BUDDY_TOOLS-->. Tools execute first, then you can propose wiki edits in your follow-up response.
- Only read chapters the user has reached (≤ chapter ${currentChapter + 1}).

## Plans — Complex Multi-Step Tasks
For complex tasks that require multiple steps (e.g. "scan all chapters for a character", "rebuild the wiki for characters X, Y, Z"), create a plan instead of trying to do everything at once.

Include a plan block at the END of your HTML response:

<!--BUDDY_PLAN:{
  "goal": "Scan chapters 1-${currentChapter + 1} for all mentions of Soyoung and create a wiki entry",
  "steps": [
    {
      "description": "Read chapters 1-3 to find Soyoung's first appearance and role",
      "toolCalls": [
        { "tool": "read_chapter", "chapterIndex": 0 },
        { "tool": "read_chapter", "chapterIndex": 1 },
        { "tool": "read_chapter", "chapterIndex": 2 }
      ]
    },
    {
      "description": "Read chapters 4-6 for more details",
      "toolCalls": [
        { "tool": "read_chapter", "chapterIndex": 3 },
        { "tool": "read_chapter", "chapterIndex": 4 },
        { "tool": "read_chapter", "chapterIndex": 5 }
      ]
    },
    {
      "description": "Create wiki entry with collected information",
      "wikiActions": []
    }
  ]
}-->

**Plan rules:**
- The user must approve the plan before execution starts.
- Each step runs sequentially. For steps with toolCalls, the chapter content is read and fed to you, and you respond with findings.
- The last step's wikiActions can be empty [] — you'll fill them in based on what you found during execution.
- Keep plans concise. Batch chapter reads (3-5 per step max to stay within context limits).
- Include a clear HTML explanation of the plan BEFORE the plan block.
- Do NOT include <!--BUDDY_TOOLS--> or <!--WIKI_ACTIONS--> in the same response as <!--BUDDY_PLAN-->.
- Only plan to read chapters the user has reached (≤ chapter ${currentChapter + 1}).

## Wiki Editing — IMPORTANT
You can propose changes to the wiki when the reader asks you to fix, add, or update wiki entries.
When you want to modify the wiki, include a JSON action block at the END of your HTML response:

<!--WIKI_ACTIONS:[
  { ... action object ... }
]-->

The user will see a confirmation prompt and must approve before changes are applied.

### Available Actions

**create_entry** — Add a new entity to the wiki
\`{ "action": "create_entry", "id": "slug-id", "name": "Display Name", "type": "character|location|item|concept|faction|event", "shortDescription": "Brief description", "significance": 3, "status": "active", "firstAppearance": 0, "aliases": ["Alt Name"] }\`

**update_entry** — Update fields on an existing entity
\`{ "action": "update_entry", "id": "existing-id", "fields": { "shortDescription": "New desc", "status": "deceased" } }\`

**delete_entry** — Remove an entity
\`{ "action": "delete_entry", "id": "entity-id", "name": "Display Name" }\`

**add_aliases** — Add alternative names
\`{ "action": "add_aliases", "id": "entity-id", "name": "Display Name", "aliases": ["Alias1"] }\`

**add_relationship** — Link two entities
\`{ "action": "add_relationship", "sourceId": "a", "targetId": "b", "relation": "ally_of", "sinceChapter": 0 }\`

**add_appearance** — Mark entity in a chapter
\`{ "action": "add_appearance", "id": "entity-id", "name": "Name", "chapterIndex": 3 }\`

**merge_entities** — Merge duplicate into correct entity
\`{ "action": "merge_entities", "keepId": "correct", "keepName": "Name", "removeId": "dup", "removeName": "Dup", "addAliases": ["Dup"] }\`

### Wiki Editing Rules
- ALWAYS explain changes in HTML BEFORE the action block
- Only propose changes the user asked for or clearly implied
- Use entity IDs from the wiki data for existing entries
- Current chapter: ${currentChapter + 1} (0-based: ${currentChapter})

### Output Rules
- Return ONLY raw HTML + optional action/tool/plan block. No markdown, no code fences.
- Only ONE action block per response: either <!--WIKI_ACTIONS-->, <!--BUDDY_TOOLS-->, or <!--BUDDY_PLAN-->.
- Link every entity mention with <a data-entity="..." class="buddy-entity-link">
- Be creative with visual presentation.

## Wiki Data (up to chapter ${currentChapter + 1})
${wikiContext || "No wiki data available yet."}`;
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

  const recentSummaries = summaries.slice(-10);
  if (recentSummaries.length > 0) {
    const sumLines = recentSummaries.map((s) => `- Ch. ${s.chapter_index + 1}: ${s.summary}`);
    sections.push(`### Recent Chapter Summaries\n${sumLines.join("\n")}`);
  }

  if (arcs.length > 0) {
    const arcLines = arcs.map((a) => `- [${a.arc_type}] "${a.name}" (${a.status}): ${a.description}`);
    sections.push(`### Active Story Arcs\n${arcLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

/* ── Response parsing ──────────────────────────────────── */

function stripCodeFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```html")) s = s.slice(7);
  else if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  return s.trim();
}

function parseResponse(raw: string): ParsedBuddyResponse {
  let html = raw;
  let wikiActions: WikiAction[] = [];
  let toolCalls: BuddyToolCall[] = [];
  let plan: BuddyPlan | null = null;

  // Parse wiki actions
  const wikiMatch = html.match(/<!--WIKI_ACTIONS:\s*(\[[\s\S]*?\])\s*-->/);
  if (wikiMatch) {
    html = html.slice(0, wikiMatch.index).trim();
    try { wikiActions = JSON.parse(wikiMatch[1]); } catch { /* ignore */ }
  }

  // Parse tool calls
  const toolMatch = html.match(/<!--BUDDY_TOOLS:\s*(\[[\s\S]*?\])\s*-->/);
  if (toolMatch) {
    html = html.slice(0, toolMatch.index).trim();
    try { toolCalls = JSON.parse(toolMatch[1]); } catch { /* ignore */ }
  }

  // Parse plan
  const planMatch = html.match(/<!--BUDDY_PLAN:\s*(\{[\s\S]*?\})\s*-->/);
  if (planMatch) {
    html = html.slice(0, planMatch.index).trim();
    try { plan = JSON.parse(planMatch[1]); } catch { /* ignore */ }
  }

  return { html, wikiActions, toolCalls, plan };
}

/* ── Tool execution ────────────────────────────────────── */

/**
 * Execute tool calls and return results as a context string.
 */
function executeToolCalls(
  toolCalls: BuddyToolCall[],
  readChapter: ChapterReader,
  currentChapter: number,
): string {
  const results: string[] = [];

  for (const tc of toolCalls) {
    switch (tc.tool) {
      case "read_chapter": {
        if (tc.chapterIndex > currentChapter) {
          results.push(`[read_chapter ${tc.chapterIndex}] ERROR: Chapter ${tc.chapterIndex + 1} is beyond the reader's current position (chapter ${currentChapter + 1}).`);
          continue;
        }
        const text = readChapter(tc.chapterIndex);
        if (text === null) {
          results.push(`[read_chapter ${tc.chapterIndex}] ERROR: Chapter ${tc.chapterIndex + 1} not found.`);
        } else {
          // Truncate very long chapters to keep context manageable
          const maxLen = 12000;
          const truncated = text.length > maxLen ? text.slice(0, maxLen) + "\n[... truncated ...]" : text;
          results.push(`[read_chapter ${tc.chapterIndex}] Chapter ${tc.chapterIndex + 1} content:\n${truncated}`);
        }
        break;
      }
      case "search_chapters": {
        const max = tc.maxResults ?? 5;
        const query = tc.query.toLowerCase();
        const matches: { chapterIndex: number; snippets: string[] }[] = [];

        for (let i = 0; i <= currentChapter; i++) {
          const text = readChapter(i);
          if (!text) continue;
          const lower = text.toLowerCase();
          const idx = lower.indexOf(query);
          if (idx === -1) continue;

          // Extract snippets around matches
          const snippets: string[] = [];
          let searchFrom = 0;
          while (snippets.length < 3) {
            const pos = lower.indexOf(query, searchFrom);
            if (pos === -1) break;
            const start = Math.max(0, pos - 100);
            const end = Math.min(text.length, pos + query.length + 100);
            snippets.push(`...${text.slice(start, end)}...`);
            searchFrom = pos + query.length;
          }
          matches.push({ chapterIndex: i, snippets });
          if (matches.length >= max) break;
        }

        if (matches.length === 0) {
          results.push(`[search_chapters "${tc.query}"] No matches found in chapters 1-${currentChapter + 1}.`);
        } else {
          const lines = matches.map((m) =>
            `Chapter ${m.chapterIndex + 1}:\n${m.snippets.join("\n")}`
          );
          results.push(`[search_chapters "${tc.query}"] Found ${matches.length} chapter(s):\n${lines.join("\n\n")}`);
        }
        break;
      }
    }
  }

  return results.join("\n\n---\n\n");
}

/* ── Core send function ────────────────────────────────── */

/** Progress callback for streaming status updates to the UI */
export type BuddyProgressCallback = (status: string) => void;

/**
 * Send a message to the AI Buddy with automatic tool call resolution.
 * Returns [htmlContent, wikiActions, plan].
 */
export async function sendBuddyMessage(
  bookTitle: string,
  currentChapter: number,
  totalChapters: number,
  wikiContext: string,
  history: BuddyMessage[],
  userMessage: string,
  readChapter: ChapterReader,
  onProgress?: BuddyProgressCallback,
): Promise<[string, WikiAction[], BuddyPlan | null]> {
  const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("OpenRouter API key not set");

  const systemPrompt = buildBuddySystemPrompt(bookTitle, currentChapter, totalChapters, wikiContext);
  const overrides = await loadOverrides();

  const recentHistory = history.slice(-20);
  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    ...recentHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const maxIterations = 5;
  let accumulatedHtml = "";

  for (let i = 0; i < maxIterations; i++) {
    const response = await chatWithPreset(apiKey, "quick", messages, overrides);
    const raw = stripCodeFences(response.choices?.[0]?.message?.content?.trim() ?? "");
    const parsed = parseResponse(raw);

    accumulatedHtml += (accumulatedHtml ? "\n" : "") + parsed.html;

    // If there are wiki actions or a plan, return immediately (no auto-resolution)
    if (parsed.wikiActions.length > 0 || parsed.plan) {
      return [accumulatedHtml, parsed.wikiActions, parsed.plan];
    }

    // If there are tool calls, execute them and feed results back
    if (parsed.toolCalls.length > 0) {
      const toolDescs = parsed.toolCalls.map((tc) => {
        if (tc.tool === "read_chapter") return `Reading chapter ${tc.chapterIndex + 1}`;
        return `Searching for "${tc.query}"`;
      });
      onProgress?.(`${toolDescs.join(", ")}...`);

      const toolResults = executeToolCalls(parsed.toolCalls, readChapter, currentChapter);

      // Add the AI's response + tool results to context for the next iteration
      messages.push({ role: "assistant", content: parsed.html });
      messages.push({
        role: "user",
        content: `[Tool results — use this data to answer the original question. Respond with your final answer in HTML.]\n\n${toolResults}`,
      });
      continue;
    }

    // No tools, no actions, no plan — final response
    return [accumulatedHtml, [], null];
  }

  // Max iterations reached
  return [accumulatedHtml, [], null];
}

/* ── Plan step execution ───────────────────────────────── */

/**
 * Execute a single plan step. Returns [htmlResponse, wikiActions].
 * The AI receives the plan context + tool results and responds.
 */
export async function executePlanStep(
  bookTitle: string,
  currentChapter: number,
  totalChapters: number,
  wikiContext: string,
  plan: BuddyPlan,
  stepIndex: number,
  previousResults: string[],
  readChapter: ChapterReader,
): Promise<[string, WikiAction[]]> {
  const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("OpenRouter API key not set");

  const step = plan.steps[stepIndex];
  if (!step) throw new Error(`Step ${stepIndex} not found`);

  const overrides = await loadOverrides();
  const systemPrompt = buildBuddySystemPrompt(bookTitle, currentChapter, totalChapters, wikiContext);

  // Build context with previous step results
  let stepContext = `You are executing a plan. Goal: "${plan.goal}"\n\n`;
  stepContext += `This is step ${stepIndex + 1} of ${plan.steps.length}: "${step.description}"\n\n`;

  if (previousResults.length > 0) {
    stepContext += `Previous step results:\n${previousResults.map((r, i) => `--- Step ${i + 1} ---\n${r}`).join("\n\n")}\n\n`;
  }

  // Execute tool calls for this step
  let toolResults = "";
  if (step.toolCalls && step.toolCalls.length > 0) {
    toolResults = executeToolCalls(step.toolCalls, readChapter, currentChapter);
    stepContext += `Tool results for this step:\n${toolResults}\n\n`;
  }

  // For the last step, or steps with wiki actions, ask for wiki actions
  const isLastStep = stepIndex === plan.steps.length - 1;
  if (isLastStep) {
    stepContext += `This is the FINAL step. Provide your complete analysis and propose any wiki edits using <!--WIKI_ACTIONS:[...]-->.\n`;
  } else {
    stepContext += `Summarize what you found in this step. Your findings will be passed to subsequent steps.\n`;
  }

  stepContext += `Respond with HTML as usual.`;

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: stepContext },
  ];

  const response = await chatWithPreset(apiKey, "quick", messages, overrides);
  const raw = stripCodeFences(response.choices?.[0]?.message?.content?.trim() ?? "");
  const parsed = parseResponse(raw);

  return [parsed.html, parsed.wikiActions];
}

/* ── Wiki action execution ─────────────────────────────── */

/**
 * Execute a single wiki action via the Electron IPC API.
 */
export async function executeWikiAction(
  filePath: string,
  action: WikiAction,
): Promise<void> {
  const api = window.electronAPI;
  if (!api) throw new Error("No Electron API");

  switch (action.action) {
    case "create_entry": {
      await api.wikiUpsertEntry({
        id: action.id,
        filePath,
        name: action.name,
        type: action.type,
        shortDescription: action.shortDescription,
        significance: action.significance ?? 3,
        status: action.status ?? "active",
        firstAppearance: action.firstAppearance,
      });
      if (action.aliases && action.aliases.length > 0) {
        await api.wikiAddAliases(filePath, action.id, action.aliases);
      }
      break;
    }
    case "update_entry": {
      const existing = await api.wikiGetEntry(filePath, action.id);
      if (!existing) throw new Error(`Entity "${action.id}" not found`);
      await api.wikiUpsertEntry({
        id: action.id,
        filePath,
        name: action.fields.name ?? existing.name,
        type: action.fields.type ?? existing.type,
        shortDescription: action.fields.shortDescription ?? existing.short_description,
        significance: action.fields.significance ?? existing.significance,
        status: action.fields.status ?? existing.status,
        firstAppearance: existing.first_appearance,
      });
      break;
    }
    case "delete_entry": {
      await api.wikiDeleteEntry(filePath, action.id);
      break;
    }
    case "add_aliases": {
      await api.wikiAddAliases(filePath, action.id, action.aliases);
      break;
    }
    case "add_relationship": {
      await api.wikiAddRelationship(filePath, {
        sourceId: action.sourceId,
        targetId: action.targetId,
        relation: action.relation,
        sinceChapter: action.sinceChapter,
        description: action.description,
      });
      break;
    }
    case "add_appearance": {
      await api.wikiAddAppearance(filePath, action.id, action.chapterIndex);
      break;
    }
    case "merge_entities": {
      const rels = await api.wikiGetRelationships(filePath, action.removeId);
      for (const r of rels) {
        const src = r.source_id === action.removeId ? action.keepId : r.source_id;
        const tgt = r.target_id === action.removeId ? action.keepId : r.target_id;
        if (src === tgt) continue;
        await api.wikiAddRelationship(filePath, {
          sourceId: src,
          targetId: tgt,
          relation: r.relation,
          sinceChapter: r.since_chapter,
          description: r.description ?? undefined,
        });
      }
      const appearances = await api.wikiGetAppearances(filePath, action.removeId);
      for (const ch of appearances) {
        await api.wikiAddAppearance(filePath, action.keepId, ch);
      }
      if (action.addAliases && action.addAliases.length > 0) {
        await api.wikiAddAliases(filePath, action.keepId, action.addAliases);
      }
      const oldAliases = await api.wikiGetAliases(filePath, action.removeId);
      if (oldAliases.length > 0) {
        await api.wikiAddAliases(filePath, action.keepId, oldAliases);
      }
      await api.wikiDeleteEntry(filePath, action.removeId);
      break;
    }
  }
}

/**
 * Get a human-readable description of a wiki action for the confirmation UI.
 */
export function describeWikiAction(action: WikiAction): { label: string; detail: string; color: "green" | "yellow" | "red" } {
  switch (action.action) {
    case "create_entry":
      return {
        label: `Create "${action.name}"`,
        detail: `New ${action.type} — ${action.shortDescription}${action.aliases?.length ? ` (aliases: ${action.aliases.join(", ")})` : ""}`,
        color: "green",
      };
    case "update_entry": {
      const changes = Object.entries(action.fields)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      return {
        label: `Update "${action.id}"`,
        detail: changes,
        color: "yellow",
      };
    }
    case "delete_entry":
      return {
        label: `Delete "${action.name}"`,
        detail: `Remove entity "${action.id}" from the wiki`,
        color: "red",
      };
    case "add_aliases":
      return {
        label: `Add aliases to "${action.name}"`,
        detail: action.aliases.join(", "),
        color: "green",
      };
    case "add_relationship":
      return {
        label: `Add relationship`,
        detail: `${action.sourceId} → ${action.relation} → ${action.targetId}${action.description ? ` (${action.description})` : ""}`,
        color: "green",
      };
    case "add_appearance":
      return {
        label: `Mark appearance`,
        detail: `"${action.name}" appears in chapter ${action.chapterIndex + 1}`,
        color: "green",
      };
    case "merge_entities":
      return {
        label: `Merge "${action.removeName}" → "${action.keepName}"`,
        detail: `Delete "${action.removeName}" and merge data into "${action.keepName}"${action.addAliases?.length ? ` (add aliases: ${action.addAliases.join(", ")})` : ""}`,
        color: "yellow",
      };
  }
}
