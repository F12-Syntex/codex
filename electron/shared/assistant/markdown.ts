/**
 * Tiny Markdown parser for assistant messages (owner: WS-E). Produces a plain AST that the
 * renderer turns into React elements — never HTML strings, never innerHTML.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * Supported (AI_AUDIT §4.4.7 subset): paragraphs, `###`/`####` headings (`#`/`##` are demoted to
 * h3), `-`/`*`/`1.` lists (one level), `>` blockquotes, fenced code, `**strong**`, `*em*`/`_em_`,
 * `` `code` ``, plus the assistant dialect from `./markers.ts`: `[^n]` citation chips and
 * `[Name](entity:id)` entity links. Any other link renders as its text (no navigation).
 */

export type MdInline =
  | { t: "text"; v: string }
  | { t: "strong"; c: MdInline[] }
  | { t: "em"; c: MdInline[] }
  | { t: "code"; v: string }
  | { t: "entity"; id: string; name: string }
  | { t: "cite"; n: number }
  | { t: "br" };

export type MdBlock =
  | { t: "p"; c: MdInline[] }
  | { t: "h"; level: 3 | 4; c: MdInline[] }
  | { t: "list"; ordered: boolean; items: MdInline[][] }
  | { t: "quote"; c: MdBlock[] }
  | { t: "code"; v: string };

// ── Inline ──────────────────────────────────────────────────────────────────

function pushText(out: MdInline[], v: string): void {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.t === "text") last.v += v;
  else out.push({ t: "text", v });
}

/** Find the closing delimiter that is not immediately preceded by whitespace. */
function findClose(s: string, from: number, delim: string): number {
  let i = s.indexOf(delim, from);
  while (i >= 0) {
    if (i > from && !/\s/.test(s[i - 1])) return i;
    i = s.indexOf(delim, i + 1);
  }
  return -1;
}

export function parseInline(s: string, depth = 0): MdInline[] {
  const out: MdInline[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    // Citation chip [^n]
    if (ch === "[" && s[i + 1] === "^") {
      const m = /^\[\^(\d{1,3})\]/.exec(s.slice(i));
      if (m) {
        out.push({ t: "cite", n: Number(m[1]) });
        i += m[0].length;
        continue;
      }
    }
    // Link [text](target)
    if (ch === "[") {
      const m = /^\[([^\]\n]{1,200})\]\(([^)\s]{1,300})\)/.exec(s.slice(i));
      if (m) {
        const target = m[2];
        if (target.startsWith("entity:")) out.push({ t: "entity", id: target.slice(7), name: m[1] });
        else pushText(out, m[1]);
        i += m[0].length;
        continue;
      }
    }
    // Inline code
    if (ch === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i + 1) {
        out.push({ t: "code", v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // Strong ** / __
    if ((ch === "*" || ch === "_") && s[i + 1] === ch && depth < 4) {
      const delim = ch + ch;
      const end = findClose(s, i + 2, delim);
      if (end > i + 2 && !/\s/.test(s[i + 2])) {
        out.push({ t: "strong", c: parseInline(s.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    // Emphasis * / _ (underscore only at a word boundary, so snake_case survives)
    if ((ch === "*" || (ch === "_" && (i === 0 || /[\s(]/.test(s[i - 1])))) && depth < 4) {
      const end = findClose(s, i + 1, ch);
      const okEnd = end > i + 1 && (ch === "*" || end + 1 >= s.length || /[\s.,;:!?)]/.test(s[end + 1]));
      if (okEnd && !/\s/.test(s[i + 1]) && s[end + 1] !== ch) {
        out.push({ t: "em", c: parseInline(s.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    // Hard break: two trailing spaces or a single newline inside a paragraph
    if (ch === "\n") {
      out.push({ t: "br" });
      i++;
      continue;
    }
    pushText(out, ch);
    i++;
  }
  // Trim trailing whitespace text left by the source.
  const last = out[out.length - 1];
  if (last && last.t === "text") {
    last.v = last.v.replace(/\s+$/, "");
    if (!last.v) out.pop();
  }
  return out;
}

// ── Blocks ──────────────────────────────────────────────────────────────────

const LIST_RE = /^\s{0,3}(?:[-*•+]|(\d{1,3})[.)])\s+(.*)$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const c = parseInline(para.join("\n").trim());
      if (c.length) blocks.push({ t: "p", c });
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      flushPara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or EOF)
      blocks.push({ t: "code", v: body.join("\n") });
      continue;
    }

    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      flushPara();
      blocks.push({ t: "h", level: h[1].length >= 4 ? 4 : 3, c: parseInline(h[2]) });
      i++;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      flushPara();
      const body: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^\s{0,3}>\s?/, ""));
      blocks.push({ t: "quote", c: parseMarkdown(body.join("\n")) });
      continue;
    }

    const li = LIST_RE.exec(line);
    if (li) {
      flushPara();
      const ordered = li[1] !== undefined;
      const items: MdInline[][] = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i]);
        if (m && (m[1] !== undefined) === ordered) {
          items.push(parseInline(m[2]));
          i++;
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          // continuation line of the previous item
          items[items.length - 1].push({ t: "text", v: " " }, ...parseInline(lines[i].trim()));
          i++;
        } else break;
      }
      blocks.push({ t: "list", ordered, items });
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

/** Plain text of an inline run (for titles, aria labels and copy-to-clipboard). */
export function inlineText(c: MdInline[]): string {
  return c
    .map((n) => {
      switch (n.t) {
        case "text": case "code": return n.v;
        case "strong": case "em": return inlineText(n.c);
        case "entity": return n.name;
        case "br": return "\n";
        case "cite": return "";
      }
    })
    .join("");
}

/** Plain text of a whole document. */
export function markdownToPlainText(src: string): string {
  return parseMarkdown(src)
    .map((b) => {
      switch (b.t) {
        case "p": case "h": return inlineText(b.c);
        case "list": return b.items.map((it) => `• ${inlineText(it)}`).join("\n");
        case "quote": return b.c.map((x) => (x.t === "p" || x.t === "h" ? inlineText(x.c) : "")).join("\n");
        case "code": return b.v;
      }
    })
    .join("\n\n");
}
