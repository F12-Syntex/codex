/**
 * `entity.lookup` (owner: WS-B) — F2 "Who's this?" for names that are not in the wiki.
 * Known entities need no AI call (`knowledge:entity`). This task searches the book (≤ frontier,
 * 8 passages) and asks the `fast` model to identify the name from those passages only. Refs are
 * validated against the passages that were sent; nothing past the frontier can be cited.
 */

import { hashOf } from "../../shared/ai/hash";
import { s } from "../../shared/ai/validate";
import type { EntityLookupInput, EntityLookupOutput } from "../../shared/knowledge/types";
import type { TaskDefinition } from "../registry";
import { buildLookupSystemPrompt, buildLookupUserPrompt, LOOKUP_PROMPT_VERSION } from "../../knowledge/prompts";
import type { KnowledgeService } from "../../knowledge/service";

export const LOOKUP_PASSAGES = 8;
const PASSAGE_CHARS = 700;

const LookupSchema = s.object({
  name: s.optional(s.string()),
  type: s.optional(s.enum(["character", "item", "location", "event", "concept"] as const)),
  description: s.string(),
  confidence: s.optional(s.number({ min: 0, max: 1, clamp: true, coerce: true })),
  refs: s.optional(s.array(s.string(), { salvage: true })),
});

export function createEntityLookupTask(svc: KnowledgeService): TaskDefinition<EntityLookupInput, EntityLookupOutput> {
  return {
    id: "entity.lookup",
    version: LOOKUP_PROMPT_VERSION,
    role: "fast",
    temperature: 0.2,
    maxTokens: 400,
    cacheable: true,
    key(input) {
      const f = input.frontier ?? svc.getFrontier(input.filePath);
      return hashOf(input.filePath, input.name.trim().toLowerCase(), f);
    },
    async run(input, ctx) {
      const name = input.name.trim();
      const frontier = input.frontier ?? svc.getFrontier(input.filePath);
      const labelOf = svc.labelsFor(input.filePath);
      const none = (description: string): EntityLookupOutput => ({ name, type: "concept", description, confidence: 0, refs: [], refChapters: [] });
      if (!name) return none("");

      const hits = await svc.searchAsync(input.filePath, name, frontier, LOOKUP_PASSAGES);
      if (hits.length === 0) return none(`Nothing about "${name}" has come up so far.`);

      // Full paragraph text (snippets are too short to identify someone).
      const passages: { id: string; paraId: string; chapter: number; label: string; text: string }[] = [];
      const cache = new Map<number, Map<string, string>>();
      for (const [i, h] of hits.entries()) {
        let paras = cache.get(h.chapterIndex);
        if (!paras) {
          paras = new Map();
          try {
            for (const p of (await ctx.books.getChapter(input.filePath, h.chapterIndex)).paras) paras.set(p.id, p.text);
          } catch { /* fall back to the snippet */ }
          cache.set(h.chapterIndex, paras);
        }
        const text = (paras.get(h.paraId) ?? h.snippet).trim().slice(0, PASSAGE_CHARS);
        passages.push({ id: `P${i + 1}`, paraId: h.paraId, chapter: h.chapterIndex, label: labelOf(h.chapterIndex), text });
      }

      const context = svc.getContext({
        filePath: input.filePath, frontier, purpose: "lookup", budgetChars: 2500,
        focusText: passages.map((p) => p.text).join("\n"),
      });
      const { value } = await ctx.completeJson({
        messages: [
          { role: "system", content: buildLookupSystemPrompt(frontier.mode === "off" ? "the end" : labelOf(Math.max(0, frontier.chapterIndex))) },
          { role: "user", content: buildLookupUserPrompt(name, passages, context.text) },
        ],
        schema: LookupSchema,
      });

      const byId = new Map(passages.map((p) => [p.id.toLowerCase(), p]));
      const byPara = new Map(passages.map((p) => [p.paraId, p]));
      const refs: EntityLookupOutput["refs"] = [];
      const refChapters: number[] = [];
      for (const r of value.refs ?? []) {
        const p = byId.get(r.trim().toLowerCase()) ?? byPara.get(r.trim());
        if (p && !refs.includes(p.paraId)) {
          refs.push(p.paraId);
          refChapters.push(p.chapter);
        }
      }
      return {
        name: value.name?.trim() || name,
        type: value.type ?? "concept",
        description: value.description.trim(),
        confidence: value.confidence ?? (refs.length ? 0.5 : 0),
        refs,
        refChapters,
      };
    },
    fakeResponse() {
      return JSON.stringify({ description: "Someone mentioned in passing.", confidence: 0.3, refs: ["P1"] });
    },
  };
}
