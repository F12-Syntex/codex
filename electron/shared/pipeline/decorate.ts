/**
 * Layer 6: decorate (owner: WS-C). Wraps text ranges in inline elements without touching tags.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * - Ranges are offsets into `walkText(html).text` (the RenderedPara `text`).
 * - Only text tokens are rewritten; a range crossing element boundaries becomes several wrappers.
 * - Never decorates inside `[data-tts-skip]` subtrees.
 * - Wrapper markup is generated here from validated values only (ids/colours are restricted to
 *   `[A-Za-z0-9_-]`), so decorated html stays safe for `innerHTML`.
 */

import { escapeText, escapeAttr, serializeTokens, type TextMap } from "./html";

export interface DecorRange {
  start: number;
  end: number;
  /** Lower = outer when ranges nest. */
  priority: number;
  open: string;
  close: string;
}

const SAFE_TOKEN = /[^A-Za-z0-9_-]/g;
export const safeToken = (s: string, max = 64) => s.replace(SAFE_TOKEN, "").slice(0, max);

export function entityWrapper(entityId: string, color: string): Pick<DecorRange, "open" | "close"> {
  const id = escapeAttr(entityId.slice(0, 128));
  const c = safeToken(color) || "default";
  return { open: `<span class="wiki-entity wiki-entity-${c}" data-wiki-id="${id}">`, close: "</span>" };
}

export function highlightWrapper(id: string, tone: "quote" | "vocab"): Pick<DecorRange, "open" | "close"> {
  return { open: `<mark class="codex-hl codex-hl-${tone}" data-hl-id="${escapeAttr(id.slice(0, 128))}">`, close: "</mark>" };
}

export function searchWrapper(): Pick<DecorRange, "open" | "close"> {
  return { open: `<mark class="codex-search">`, close: "</mark>" };
}

/** Apply decorations. `map` must be `walkText(html)` of the html being decorated. */
export function decorate(map: TextMap, ranges: readonly DecorRange[]): string {
  const live = ranges.filter((r) => r.end > r.start);
  if (live.length === 0) return serializeTokens(map.tokens);
  const replace = new Map<number, string>();

  for (const seg of map.segs) {
    if (seg.sep || seg.skip) continue;
    const hits = live.filter((r) => r.start < seg.end && r.end > seg.start);
    if (hits.length === 0) continue;
    const decoded = map.decoded.get(seg.token) ?? "";
    // cut points inside this segment
    const cuts = new Set<number>([seg.start, seg.end]);
    for (const r of hits) {
      if (r.start > seg.start) cuts.add(r.start);
      if (r.end < seg.end) cuts.add(r.end);
    }
    const points = Array.from(cuts).sort((a, b) => a - b);
    let out = "";
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const piece = escapeText(decoded.slice(a - seg.start, b - seg.start));
      const covering = hits.filter((r) => r.start <= a && r.end >= b).sort((x, y) => x.priority - y.priority);
      out += covering.map((r) => r.open).join("") + piece + covering.map((r) => r.close).reverse().join("");
    }
    replace.set(seg.token, out);
  }
  return serializeTokens(map.tokens, replace);
}
