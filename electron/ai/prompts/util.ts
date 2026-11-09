/**
 * Small pure helpers shared by the chapter prompts and tasks (owner: WS-D).
 *
 * PURE: no `electron`, Node or DOM imports.
 * JSON parsing is WS-A's (`ctx.completeJson` → `shared/ai/json.ts`); hashing is `shared/ai/hash.ts`.
 */

// ── Hashing (WS-A) ──────────────────────────────────────────────────────────

export { fnv1a64, hashOf, stableStringify } from "../../shared/ai/hash";

// ── Text ────────────────────────────────────────────────────────────────────

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…",
  mdash: "—", ndash: "–",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

const VOID_TAGS = new Set(["br", "hr", "img", "wbr", "input", "meta", "link", "source", "col", "area", "base", "embed", "track", "param"]);
const BLOCK_TAGS = new Set(["p", "div", "li", "tr", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "ul", "ol"]);

/**
 * Visible text of an html fragment. Subtrees whose root carries `data-tts-skip` (speaker badges)
 * are excluded, so text-preservation checks ignore inserted badges. Block boundaries become spaces.
 */
export function visibleText(html: string): string {
  const out: string[] = [];
  const stack: { tag: string; skip: boolean }[] = [];
  let skipDepth = 0;
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [token, rawTag, attrs, text] = m;
    if (text !== undefined || token === "<") {
      if (skipDepth === 0) out.push(text ?? "<");
      continue;
    }
    if (!rawTag) continue; // comment
    const tag = rawTag.toLowerCase();
    if (token.startsWith("</")) {
      // Pop to the matching element (tolerates unclosed children).
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          for (let j = stack.length - 1; j >= i; j--) if (stack[j].skip) skipDepth--;
          stack.length = i;
          break;
        }
      }
      if (BLOCK_TAGS.has(tag) && skipDepth === 0) out.push(" ");
      continue;
    }
    if (BLOCK_TAGS.has(tag) && skipDepth === 0) out.push(" ");
    if (VOID_TAGS.has(tag) || token.endsWith("/>")) continue;
    const skip = /(^|\s)data-tts-skip(\s|=|$)/i.test(attrs ?? "");
    if (skip) skipDepth++;
    stack.push({ tag, skip });
  }
  return decodeEntities(out.join("")).replace(/\s+/g, " ").trim();
}

/** ASCII + common Unicode punctuation/symbol ranges (no `u` flag: the root tsconfig targets ES2017). */
const PUNCT_RE = /[!-\/:-@\[-`{-~\u00A1-\u00BF\u00D7\u00F7\u2010-\u2027\u2030-\u205E\u3000-\u303F\uFF01-\uFF0F]+/g;

export function words(text: string): string[] {
  const t = text.trim();
  return t ? t.split(/\s+/) : [];
}

export function wordCount(text: string): number {
  return words(text).length;
}

/**
 * Normalised word-level similarity in [0, 1]: 1 − levenshtein(words) / max(len). Case and
 * punctuation-insensitive. Bounded: very long inputs are compared in O(n·m) words, which is fine
 * for paragraph-sized text.
 */
export function textSimilarity(a: string, b: string): number {
  const norm = (s: string) => words(s.toLowerCase().replace(PUNCT_RE, " "));
  const wa = norm(a);
  const wb = norm(b);
  if (wa.length === 0 && wb.length === 0) return 1;
  if (wa.length === 0 || wb.length === 0) return 0;
  let prev = new Array<number>(wb.length + 1);
  let cur = new Array<number>(wb.length + 1);
  for (let j = 0; j <= wb.length; j++) prev[j] = j;
  for (let i = 1; i <= wa.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= wb.length; j++) {
      const cost = wa[i - 1] === wb[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[wb.length] / Math.max(wa.length, wb.length);
}

/** Quoted dialogue segments (straight or curly double quotes), in order. */
export function quotedSegments(text: string): string[] {
  const out: string[] = [];
  const re = /“([^”]*)”|"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push((m[1] ?? m[2] ?? "").trim());
  return out;
}

/** True when a paragraph is only dialogue: nothing but quotes, punctuation and whitespace outside them. */
export function isDialogueOnly(text: string): boolean {
  if (quotedSegments(text).length === 0) return false;
  const outside = text.replace(/\u201C[^\u201D]*\u201D|"[^"]*"/g, "");
  return outside.replace(PUNCT_RE, "").trim() === "";
}

// ── Chunking ────────────────────────────────────────────────────────────────

/** Split items into consecutive chunks of at most `maxChars` (an item larger than that is alone). */
export function chunkBySize<T>(items: T[], size: (item: T) => number, maxChars: number): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  let curSize = 0;
  for (const item of items) {
    const s = size(item);
    if (cur.length > 0 && curSize + s > maxChars) {
      chunks.push(cur);
      cur = [];
      curSize = 0;
    }
    cur.push(item);
    curSize += s;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}
