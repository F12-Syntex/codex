/**
 * Layer 3: allowlist HTML sanitizer (owner: WS-C). Fixes S0-1.
 *
 * PURE: tokenizer-based, no DOM. The output is re-serialized from scratch: only allowlisted tags
 * and attributes survive, every attribute value and text run is re-escaped, and tags are
 * balanced, so the result is safe for `innerHTML` in a privileged window.
 *
 * Policies:
 * - `book`: parsed EPUB/PDF source. Structural and inline formatting tags; `<a>` becomes `<span>`;
 *   `class`/`title`/`lang`/`dir` plus a few per-tag attributes; `<img>` only with a `data:image/*` src.
 * - `ai-format`: AI-produced markup. `p div span em strong i b br hr ul ol li table thead tbody tr
 *   td th blockquote h1-h6 img`; `class` limited to `ai-fmt-*` tokens; `data-tts-skip`.
 *
 * Always removed (with their content): script, style, iframe/frame, object/embed/applet, svg, math,
 * template, noscript, form controls, link/meta/base, media elements. Always removed: every `on*`
 * handler, `style`, `href`, `id`, `srcset`, and any `src` that isn't `data:image/…`
 * (so `javascript:` and `data:text/html` never survive). Comments and doctypes are dropped.
 */

import type { SanitizeHtmlFn, SanitizePolicy } from "./types";
import { decodeEntities, escapeAttr, escapeText, tokenizeHtml, VOID_ELEMENTS, type HtmlAttr } from "./html";

/** Removed together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "noscript", "noembed",
  "noframes", "template", "head", "title", "svg", "math", "select", "textarea", "button", "input", "option",
  "optgroup", "datalist", "link", "meta", "base", "audio", "video", "source", "track", "canvas", "map",
  "area", "xmp", "plaintext", "portal", "param", "slot",
]);

const BOOK_TAGS = new Set([
  "p", "div", "span", "em", "strong", "i", "b", "u", "s", "strike", "sub", "sup", "small", "big", "br", "hr", "wbr",
  "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup",
  "col", "blockquote", "q", "cite", "abbr", "dfn", "code", "pre", "kbd", "samp", "var", "mark", "del", "ins",
  "h1", "h2", "h3", "h4", "h5", "h6", "img", "figure", "figcaption", "section", "article", "aside", "header",
  "footer", "address", "center", "ruby", "rt", "rp", "bdi", "bdo", "time",
]);

const AI_TAGS = new Set([
  "p", "div", "span", "em", "strong", "i", "b", "br", "hr", "ul", "ol", "li", "table", "thead", "tbody", "tr",
  "td", "th", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "img",
]);

/** Renamed instead of unwrapped (book policy): links lose their target but keep their styling hook. */
const BOOK_RENAME: Record<string, string> = { a: "span", nav: "div", main: "div" };

const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,]/i;
const BOOK_CLASS_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const AI_CLASS_RE = /^ai-fmt-[a-z0-9-]{1,48}$/;
const MAX_DEPTH = 256;

type AttrCheck = (value: string) => string | null;

const digits = (max: number): AttrCheck => (v) => (/^\d{1,6}$/.test(v.trim()) && Number(v) <= max ? String(Number(v)) : null);
const text = (max: number): AttrCheck => (v) => (v.length <= max ? v : v.slice(0, max));

function safeImageSrc(v: string): string | null {
  // Strip whitespace and control characters browsers ignore inside URLs, then allowlist.
  const compact = v.replace(/[\u0000- \u007f-\u009f]+/g, "");
  return DATA_IMAGE_RE.test(compact) ? compact : null;
}

function classFilter(re: RegExp): AttrCheck {
  return (v) => {
    const kept = v.split(/\s+/).filter((c) => c && re.test(c));
    return kept.length > 0 ? Array.from(new Set(kept)).join(" ") : null;
  };
}

const BOOK_GLOBAL_ATTRS: Record<string, AttrCheck> = {
  class: classFilter(BOOK_CLASS_RE),
  title: text(500),
  lang: (v) => (/^[A-Za-z0-9-]{1,35}$/.test(v) ? v : null),
  "xml:lang": (v) => (/^[A-Za-z0-9-]{1,35}$/.test(v) ? v : null),
  dir: (v) => (/^(ltr|rtl|auto)$/i.test(v) ? v.toLowerCase() : null),
};

const BOOK_TAG_ATTRS: Record<string, Record<string, AttrCheck>> = {
  img: { src: safeImageSrc, alt: text(500), width: (v) => (/^\d{1,5}%?$/.test(v) ? v : null), height: (v) => (/^\d{1,5}%?$/.test(v) ? v : null) },
  td: { colspan: digits(1000), rowspan: digits(1000) },
  th: { colspan: digits(1000), rowspan: digits(1000) },
  col: { span: digits(1000) },
  colgroup: { span: digits(1000) },
  ol: { start: digits(1e6), type: (v) => (/^[1aAiI]$/.test(v) ? v : null), reversed: () => "" },
  li: { value: digits(1e6) },
  time: { datetime: text(64) },
};

