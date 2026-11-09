/**
 * Deterministic offline replies for the chapter tasks (`CODEX_AI_PROVIDER=fake`, QA-P2-3), so the
 * manual matrix can demo titles, Concise/Polish, formatting and reader comments without a key.
 * Each reply is valid structured output that passes the task's own checks (keys, retention ratio,
 * unchanged dialogue, sanitizer). Never used with a real provider.
 */

import type { CompletionRequest } from "../client";
import { quotedSegments } from "../prompts/util";

/** The most recent user message containing `marker` (a re-ask appends a correction after it). */
function userMessageWith(req: CompletionRequest, marker: string): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m.role === "user" && m.content.includes(marker)) return m.content;
  }
  return "";
}

/** The JSON object that starts at the last `marker` in the request's user message. */
function jsonFrom<T>(req: CompletionRequest, marker: string): T | null {
  const text = userMessageWith(req, marker);
  const at = text.lastIndexOf(marker);
  if (at < 0) return null;
  try {
    return JSON.parse(text.slice(at)) as T;
  } catch {
    return null;
  }
}

const hasDialogue = (t: string) => quotedSegments(t).length > 0 || /[“”"]/.test(t);
const words = (t: string) => t.split(/\s+/).filter(Boolean);
const titleCase = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const STOP = new Set(["the", "and", "a", "an", "of", "to", "in", "on", "at", "for", "with", "was", "were", "is", "he", "she", "it", "they", "his", "her", "their", "had", "chapter", "paragraph"]);

/** `chapter.title`: a 2–3 word title from each chapter's opening. */
export function fakeTitles(req: CompletionRequest): string {
  const text = userMessageWith(req, "exactly these keys:");
  const keys = /exactly these keys: ([^.\n]+)\./.exec(text)?.[1].split(/,\s*/).map((k) => k.trim()).filter(Boolean) ?? [];
  const titles: Record<string, string> = {};
  for (const key of keys) {
    const section = new RegExp(`## ${key}\\n[^\\n]*\\n---\\n([\\s\\S]*?)\\n---`).exec(text)?.[1] ?? "";
    const picked = (section.match(/[\p{L}]{4,}/gu) ?? []).filter((w) => !STOP.has(w.toLowerCase())).slice(0, 2);
    titles[key] = picked.length > 0 ? `The ${picked.map(titleCase).join(" ")}` : "An Untitled Stretch";
  }
  return JSON.stringify({ titles });
}

const POLISH: [RegExp, string][] = [
  [/\bvery\s+/i, ""],
  [/\bbegan to\b/i, "started to"],
  [/\bkept turning\b/i, "kept shifting"],
  [/\bmoved on\b/i, "pressed on"],
  [/\bwalked\b/i, "strode"],
  [/\blooked\b/i, "glanced"],
  [/\bsaid\b/i, "replied"],
];

/**
 * `chapter.condense`: Concise drops evenly spaced words from narration (≈ 15% of the chunk, so
 * retention lands inside 0.75–0.95); Polish swaps a few words (retention ≈ 1.0). Paragraphs with
 * dialogue are returned unchanged (dialogue must stay verbatim).
 */
export function fakeRewrite(req: CompletionRequest): string {
  const parsed = jsonFrom<{ paras?: Record<string, string> }>(req, '{"paras":');
  const paras = parsed?.paras ?? {};
  const mode = /\((concise|polish)\)/.exec(userMessageWith(req, '{"paras":'))?.[1] ?? "concise";
  const out: Record<string, string> = {};
  if (mode === "polish") {
    for (const [k, v] of Object.entries(paras)) {
      let t = v;
      if (!hasDialogue(v)) for (const [re, to] of POLISH) if (re.test(t)) { t = t.replace(re, to); break; }
      out[k] = t;
    }
    return JSON.stringify({ paras: out });
  }
  const total = Object.values(paras).reduce((n, v) => n + words(v).length, 0);
  const narration = Object.values(paras).filter((v) => !hasDialogue(v)).reduce((n, v) => n + words(v).length, 0);
  const toDrop = Math.ceil(total * 0.15);
  const every = narration > 0 && toDrop > 0 ? Math.max(2, Math.floor(narration / toDrop)) : 0;
  for (const [k, v] of Object.entries(paras)) {
    out[k] = every && !hasDialogue(v) ? words(v).filter((_, i) => i % every !== every - 1).join(" ") : v;
  }
  return JSON.stringify({ paras: out });
}

/** `chapter.format`: the first bracketed "[System]"-style paragraph (or else the first one) as a system message. */
export function fakeFormat(req: CompletionRequest): string {
  const parsed = jsonFrom<{ paras?: Record<string, string> }>(req, '{"paras":');
  const entries = Object.entries(parsed?.paras ?? {});
  const inner = (html: string) => html.replace(/^\s*<p[^>]*>/i, "").replace(/<\/p>\s*$/i, "");
  const pick = entries.find(([, v]) => /^\s*(?:<p[^>]*>)?\s*[[【<«]/.test(v)) ?? entries[0];
  if (!pick) return JSON.stringify({ paras: {} });
  return JSON.stringify({ paras: { [pick[0]]: `<div class="ai-fmt-system-msg">${inner(pick[1])}</div>` } });
}

const COMMENTS = ["ok this opening goes hard", "wait what just happened", "lowkey the best part so far", "nah this is getting good"];

/** `chapter.comments`: one or two short reader comments on the chapter's paragraphs. */
export function fakeComments(req: CompletionRequest): string {
  const marker = "keyed by number:\n";
  const text = userMessageWith(req, marker);
  let keys: string[] = [];
  try {
    keys = Object.keys(JSON.parse(text.slice(text.indexOf(marker) + marker.length)) as Record<string, string>);
  } catch { /* no paragraphs */ }
  const picks = keys.length > 3 ? [keys[0], keys[Math.floor(keys.length / 2)]] : keys.slice(0, 1);
  return JSON.stringify({ comments: picks.map((p, i) => ({ p, c: COMMENTS[(Number(p) + i) % COMMENTS.length] ?? COMMENTS[0] })) });
}
