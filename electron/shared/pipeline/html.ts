/**
 * Minimal HTML tokenizer, entity codec and text walker shared by the pipeline (owner: WS-C).
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * - `tokenizeHtml` is forgiving (it never throws) and follows the HTML tokenizer closely enough
 *   for an allowlist sanitizer: quoted attribute values may contain `>` and `<`, raw-text
 *   elements (`script`, `style`, …) swallow everything up to their end tag, an unterminated tag
 *   at EOF is dropped.
 * - `walkText` maps the visible text of (already sanitized) html onto its text tokens. Every
 *   projection (lexicon, annotate, decorate, speech) uses it, so word counts agree everywhere.
 */

export interface HtmlAttr {
  /** Lowercased. */
  name: string;
  /** Raw (entity-encoded) value; null for a bare attribute. */
  value: string | null;
}

export type HtmlToken =
  | { type: "text"; raw: string; rawText?: boolean }
  | { type: "start"; name: string; attrs: HtmlAttr[]; selfClosing: boolean; raw: string }
  | { type: "end"; name: string; raw: string }
  | { type: "comment"; raw: string };

/** Elements whose content is raw text up to the matching end tag. */
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]);

export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

/** Elements that start a new line of visible text (word separator for projections). */
export const BLOCK_ELEMENTS = new Set([
  "address", "article", "aside", "blockquote", "center", "dd", "div", "dl", "dt", "figcaption", "figure",
  "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre",
  "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul", "caption",
]);

function isAsciiAlpha(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 12 || c === 13;
}

interface TagParse {
  name: string;
  attrs: HtmlAttr[];
  selfClosing: boolean;
  /** Index just past the closing `>`; -1 if the tag runs to EOF (dropped). */
  end: number;
}

/** Parse a tag whose name starts at `i` (just after `<` or `</`). */
function parseTag(html: string, i: number): TagParse {
  const n = html.length;
  let j = i;
  while (j < n) {
    const c = html.charCodeAt(j);
    if (isSpace(c) || c === 47 /* / */ || c === 62 /* > */) break;
    j++;
  }
  const name = html.slice(i, j).toLowerCase();
  const attrs: HtmlAttr[] = [];
  let selfClosing = false;

  while (j < n) {
    let c = html.charCodeAt(j);
    if (isSpace(c)) { j++; continue; }
    if (c === 47) { selfClosing = true; j++; continue; }
    if (c === 62) return { name, attrs, selfClosing, end: j + 1 };
    selfClosing = false;
    // attribute name (a leading "=" belongs to the name, per the HTML tokenizer)
    const ns = j;
    j++;
    while (j < n) {
      c = html.charCodeAt(j);
      if (isSpace(c) || c === 47 || c === 62 || c === 61 /* = */) break;
      j++;
    }
    const attrName = html.slice(ns, j).toLowerCase();
    while (j < n && isSpace(html.charCodeAt(j))) j++;
    if (j < n && html.charCodeAt(j) === 61) {
      j++;
      while (j < n && isSpace(html.charCodeAt(j))) j++;
      if (j >= n) break;
      const q = html.charCodeAt(j);
      if (q === 34 || q === 39) {
        const close = html.indexOf(q === 34 ? '"' : "'", j + 1);
        if (close < 0) return { name, attrs, selfClosing, end: -1 };
        attrs.push({ name: attrName, value: html.slice(j + 1, close) });
        j = close + 1;
      } else {
        const vs = j;
        while (j < n) {
          c = html.charCodeAt(j);
          if (isSpace(c) || c === 62) break;
          j++;
        }
        attrs.push({ name: attrName, value: html.slice(vs, j) });
      }
    } else {
      attrs.push({ name: attrName, value: null });
    }
  }
  return { name, attrs, selfClosing, end: -1 };
}

/** Case-insensitive indexOf for an ASCII-letter needle like "</script". */
function indexOfCI(hay: string, needle: string, from: number): number {
  const re = new RegExp(needle, "gi");
  re.lastIndex = from;
  const m = re.exec(hay);
  return m ? m.index : -1;
}

