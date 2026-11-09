/**
 * Small text helpers for WS-E tasks (main side, pure). Structured output goes through WS-A's
 * `ctx.completeJson` (loose parse + one re-ask); these only normalise strings and html.
 */

export function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function str(v: unknown, max = 2000): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${sp > max * 0.7 ? cut.slice(0, sp) : cut}…`;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k];
    if (k.startsWith("#x")) return String.fromCodePoint(Number.parseInt(k.slice(2), 16) || 32);
    if (k.startsWith("#")) return String.fromCodePoint(Number.parseInt(k.slice(1), 10) || 32);
    return m;
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Visible text of an html fragment (tags dropped, entities decoded, whitespace collapsed). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|iframe|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/**
 * Turn model prose (plain text, Markdown emphasis, or loose `<p>` html) into safe paragraphs:
 * every tag is dropped and the text escaped, then only `<em>`, `<strong>` and `<br>` are
 * re-introduced from emphasis markers. The result needs no further sanitising.
 */
export function toSafeParagraphs(raw: string): string[] {
  let s = raw.replace(/\r\n?/g, "\n");
  // Map html emphasis to markdown before stripping tags, and paragraph tags to blank lines.
  s = s
    .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "*$2*")
    .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "**$2**")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");
  s = decodeEntities(s.replace(/<[^>]*>/g, ""));
  return s
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      let h = escapeHtml(p);
      h = h.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>");
      h = h.replace(/\n/g, "<br>");
      return `<p>${h}</p>`;
    });
}

/** Normalised language tag: "fr-FR" → "fr-FR", "" → "en". */
export function langOf(tag: string | undefined): string {
  const t = (tag ?? "").trim();
  return /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/i.test(t) ? t.replace("_", "-") : "en";
}

export function isEnglish(tag: string | undefined): boolean {
  return langOf(tag).toLowerCase().startsWith("en");
}

/** Display name for a language tag, in English ("de" → "German"). */
export function languageName(tag: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(langOf(tag)) ?? tag;
  } catch {
    return tag;
  }
}