const AI_GLOBAL_ATTRS: Record<string, AttrCheck> = {
  class: classFilter(AI_CLASS_RE),
  "data-tts-skip": () => "",
};

const AI_TAG_ATTRS: Record<string, Record<string, AttrCheck>> = {
  img: { src: safeImageSrc, alt: text(500) },
  td: { colspan: digits(1000), rowspan: digits(1000) },
  th: { colspan: digits(1000), rowspan: digits(1000) },
};

interface Policy {
  tags: Set<string>;
  rename: Record<string, string>;
  global: Record<string, AttrCheck>;
  perTag: Record<string, Record<string, AttrCheck>>;
}

const POLICIES: Record<SanitizePolicy, Policy> = {
  book: { tags: BOOK_TAGS, rename: BOOK_RENAME, global: BOOK_GLOBAL_ATTRS, perTag: BOOK_TAG_ATTRS },
  "ai-format": { tags: AI_TAGS, rename: {}, global: AI_GLOBAL_ATTRS, perTag: AI_TAG_ATTRS },
};

function renderAttrs(tag: string, attrs: HtmlAttr[], policy: Policy): string | null {
  const per = policy.perTag[tag];
  const seen = new Set<string>();
  let out = "";
  let hasSrc = false;
  for (const a of attrs) {
    let name = a.name;
    if (seen.has(name)) continue; // first occurrence wins, like the HTML parser
    seen.add(name);
    const check = per?.[name] ?? policy.global[name];
    if (!check) continue;
    const value = check(decodeEntities(a.value ?? ""));
    if (value === null) continue;
    if (name === "xml:lang") {
      if (seen.has("lang")) continue;
      name = "lang";
    }
    if (name === "src") hasSrc = true;
    out += value === "" && (name === "data-tts-skip" || name === "reversed") ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
  }
  // An <img> without a safe src is dropped entirely.
  if (tag === "img" && !hasSrc) return null;
  return out;
}

/** Allowlist sanitizer. Default policy: "book". */
export const sanitizeHtml: SanitizeHtmlFn = (html, policyName = "book") => {
  if (!html) return "";
  const policy = POLICIES[policyName] ?? POLICIES.book;
  const tokens = tokenizeHtml(html);
  const open: { source: string; emitted: string }[] = [];
  let out = "";
  /** While > 0 we are inside a dropped element; `dropName` is its tag. */
  let dropDepth = 0;
  let dropName = "";

  for (const t of tokens) {
    if (dropDepth > 0) {
      if (t.type === "start" && t.name === dropName && !t.selfClosing && !VOID_ELEMENTS.has(t.name)) dropDepth++;
      else if (t.type === "end" && t.name === dropName) dropDepth--;
      continue;
    }

    switch (t.type) {
      case "comment":
        break;

      case "text":
        if (t.rawText) break; // raw text of a dropped element (script/style/…)
        out += escapeText(decodeEntities(t.raw).replace(/\u0000/g, ""));
        break;

      case "start": {
        const name = t.name;
        if (DROP_WITH_CONTENT.has(name)) {
          if (!t.selfClosing && !VOID_ELEMENTS.has(name)) {
            dropDepth = 1;
            dropName = name;
          }
          break;
        }
        const emitted = policy.rename[name] ?? name;
        if (!policy.tags.has(emitted)) break; // unwrap: drop the tag, keep its content
        const attrs = renderAttrs(emitted, t.attrs, policy);
        if (attrs === null) break;
        if (VOID_ELEMENTS.has(emitted)) {
          out += `<${emitted}${attrs}>`;
          break;
        }
        if (open.length >= MAX_DEPTH) break;
        out += `<${emitted}${attrs}>`;
        if (t.selfClosing) {
          out += `</${emitted}>`; // "<p/>" in XHTML is an empty element
          break;
        }
        open.push({ source: name, emitted });
        break;
      }

      case "end": {
        for (let k = open.length - 1; k >= 0; k--) {
          if (open[k].source === t.name) {
            while (open.length > k) out += `</${open.pop()!.emitted}>`;
            break;
          }
        }
        break;
      }
    }
  }
  while (open.length > 0) out += `</${open.pop()!.emitted}>`;
  return out;
};

/** Escape plain text and wrap it in a paragraph (parser plain-text paths). */
export function plainTextToHtml(text: string, tag: "p" | "div" = "p"): string {
  return `<${tag}>${escapeText(text)}</${tag}>`;
}
