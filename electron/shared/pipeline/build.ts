/**
 * `buildChapter`: the fixed layer order in one pure function (owner: WS-C). AI_AUDIT §4.5.
 *
 *   0 source → 1 rewrite → 2 format → 3 sanitize → 4 lexicon → 5 annotate → 6 decorate → 7 project
 *
 * PURE: no `electron`, Node or DOM imports. Deterministic for equal inputs. The page, the speed
 * reader and TTS all consume the same `RenderedChapter`, so they can't disagree.
 */

import type {
  Annotation, BlockMarker, BuildChapterFn, ParaId, RenderedChapter, RenderedPara, ResolveAnchorFn, VariantKeyOfFn,
} from "./types";
import { applyLayers, isFormatFresh, isRewriteFresh, type LayerResult } from "./layers";
import { applyLexicon, compileLexicon } from "./lexicon";
import { compileEntities, locateQuote, locateQuoteFuzzy, matchEntities } from "./annotate";
import { decorate, entityWrapper, highlightWrapper, searchWrapper, type DecorRange } from "./decorate";
import { walkText } from "./html";
import { buildSpeech } from "./speech";
import { hashOf } from "../ai/hash";

const PRIORITY = { highlight: 0, entity: 1, search: 2 } as const;

function variantKey(sourceHash: string, rewriteHash: string, formatHash: string, lexiconVersion: string): string {
  return "v" + hashOf(sourceHash, rewriteHash, formatHash, lexiconVersion).slice(0, 12);
}

export const variantKeyOf: VariantKeyOfFn = (src, opts) => {
  const rw = isRewriteFresh(src, opts.rewrite) ? opts.rewrite! : null;
  const fmt = isFormatFresh(src, rw, opts.format) ? opts.format! : null;
  return variantKey(src.sourceHash, rw?.artifactHash ?? "", fmt?.artifactHash ?? "", opts.lexicon.version);
};

function mergeMarker(into: BlockMarker | undefined, m: BlockMarker, hostId: ParaId): BlockMarker {
  const out: BlockMarker = into ? { ...into } : { paraId: hostId };
  if (m.comments) {
    out.comments = {
      ai: (out.comments?.ai ?? 0) + m.comments.ai,
      user: (out.comments?.user ?? 0) + m.comments.user,
    };
  }
  if (m.bookmark) out.bookmark = true;
  if (m.branchPoint) out.branchPoint = true;
  if (m.readMark) out.readMark = true;
  return out;
}

/** Index of the visible para showing `paraId` in a layered chapter (see resolveAnchor). */
function resolveIn(layered: LayerResult["paras"], byId: Map<ParaId, number>, paraId: ParaId): number {
  const i = byId.get(paraId);
  if (i === undefined) return -1;
  const p = layered[i];
  if (!p.hidden) return i;
  if (p.mergedInto !== undefined) {
    const h = byId.get(p.mergedInto);
    return h !== undefined && !layered[h].hidden ? h : -1;
  }
  for (let k = i + 1; k < layered.length; k++) if (!layered[k].hidden) return k;
  for (let k = i - 1; k >= 0; k--) if (!layered[k].hidden) return k;
  return -1;
}