/** Tokenize html. Never throws; malformed input degrades to text or is dropped. */
export function tokenizeHtml(html: string): HtmlToken[] {
  const out: HtmlToken[] = [];
  const n = html.length;
  let i = 0;
  let textStart = 0;
  const flush = (to: number) => {
    if (to > textStart) out.push({ type: "text", raw: html.slice(textStart, to) });
  };

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const c = lt + 1 < n ? html.charCodeAt(lt + 1) : -1;

    if (isAsciiAlpha(c)) {
      flush(lt);
      const t = parseTag(html, lt + 1);
      if (t.end < 0) { textStart = i = n; break; } // unterminated tag at EOF → dropped
      out.push({ type: "start", name: t.name, attrs: t.attrs, selfClosing: t.selfClosing, raw: html.slice(lt, t.end) });
      i = textStart = t.end;
      if (RAW_TEXT.has(t.name) && !t.selfClosing) {
        let close = indexOfCI(html, "</" + t.name, i);
        if (close < 0) close = n;
        if (close > i) out.push({ type: "text", raw: html.slice(i, close), rawText: true });
        i = textStart = close;
      }
      continue;
    }

    if (c === 47 /* / */ && lt + 2 < n && isAsciiAlpha(html.charCodeAt(lt + 2))) {
      flush(lt);
      const t = parseTag(html, lt + 2);
      if (t.end < 0) { textStart = i = n; break; }
      out.push({ type: "end", name: t.name, raw: html.slice(lt, t.end) });
      i = textStart = t.end;
      continue;
    }

    if (html.startsWith("<!--", lt)) {
      flush(lt);
      const close = html.indexOf("-->", lt + 4);
      const end = close < 0 ? n : close + 3;
      out.push({ type: "comment", raw: html.slice(lt, end) });
      i = textStart = end;
      continue;
    }

    if (c === 33 /* ! */ || c === 63 /* ? */ || c === 47 /* "</" + non-letter: bogus comment */) {
      flush(lt);
      const close = html.indexOf(">", lt + 2);
      const end = close < 0 ? n : close + 1;
      out.push({ type: "comment", raw: html.slice(lt, end) });
      i = textStart = end;
      continue;
    }

    // A literal "<" (e.g. "a < b"); stays inside the current text run.
    i = lt + 1;
  }
  flush(n);
  return out;
}

// ── Entities ────────────────────────────────────────────────────────────────

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "­",
  ensp: " ", emsp: " ", thinsp: " ", zwnj: "‌", zwj: "‍",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", sbquo: "‚",
  ldquo: "“", rdquo: "”", bdquo: "„", hellip: "…", prime: "′", Prime: "″",
  laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›", bull: "•", middot: "·",
  copy: "©", reg: "®", trade: "™", deg: "°", times: "×", divide: "÷",
  plusmn: "±", para: "¶", sect: "§", dagger: "†", Dagger: "‡", euro: "€",
  pound: "£", yen: "¥", cent: "¢", frac12: "½", frac14: "¼", frac34: "¾",
  iexcl: "¡", iquest: "¿", ordf: "ª", ordm: "º", sup1: "¹", sup2: "²", sup3: "³",
  micro: "µ", larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔",
  hearts: "♥", spades: "♠", clubs: "♣", diams: "♦", star: "☆", infin: "∞",
  ne: "≠", le: "≤", ge: "≥", minus: "−", oline: "‾", frasl: "⁄",
  colon: ":", semi: ";", comma: ",", period: ".", excl: "!", quest: "?", lpar: "(", rpar: ")",
  sol: "/", bsol: "\\", num: "#", percnt: "%", dollar: "$", equals: "=", plus: "+", ast: "*",
  lsqb: "[", rsqb: "]", lcub: "{", rcub: "}", verbar: "|", grave: "`", Tab: "\t", NewLine: "\n",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å",
  AElig: "Æ", Ccedil: "Ç", Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë",
  Igrave: "Ì", Iacute: "Í", Icirc: "Î", Iuml: "Ï", ETH: "Ð", Ntilde: "Ñ",
  Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö", Oslash: "Ø",
  Ugrave: "Ù", Uacute: "Ú", Ucirc: "Û", Uuml: "Ü", Yacute: "Ý", THORN: "Þ",
  szlig: "ß", agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä",
  aring: "å", aelig: "æ", ccedil: "ç", egrave: "è", eacute: "é", ecirc: "ê",
  euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï", eth: "ð",
  ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö",
  oslash: "ø", ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý",
  thorn: "þ", yuml: "ÿ", OElig: "Œ", oelig: "œ", Scaron: "Š", scaron: "š",
  Yuml: "Ÿ", fnof: "ƒ", circ: "ˆ", tilde: "˜",
  Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Omega: "Ω", alpha: "α",
  beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", lambda: "λ", mu: "μ",
  pi: "π", sigma: "σ", omega: "ω",
};

