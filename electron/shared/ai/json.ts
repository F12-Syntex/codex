/**
 * Loose JSON extraction/repair for model output (owner: WS-A).
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * `parseJsonLoose(text)` handles what models actually send:
 * - Markdown fences (```json … ```, unterminated fences), `<think>` blocks, chatty preambles and
 *   trailing commentary after the JSON.
 * - Unescaped double quotes inside strings (`"He said "no" twice"`), raw control characters
 *   (newlines, tabs) inside strings, invalid escapes (`\q`), trailing commas, missing commas
 *   between items, `//` and block comments, unquoted keys, Python literals (True/False/None).
 * - Truncation (finish_reason "length"): the output is cut back to the last COMPLETE value and all
 *   open containers are closed, so complete items of a batch are salvaged and a half-written item
 *   is dropped. `truncated: true` tells the caller.
 * - `[[…]]` flattening: a top-level array whose items are all arrays is flattened (opt-out).
 *
 * Throws `JsonParseError` when nothing usable is found.
 */

export interface LooseJson<T = unknown> {
  value: T;
  /** Anything had to be changed beyond fence/preamble stripping. */
  repaired: boolean;
  /** The JSON ended mid-structure and was closed after the last complete value. */
  truncated: boolean;
  /** What was done, for logs ("fence", "preamble", "control-chars", "inner-quotes", …). */
  notes: string[];
}

export interface LooseJsonOptions {
  /** Flatten a top-level array of arrays (`[[a],[b]]` → `[a, b]`). Default true. */
  flatten?: boolean;
}

export class JsonParseError extends Error {
  constructor(message: string, readonly snippet: string) {
    super(message);
    this.name = "JsonParseError";
  }
}

export function parseJsonLoose<T = unknown>(text: string, opts: LooseJsonOptions = {}): LooseJson<T> {
  const notes: string[] = [];
  const candidate = extractJsonCandidate(text, notes);
  let value: unknown;
  let repaired = false;
  let truncated = false;

  try {
    value = JSON.parse(candidate);
  } catch {
    const r = repairJson(candidate);
    notes.push(...r.notes);
    repaired = true;
    truncated = r.truncated;
    try {
      value = JSON.parse(r.text);
    } catch (err) {
      throw new JsonParseError(`Could not parse JSON: ${err instanceof Error ? err.message : String(err)}`, snippet(candidate));
    }
  }

  if (opts.flatten !== false && Array.isArray(value) && value.length > 0 && value.every(Array.isArray)) {
    value = (value as unknown[][]).flat();
    notes.push("flattened");
    repaired = true;
  }
  return { value: value as T, repaired, truncated, notes };
}

