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

/**
 * Build the system prompt for the AI Buddy.
 * The AI returns raw HTML using ai-fmt-* classes for full visual control.
 */
function buildBuddySystemPrompt(
  bookTitle: string,
  currentChapter: number,
  wikiContext: string,
): string {
  return `You are an AI reading companion for "${bookTitle}". The reader is on chapter ${currentChapter + 1}.

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

Relationship map:
<div class="buddy-card">
  <div class="buddy-heading">Relationships</div>
  <div class="buddy-list">
    <div><a data-entity="suzy" class="buddy-entity-link">Suzy</a> — <span class="buddy-tag-positive">Ally</span> Loyal companion since Ch. 3</div>
    <div><a data-entity="wung-chun" class="buddy-entity-link">Wung Chun</a> — <span class="buddy-tag-negative">Enemy</span> Demon lord antagonist</div>
  </div>
</div>

Simple answer:
<p class="buddy-text">The battle happened in chapter 12 when <a data-entity="muyoung" class="buddy-entity-link">Muyoung</a> fought the <a data-entity="forest-guardian" class="buddy-entity-link">Forest Guardian</a>. He used <span class="ai-fmt-skill-name">Shadow Slash</span> to deal the final blow.</p>

## Wiki Editing — IMPORTANT
You can propose changes to the wiki when the reader asks you to fix, add, or update wiki entries.
When you want to modify the wiki, include a JSON action block at the END of your HTML response using this exact format:

<!--WIKI_ACTIONS:[
  { ... action object ... },
  { ... action object ... }
]-->

The user will see a confirmation prompt and must approve before changes are applied.

### Available Actions

**create_entry** — Add a new entity to the wiki
\`\`\`
{ "action": "create_entry", "id": "slug-id", "name": "Display Name", "type": "character|location|item|concept|faction|event", "shortDescription": "Brief description", "significance": 3, "status": "active", "firstAppearance": 0, "aliases": ["Alt Name"] }
\`\`\`
- id: lowercase slug (e.g. "kim-soyoung")
- significance: 1 (minor) to 5 (protagonist)
- firstAppearance: 0-based chapter index
- aliases: optional array of alternative names

**update_entry** — Update fields on an existing entity
\`\`\`
{ "action": "update_entry", "id": "existing-id", "fields": { "shortDescription": "New description", "status": "deceased", "significance": 4 } }
\`\`\`
- Only include fields that need changing

**delete_entry** — Remove an entity (use sparingly)
\`\`\`
{ "action": "delete_entry", "id": "entity-id", "name": "Display Name" }
\`\`\`

**add_aliases** — Add alternative names to an entity
\`\`\`
{ "action": "add_aliases", "id": "entity-id", "name": "Display Name", "aliases": ["Alias1", "Alias2"] }
\`\`\`

**add_relationship** — Add a relationship between two entities
\`\`\`
{ "action": "add_relationship", "sourceId": "entity-a", "targetId": "entity-b", "relation": "ally_of|enemy_of|family|mentor|subordinate|romantic|rival|etc", "sinceChapter": 0, "description": "Optional detail" }
\`\`\`

**add_appearance** — Mark entity as appearing in a chapter
\`\`\`
{ "action": "add_appearance", "id": "entity-id", "name": "Display Name", "chapterIndex": 3 }
\`\`\`

**merge_entities** — Merge a duplicate into the correct entity (keeps keepId, deletes removeId)
\`\`\`
{ "action": "merge_entities", "keepId": "correct-entity", "keepName": "Correct Name", "removeId": "duplicate-entity", "removeName": "Duplicate Name", "addAliases": ["Duplicate Name"] }
\`\`\`

### Wiki Editing Rules
- ALWAYS explain what you're going to change in your HTML response BEFORE the action block
- Use a visually clear summary of proposed changes so the user understands what will happen
- Only propose changes the user has asked for or clearly implied
- For new characters the user mentions aren't in the wiki, propose create_entry
- For duplicate entities, propose merge_entities
- Use the entity IDs from the wiki data when referencing existing entries
- The reader is on chapter ${currentChapter + 1} (0-based index: ${currentChapter}), use this for firstAppearance/sinceChapter when unsure

### Rules
- Return ONLY raw HTML (plus optional <!--WIKI_ACTIONS:[...]-->). No markdown, no code fences, no \`\`\`.
- Use the classes creatively — mix and match.
- Link every entity mention with <a data-entity="..." class="buddy-entity-link">
- Keep text readable and well-structured.
- Use cards, grids, and badges to organize complex answers.
- Short answers can be just a <p class="buddy-text">.
- Be creative with the visual presentation — make it look great.

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

/**
 * Parse wiki actions from the AI response.
 * Returns [htmlContent, actions].
 */
function parseWikiActions(raw: string): [string, WikiAction[]] {
  const match = raw.match(/<!--WIKI_ACTIONS:\s*(\[[\s\S]*?\])\s*-->/);
  if (!match) return [raw, []];

  const html = raw.slice(0, match.index).trim();
  try {
    const actions = JSON.parse(match[1]) as WikiAction[];
    return [html, actions];
  } catch {
    return [raw, []];
  }
}

/**
 * Send a message to the AI Buddy and get a response.
 * Returns [htmlContent, wikiActions].
 */
export async function sendBuddyMessage(
  bookTitle: string,
  currentChapter: number,
  wikiContext: string,
  history: BuddyMessage[],
  userMessage: string,
): Promise<[string, WikiAction[]]> {
  const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("OpenRouter API key not set");

  const systemPrompt = buildBuddySystemPrompt(bookTitle, currentChapter, wikiContext);
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

  const response = await chatWithPreset(apiKey, "quick", messages, overrides);
  let content = response.choices?.[0]?.message?.content?.trim() ?? "";

  // Strip markdown code fences if AI wrapped in them anyway
  if (content.startsWith("```html")) content = content.slice(7);
  else if (content.startsWith("```")) content = content.slice(3);
  if (content.endsWith("```")) content = content.slice(0, -3);
  content = content.trim();

  return parseWikiActions(content);
}

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
      // Copy relationships/appearances from removeId to keepId, then delete removeId
      const rels = await api.wikiGetRelationships(filePath, action.removeId);
      for (const r of rels) {
        const src = r.source_id === action.removeId ? action.keepId : r.source_id;
        const tgt = r.target_id === action.removeId ? action.keepId : r.target_id;
        if (src === tgt) continue; // self-ref after merge
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
      // Also carry over aliases from the removed entity
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