/** Entities browsers also decode without the trailing semicolon. */
const LEGACY_NO_SEMI = new Set(["amp", "lt", "gt", "quot", "nbsp", "copy", "reg"]);

const ENTITY_RE = /&(#[xX][0-9a-fA-F]{1,8}|#[0-9]{1,8}|[A-Za-z][A-Za-z0-9]{1,31})(;?)/g;

function codePointToString(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "�";
  return String.fromCodePoint(cp);
}

/** Decode character references. Unknown named references are left as-is. */
export function decodeEntities(s: string): string {
  if (s.indexOf("&") < 0) return s;
  return s.replace(ENTITY_RE, (m: string, body: string, semi: string) => {
    if (body.charCodeAt(0) === 35 /* # */) {
      const hex = body[1] === "x" || body[1] === "X";
      return codePointToString(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    const v = NAMED[body];
    if (v === undefined) return m;
    if (!semi && !LEGACY_NO_SEMI.has(body)) return m;
    return v;
  });
}

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Visible text walk ───────────────────────────────────────────────────────

export interface TextSeg {
  /** Index of the text token in `tokens`; -1 for a synthetic separator. */
  token: number;
  /** Offsets into `TextMap.text`. */
  start: number;
  end: number;
  /** Inside a `[data-tts-skip]` subtree. */
  skip: boolean;
  /** Synthetic "\n" for `<br>` and block boundaries (not part of any text node). */
  sep: boolean;
}

export interface TextMap {
  tokens: HtmlToken[];
  /** Decoded visible text, with "\n" separators between blocks/lines (never doubled, never leading/trailing). */
  text: string;
  segs: TextSeg[];
  /** Decoded text per text-token index (only for text tokens). */
  decoded: Map<number, string>;
}

export function hasAttr(t: { attrs: HtmlAttr[] }, name: string): boolean {
  return t.attrs.some((a) => a.name === name);
}

/**
 * Walk html and build its visible text. Separator rule (structural, independent of the text):
 * a single "\n" is emitted at `<br>` and at block element boundaries, but never at the start,
 * never twice in a row, and trailing separators are removed.
 */
export function walkText(htmlOrTokens: string | HtmlToken[]): TextMap {
  const tokens = typeof htmlOrTokens === "string" ? tokenizeHtml(htmlOrTokens) : htmlOrTokens;
  const segs: TextSeg[] = [];
  const decoded = new Map<number, string>();
  let text = "";
  const stack: { name: string; skip: boolean }[] = [];
  const skipNow = () => (stack.length > 0 ? stack[stack.length - 1].skip : false);

  const sep = () => {
    if (text.length === 0) return;
    const last = segs[segs.length - 1];
    if (last && last.sep) return;
    segs.push({ token: -1, start: text.length, end: text.length + 1, skip: skipNow(), sep: true });
    text += "\n";
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "text") {
      if (t.rawText) continue;
      const d = decodeEntities(t.raw);
      if (!d) continue;
      decoded.set(i, d);
      segs.push({ token: i, start: text.length, end: text.length + d.length, skip: skipNow(), sep: false });
      text += d;
    } else if (t.type === "start") {
      if (t.name === "br") { sep(); continue; }
      if (BLOCK_ELEMENTS.has(t.name)) sep();
      if (VOID_ELEMENTS.has(t.name) || t.selfClosing) continue;
      stack.push({ name: t.name, skip: skipNow() || hasAttr(t, "data-tts-skip") });
    } else if (t.type === "end") {
      if (BLOCK_ELEMENTS.has(t.name)) sep();
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === t.name) { stack.length = k; break; }
      }
    }
  }
  while (segs.length > 0 && segs[segs.length - 1].sep) {
    segs.pop();
    text = text.slice(0, -1);
  }
  return { tokens, text, segs, decoded };
}

/** Rebuild html from tokens, replacing some text tokens' raw html. */
export function serializeTokens(tokens: HtmlToken[], replace?: Map<number, string>): string {
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const r = replace?.get(i);
    out += r !== undefined ? r : tokens[i].raw;
  }
  return out;
}

/** `\S+` runs of `text`. */
export function wordsOf(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}