export const buildChapter: BuildChapterFn = (src, opts) => {
  const lex = compileLexicon(opts.lexicon);
  const layers = applyLayers(src, opts.rewrite, opts.format);
  const ids = src.paras.map((p) => p.id);
  const byIdMap = new Map<ParaId, number>();
  ids.forEach((id, i) => byIdMap.set(id, i));
  const entities = opts.entities && opts.entities.length > 0 ? compileEntities(opts.entities, opts.lexicon) : null;

  // Group annotations and block markers by the visible para that shows them.
  const annByPara = new Map<number, { a: Annotation; direct: boolean }[]>();
  for (const a of opts.annotations ?? []) {
    const at = resolveIn(layers.paras, byIdMap, a.paraId);
    if (at < 0) continue;
    const list = annByPara.get(at);
    const item = { a, direct: ids[at] === a.paraId };
    if (list) list.push(item);
    else annByPara.set(at, [item]);
  }
  const markers = new Map<number, BlockMarker>();
  for (const m of opts.blocks ?? []) {
    const at = resolveIn(layers.paras, byIdMap, m.paraId);
    if (at < 0) continue;
    markers.set(at, mergeMarker(markers.get(at), m, ids[at]));
  }

  const paras: RenderedPara[] = src.paras.map((sp, i) => {
    const lp = layers.paras[i];
    if (lp.hidden) {
      const hidden: RenderedPara = { id: sp.id, sourceIndex: i, hidden: true, covers: lp.covers, html: "", text: "", speech: null, kind: sp.kind };
      if (lp.mergedInto !== undefined) hidden.mergedInto = lp.mergedInto;
      return hidden;
    }

    // 4. lexicon (display)
    const dispHtml = applyLexicon(lp.html, opts.lexicon, "display");
    const map = walkText(dispHtml);

    // 5. annotate
    const skipRanges = map.segs.filter((s) => s.skip && !s.sep).map((s) => [s.start, s.end] as const);
    const blocked = (a: number, b: number) => skipRanges.some(([s, e]) => a < e && b > s);
    const ranges: DecorRange[] = [];
    if (entities) {
      for (const r of matchEntities(map.text, entities, blocked)) {
        ranges.push({ start: r.start, end: r.end, priority: PRIORITY.entity, ...entityWrapper(r.entityId, r.color) });
      }
    }
    for (const { a, direct } of annByPara.get(i) ?? []) {
      if (a.kind === "highlight") {
        // A quote saved from another variant (e.g. Concise) may not occur verbatim: fall back to
        // the best word-overlap span of its host paragraph (QA-P2-2).
        const loc = locateQuote(map.text, a.quote) ?? locateQuoteFuzzy(map.text, a.quote);
        if (loc) ranges.push({ ...loc, priority: PRIORITY.highlight, ...highlightWrapper(a.id, a.tone) });
      } else if (direct) {
        // explicit offsets are only meaningful on the para they were computed for
        const start = Math.max(0, a.start);
        const end = Math.min(map.text.length, a.end);
        if (end <= start || blocked(start, end)) continue;
        ranges.push(a.kind === "entity"
          ? { start, end, priority: PRIORITY.entity, ...entityWrapper(a.entityId, a.color) }
          : { start, end, priority: PRIORITY.search, ...searchWrapper() });
      }
    }

    // 6. decorate, 7. project
    const html = ranges.length > 0 ? decorate(map, ranges) : dispHtml;
    const out: RenderedPara = {
      id: sp.id,
      sourceIndex: i,
      hidden: false,
      covers: lp.covers,
      html,
      text: map.text,
      speech: sp.kind === "image" ? null : buildSpeech(lp.html, lex),
      kind: sp.kind,
    };
    const marker = markers.get(i);
    if (marker) out.marker = marker;
    return out;
  });

  const visible: number[] = [];
  const byId: Record<ParaId, number> = {};
  paras.forEach((p, i) => {
    byId[p.id] = i;
    if (!p.hidden) visible.push(i);
  });

  return {
    chapterId: src.id,
    variantKey: variantKey(
      src.sourceHash,
      layers.appliedRewrite?.artifactHash ?? "",
      layers.appliedFormat?.artifactHash ?? "",
      opts.lexicon.version,
    ),
    paras,
    visible,
    byId,
  };
};

/**
 * Index into `ch.paras` of the rendered para that shows `paraId`: itself if visible; its merge
 * host if merged; the next visible para if dropped (or the previous one at the end); -1 if the
 * id is unknown or nothing is visible.
 */
export const resolveAnchor: ResolveAnchorFn = (ch, paraId) => {
  const i = ch.byId[paraId];
  if (i === undefined) return -1;
  const p = ch.paras[i];
  if (!p.hidden) return i;
  if (p.mergedInto !== undefined) {
    const seen = new Set<ParaId>([paraId]);
    let cur = p.mergedInto;
    while (!seen.has(cur)) {
      seen.add(cur);
      const h = ch.byId[cur];
      if (h === undefined) break;
      const hp = ch.paras[h];
      if (!hp.hidden) return h;
      if (hp.mergedInto === undefined) break;
      cur = hp.mergedInto;
    }
  }
  for (let k = i + 1; k < ch.paras.length; k++) if (!ch.paras[k].hidden) return k;
  for (let k = i - 1; k >= 0; k--) if (!ch.paras[k].hidden) return k;
  return -1;
};

/** The visible paras' text (speed reader / search). */
export function visibleText(ch: RenderedChapter): string[] {
  return ch.visible.map((i) => ch.paras[i].text);
}