function snippet(s: string): string {
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

/** Strip `<think>`, fences and preamble; return text starting at the first `{` or `[`. */
export function extractJsonCandidate(text: string, notes: string[] = []): string {
  let t = (text ?? "").replace(/^﻿/, "");
  if (/<think>/i.test(t)) {
    t = t.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "");
    notes.push("think");
  }
  // Closed fences: prefer the first one containing JSON-ish content.
  const fenceRe = /```[\w-]*[^\S\n]*\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let fenced: string | null = null;
  while ((m = fenceRe.exec(t))) {
    if (/[[{]/.test(m[1])) {
      fenced = m[1];
      break;
    }
  }
  if (fenced === null) {
    const open = /```[\w-]*[^\S\n]*\n?([\s\S]*)$/.exec(t); // unterminated fence (truncation)
    if (open && /[[{]/.test(open[1])) fenced = open[1];
  }
  if (fenced !== null) {
    t = fenced;
    notes.push("fence");
  }
  const start = t.search(/[[{]/);
  if (start < 0) throw new JsonParseError("No JSON object or array found in the response", snippet(text ?? ""));
  if (t.slice(0, start).trim()) notes.push("preamble");
  return t.slice(start).trim();
}

// ── Repair ──────────────────────────────────────────────────────────────────

type FrameType = "{" | "[";
type FrameState = "key" | "colon" | "value" | "comma";
interface Frame { type: FrameType; state: FrameState }

export interface RepairResult { text: string; truncated: boolean; notes: string[] }

const WS = /\s/;
const TOKEN_CHAR = /[A-Za-z0-9_+\-.$]/;

/**
 * Single-pass repair. `text` must start at the opening `{` / `[`. Stops at the end of the first
 * top-level value (trailing commentary is dropped).
 */
export function repairJson(text: string): RepairResult {
  const notes = new Set<string>();
  let out = "";
  const stack: Frame[] = [];
  // Last point where the output is a valid prefix ending after a complete value (or an opened array).
  let safe: { len: number; frames: FrameType[] } | null = null;
  let i = 0;
  const n = text.length;
  let finished = false;

  const top = () => stack[stack.length - 1];
  const markSafe = () => {
    safe = { len: out.length, frames: stack.map((f) => f.type) };
  };
  const valueDone = () => {
    const f = top();
    if (f) f.state = "comma";
    markSafe();
  };
  /** Prepare for a new value / key in the current frame (inserts missing commas). */
  const beforeItem = () => {
    const f = top();
    if (!f) return;
    if (f.state === "comma") {
      out += ",";
      notes.add("missing-comma");
      f.state = f.type === "{" ? "key" : "value";
    }
    if (f.type === "{" && f.state === "colon") {
      out += ":";
      notes.add("missing-colon");
      f.state = "value";
    }
  };
  const stripTrailingComma = () => {
    const trimmed = out.replace(/\s+$/, "");
    if (trimmed.endsWith(",")) {
      out = trimmed.slice(0, -1);
      notes.add("trailing-comma");
    } else if (trimmed.endsWith(":")) {
      // `{"a": }` → drop the dangling key
      out = trimmed.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:$/, "");
      notes.add("dangling-key");
    }
  };

  /** Does the quote at `q` close the current string? (heuristic for unescaped inner quotes) */
  const closesString = (q: number, isKey: boolean): boolean => {
    let j = q + 1;
    while (j < n && WS.test(text[j])) j++;
    if (j >= n) return true;
    const c = text[j];
    if (isKey) return c === ":" || c === "}";
    if (c === "}" || c === "]") return true;
    if (c === ":") return false;
    if (c === '"') return true; // missing comma before the next string
    if (c === ",") {
      let k = j + 1;
      while (k < n && WS.test(text[k])) k++;
      if (k >= n) return true;
      const d = text[k];
      const f = top();
      if (f?.type === "{") return d === '"' || d === "}";
      return d === '"' || d === "{" || d === "[" || d === "]" || /[-0-9tfn]/.test(d);
    }
    return false;
  };

  const readString = (isKey: boolean): boolean => {
    // text[i] === '"'
    let s = '"';
    i++;
    while (i < n) {
      const c = text[i];
      if (c === "\\") {
        const nx = text[i + 1];
        if (nx === undefined) { i++; break; }
        if (nx === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) { s += "\\u" + hex; i += 6; continue; }
          if (i + 6 > n) { i = n; break; } // truncated escape
          s += "\\\\u"; i += 2; notes.add("bad-escape"); continue;
        }
        if ('"\\/bfnrt'.includes(nx)) { s += c + nx; i += 2; continue; }
        s += "\\\\" + (nx === "\n" ? "\\n" : nx);
        i += 2;
        notes.add("bad-escape");
        continue;
      }
      if (c === '"') {
        if (closesString(i, isKey)) {
          out += s + '"';
          i++;
          return true;
        }
        s += '\\"';
        notes.add("inner-quotes");
        i++;
        continue;
      }
      const code = c.charCodeAt(0);
      if (code < 0x20) {
        s += c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : "\\u" + code.toString(16).padStart(4, "0");
        notes.add("control-chars");
        i++;
        continue;
      }
      s += c;
      i++;
    }
    return false; // EOF inside the string
  };

  const closeFrame = (type: FrameType) => {
    stripTrailingComma();
    out += type === "{" ? "}" : "]";
    stack.pop();
    if (stack.length === 0) {
      finished = true;
      return;
    }
    valueDone();
  };

  while (i < n && !finished) {
    const c = text[i];
    const f = top();

    if (WS.test(c)) { i++; continue; }

    // comments
    if (c === "/" && text[i + 1] === "/") {
      const e = text.indexOf("\n", i);
      i = e < 0 ? n : e + 1;
      notes.add("comments");
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const e = text.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      notes.add("comments");
      continue;
    }

    if (c === "{" || c === "[") {
      if (f && f.type === "{" && f.state === "key") {
        // a container where a key should be: skip the stray char
        i++; notes.add("stray"); continue;
      }
      beforeItem();
      out += c;
      stack.push({ type: c, state: c === "{" ? "key" : "value" });
      if (c === "[") markSafe();
      i++;
      continue;
    }

    if (c === "}" || c === "]") {
      const want: FrameType = c === "}" ? "{" : "[";
      if (!f) { i++; continue; }
      if (f.type !== want) {
        // mismatched closer: close intermediates if a matching opener exists, else ignore
        if (stack.some((x) => x.type === want)) {
          while (top() && top()!.type !== want) closeFrame(top()!.type);
          notes.add("mismatched");
          if (finished) break;
        } else {
          i++; notes.add("stray"); continue;
        }
      }
      closeFrame(want);
      i++;
      continue;
    }

    if (c === ",") {
      if (f) {
        if (f.state === "comma") {
          out += ",";
          f.state = f.type === "{" ? "key" : "value";
        } else {
          notes.add("extra-comma");
        }
      }
      i++;
      continue;
    }

    if (c === ":") {
      if (f && f.type === "{" && f.state === "colon") {
        out += ":";
        f.state = "value";
      } else notes.add("stray");
      i++;
      continue;
    }

    if (c === '"' || c === "“" || c === "”") {
      if (c !== '"') { notes.add("smart-quotes"); }
      const isKey = !!f && f.type === "{" && (f.state === "key" || f.state === "comma");
      beforeItem();
      if (c !== '"') {
        // treat a smart quote used as a JSON delimiter like '"'
        text = text.slice(0, i) + '"' + text.slice(i + 1);
      }
      const ok = readString(isKey);
      if (!ok) break; // truncated inside a string
      if (isKey) top()!.state = "colon";
      else valueDone();
      continue;
    }

    if (TOKEN_CHAR.test(c)) {
      let j = i;
      while (j < n && TOKEN_CHAR.test(text[j])) j++;
      const tok = text.slice(i, j);
      const atEof = j >= n;
      const isKey = !!f && f.type === "{" && (f.state === "key" || f.state === "comma");
      if (isKey) {
        beforeItem();
        out += JSON.stringify(tok);
        notes.add("unquoted-keys");
        top()!.state = "colon";
        i = j;
        continue;
      }
      const lit = normaliseLiteral(tok);
      if (lit === undefined) {
        // bare word in value position → string
        if (atEof) break;
        beforeItem();
        out += JSON.stringify(tok);
        notes.add("bare-words");
        valueDone();
        i = j;
        continue;
      }
      if (atEof && /^-?[\d.eE+-]+$/.test(tok)) break; // number may be cut short
      if (lit !== tok) notes.add("literals");
      beforeItem();
      out += lit;
      valueDone();
      i = j;
      continue;
    }

    // anything else outside a string is noise
    notes.add("stray");
    i++;
  }

  if (finished) return { text: out, truncated: false, notes: [...notes] };
  if (stack.length === 0) return { text: out, truncated: false, notes: [...notes] };

  // Truncated: cut back to the last complete value and close what was open there.
  notes.add("truncated");
  const s = safe as { len: number; frames: FrameType[] } | null;
  if (!s) {
    const first = stack[0].type;
    return { text: first === "{" ? "{}" : "[]", truncated: true, notes: [...notes] };
  }
  let text2 = out.slice(0, s.len).replace(/[\s,]+$/, "");
  for (let k = s.frames.length - 1; k >= 0; k--) text2 += s.frames[k] === "{" ? "}" : "]";
  return { text: text2, truncated: true, notes: [...notes] };
}

function normaliseLiteral(tok: string): string | undefined {
  if (tok === "true" || tok === "false" || tok === "null") return tok;
  if (tok === "True") return "true";
  if (tok === "False") return "false";
  if (tok === "None" || tok === "undefined" || tok === "NaN" || tok === "Infinity" || tok === "-Infinity") return "null";
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(tok)) return tok;
  // leading zeros / leading plus / trailing dot: normalise through Number when sensible
  if (/^[+-]?\d*\.?\d+([eE][+-]?\d+)?$|^[+-]?\d+\.$/.test(tok)) {
    const v = Number(tok);
    return Number.isFinite(v) ? String(v) : undefined;
  }
  return undefined;
}
