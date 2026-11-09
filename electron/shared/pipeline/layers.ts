/**
 * Layers 1–2: rewrite (polish | concise) and format (markup only) (owner: WS-C).
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * Rules (AI_AUDIT §4.4.4 / §4.5):
 * - Both layers are keyed by SOURCE ParaId. A layer may replace a paragraph's html, drop it
 *   (rewrite) or merge it into another paragraph (format). It never reorders or inserts.
 * - Rewrite is applied only if `rewrite.sourceHash === src.sourceHash`.
 * - Format is applied only if its base still matches: `base:"source"` needs no applied rewrite and
 *   `baseHash === src.sourceHash`; `base:"rewrite"` needs the applied rewrite's `artifactHash`.
 *   Otherwise the layer is stale and ignored (the orchestrator re-queues it).
 * - Layer html is sanitized with the `ai-format` policy here as well (defence in depth; main also
 *   sanitizes on artifact write).
 */

import type { FormatLayer, LayerState, ParaId, RewriteLayer, SourceChapter } from "./types";
import { sanitizeHtml } from "./sanitize";

export interface LayeredPara {
  /** Html after rewrite/format (sanitized), or the source html. "" when hidden. */
  html: string;
  hidden: boolean;
  dropped: boolean;
  mergedInto?: ParaId;
  /** Source paras shown by this para (itself first, then merged paras in source order). */
  covers: ParaId[];
  /** Which layer produced `html`. */
  from: "source" | "rewrite" | "format";
}

export interface LayerResult {
  paras: LayeredPara[];
  rewrite: LayerState;
  format: LayerState;
  /** The layers actually applied (null when not applied); used for the variant key. */
  appliedRewrite: RewriteLayer | null;
  appliedFormat: FormatLayer | null;
}

export function isRewriteFresh(src: Pick<SourceChapter, "sourceHash">, rw: RewriteLayer | null | undefined): boolean {
  return !!rw && rw.sourceHash === src.sourceHash;
}

export function isFormatFresh(
  src: Pick<SourceChapter, "sourceHash">,
  appliedRewrite: RewriteLayer | null | undefined,
  fmt: FormatLayer | null | undefined,
): boolean {
  if (!fmt) return false;
  if (fmt.base === "source") return !appliedRewrite && fmt.baseHash === src.sourceHash;
  return !!appliedRewrite && fmt.baseHash === appliedRewrite.artifactHash;
}

// Sanitized layer html, memoized per layer object (layers are immutable once fetched).
const sanitizedCache = new WeakMap<object, Map<ParaId, string>>();
function sanitizedHtml(layer: object, id: ParaId, html: string): string {
  let m = sanitizedCache.get(layer);
  if (!m) sanitizedCache.set(layer, (m = new Map()));
  let v = m.get(id);
  if (v === undefined) m.set(id, (v = sanitizeHtml(html, "ai-format")));
  return v;
}

/** Apply rewrite then format to a source chapter. Stale layers are ignored. */
export function applyLayers(
  src: SourceChapter,
  rewrite?: RewriteLayer | null,
  format?: FormatLayer | null,
): LayerResult {
  const rwApplied = isRewriteFresh(src, rewrite) ? rewrite! : null;
  const fmtApplied = isFormatFresh(src, rwApplied, format) ? format! : null;

  const index = new Map<ParaId, number>();
  src.paras.forEach((p, i) => index.set(p.id, i));

  // 1. rewrite
  const paras: LayeredPara[] = src.paras.map((p) => {
    const e = rwApplied?.paras[p.id];
    if (e && "dropped" in e && e.dropped) return { html: "", hidden: true, dropped: true, covers: [p.id], from: "rewrite" };
    if (e && "html" in e && typeof e.html === "string") {
      const html = sanitizedHtml(rwApplied!, p.id, e.html);
      if (!html.trim()) return { html: "", hidden: true, dropped: true, covers: [p.id], from: "rewrite" };
      return { html, hidden: false, dropped: false, covers: [p.id], from: "rewrite" };
    }
    return { html: p.html, hidden: false, dropped: false, covers: [p.id], from: "source" };
  });

  // 2. format
  if (fmtApplied) {
    // html replacements first (dropped paras stay dropped)
    src.paras.forEach((p, i) => {
      const e = fmtApplied.paras[p.id];
      if (!e || paras[i].dropped || !("html" in e) || typeof e.html !== "string") return;
      paras[i].html = sanitizedHtml(fmtApplied, p.id, e.html);
      paras[i].from = "format";
    });

    // merges: resolve chains to a visible host; invalid targets/cycles leave the para visible
    const hostOf = (id: ParaId): number => {
      const seen = new Set<ParaId>();
      let cur = id;
      for (;;) {
        if (seen.has(cur)) return -1;
        seen.add(cur);
        const e = fmtApplied.paras[cur];
        if (!e || !("mergedInto" in e)) break;
        if (!index.has(e.mergedInto)) return -1;
        cur = e.mergedInto;
      }
      const i = index.get(cur);
      return i === undefined || cur === id || paras[i].dropped ? -1 : i;
    };
    src.paras.forEach((p, i) => {
      const e = fmtApplied.paras[p.id];
      if (!e || !("mergedInto" in e) || paras[i].dropped) return;
      const h = hostOf(p.id);
      if (h < 0) return;
      paras[i] = { html: "", hidden: true, dropped: false, mergedInto: src.paras[h].id, covers: [p.id], from: "format" };
      paras[h].covers.push(p.id);
    });
  }

  const state = (layer: unknown, applied: unknown): LayerState => (!layer ? "none" : applied ? "applied" : "stale");
  return {
    paras,
    rewrite: state(rewrite, rwApplied),
    format: state(format, fmtApplied),
    appliedRewrite: rwApplied,
    appliedFormat: fmtApplied,
  };
}
