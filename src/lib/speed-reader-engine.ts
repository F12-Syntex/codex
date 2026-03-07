/* ── Speed Reader: Chunking & Timing Engine ─────────────────────────
 * Converts formatted HTML paragraphs into semantically-chunked phrases
 * and calculates adaptive timing for speed-reading display.
 *
 * Implements the Codex Speed Reader Specification:
 * - Semantic chunking (1-5 word phrases following binding/breaking rules)
 * - Adaptive timing (lexical + structural multipliers + pauses)
 * - Session pacing (warmup ramp + fatigue decay)
 * ─────────────────────────────────────────────────────────────────── */

// ── Types ──────────────────────────────────────────────────────────

export type ContentType =
  | "narration"
  | "dialogue"
  | "rapid-dialogue"
  | "thought"
  | "sfx"
  | "system"
  | "scene-break"
  | "exposition";

export interface SpeedReaderChunk {
  /** Display text (stripped of HTML) */
  text: string;
  /** Display HTML (preserving formatting spans) */
  html: string;
  /** Index of the source paragraph */
  paraIndex: number;
  /** Classified content type */
  contentType: ContentType;
  /** Character name if dialogue */
  speakerName?: string;
  /** Character color class suffix if dialogue */
  speakerColor?: string;
  /** Whether this marks a scene transition */
  isSceneBreak: boolean;
  /** Number of words in this chunk */
  wordCount: number;
  /** Chunk ends with sentence-terminating punctuation (.!?) */
  endsWithSentence: boolean;
  /** Chunk ends with exclamation (! or ?) */
  endsWithExclamation: boolean;
  /** This is the last chunk in its paragraph */
  isLastInParagraph: boolean;
}

export interface TimingConfig {
  /** User's target words-per-minute (200–800) */
  targetWpm: number;
  /** Number of chunks played so far in this session (for warmup) */
  chunksPlayed: number;
  /** How long the session has been running, in minutes */
  sessionMinutes: number;
}

// ── Word Sets ──────────────────────────────────────────────────────

/** Articles that bind forward to the following noun phrase */
const ARTICLES = new Set(["a", "an", "the"]);

/** Prepositions that bind forward to their object */
const PREPOSITIONS = new Set([
  "in", "on", "at", "to", "for", "with", "from", "of", "by", "about",
  "into", "through", "over", "under", "between", "after", "before",
  "during", "against", "among", "within", "without", "toward", "towards",
  "behind", "beyond", "upon", "across", "along", "around", "beside",
  "beneath", "above", "below", "near",
]);

/** Conjunctions: break before, then bind forward to next word */
const CONJUNCTIONS = new Set(["and", "or", "but", "yet", "so", "nor"]);

/** Negation words that bind forward to the verb */
const NEGATION_WORDS = new Set([
  "not", "never", "no", "neither",
  "didn't", "couldn't", "wouldn't", "shouldn't", "can't", "won't",
  "don't", "doesn't", "wasn't", "weren't", "isn't", "aren't",
  "hasn't", "haven't", "hadn't", "mustn't",
]);

/** Possessive pronouns that bind forward to their noun */
const POSSESSIVE_PRONOUNS = new Set([
  "his", "her", "my", "your", "our", "their", "its",
]);

/** Intensifiers that bind forward to the adjective/adverb */
const INTENSIFIERS = new Set([
  "very", "so", "too", "really", "quite", "rather", "extremely",
  "incredibly", "absolutely", "utterly", "completely", "totally",
  "fairly", "pretty", "highly", "much",
]);

/** Number words that bind forward to their unit */
const NUMBER_WORDS = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty",
  "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "million", "billion",
  "first", "second", "third", "fourth", "fifth",
]);

/** Common function words: 0.7x lexical multiplier */
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "is", "was", "were", "are", "be", "been",
  "have", "has", "had", "do", "did", "does", "will", "would",
  "could", "should", "can", "may", "might", "shall",
  "and", "or", "but", "if", "then", "so", "yet", "for", "not",
  "no", "nor", "it", "its", "he", "she", "him", "her", "his",
  "they", "them", "we", "us", "our", "you", "your", "my", "me",
  "i", "that", "this", "these", "those", "which", "who", "what",
  "when", "where", "how", "to", "of", "in", "on", "at", "by",
  "with", "from",
]);

/** Common verbs: 0.85x lexical multiplier */
const COMMON_VERBS = new Set([
  "said", "went", "came", "took", "got", "made", "looked",
  "saw", "knew", "thought", "told", "found", "gave", "felt",
  "left", "called", "asked", "tried", "used", "put", "ran",
  "kept", "let", "turned", "started", "stood", "heard", "set",
  "sat", "brought", "began", "seemed", "held", "moved", "walked",
  "watched", "followed", "pulled", "pushed", "nodded", "smiled",
  "shook", "opened", "closed", "reached", "spoke", "replied",
]);

/** Structural timing multipliers per content type */
const STRUCTURAL_MULTIPLIERS: Record<ContentType, number> = {
  "rapid-dialogue": 0.75,
  dialogue: 0.85,
  narration: 1.0,
  thought: 0.95,
  sfx: 0.6,
  system: 0.65,
  exposition: 1.3,
  "scene-break": 1.4,
};

// ── Pause Constants (milliseconds) ────────────────────────────────

const PAUSE_END_OF_SENTENCE = 150;
const PAUSE_END_OF_PARAGRAPH = 400;
const PAUSE_AFTER_SFX = 250;
const PAUSE_AFTER_EXCLAMATION = 200;
const PAUSE_SCENE_BREAK = 800;
const PAUSE_AFTER_SPEAKER_LABEL = 100;
const PAUSE_AFTER_THOUGHT_BLOCK = 150;
const PAUSE_AFTER_SYSTEM = 100;

// ── HTML Utilities ─────────────────────────────────────────────────

/** Strip all HTML tags, returning plain text */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").trim();
}

/** Count words in a plain-text string */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ── Content Type Classification ────────────────────────────────────

const DIALOGUE_CLASS_PREFIX = "ai-fmt-dialogue-";
const SCENE_BREAK_RE = /^\s*(\*\s*\*\s*\*|---+|___+|[*]{3,}|[─]{3,})\s*$/;

interface ClassificationResult {
  contentType: ContentType;
  speakerName?: string;
  speakerColor?: string;
}

/**
 * Classify a paragraph's content type from its HTML.
 * Dialogue lines with <= 6 words are classified as rapid-dialogue.
 */
function classifyParagraph(html: string): ClassificationResult {
  const plainText = stripHtml(html);

  if (SCENE_BREAK_RE.test(plainText)) {
    return { contentType: "scene-break" };
  }

  const dialogueMatch = html.match(
    /class="[^"]*ai-fmt-dialogue-(\w+)[^"]*"[^>]*>([^<]+)<\/span>/
  );
  if (dialogueMatch) {
    const wc = countWords(plainText);
    return {
      contentType: wc <= 6 ? "rapid-dialogue" : "dialogue",
      speakerName: dialogueMatch[2].trim(),
      speakerColor: dialogueMatch[1],
    };
  }

  if (/ai-fmt-thought/.test(html) || /^<(em|i)>.*<\/\1>$/i.test(html.trim())) {
    return { contentType: "thought" };
  }

  if (/ai-fmt-sfx/.test(html)) {
    return { contentType: "sfx" };
  }

  if (/ai-fmt-system-message|ai-fmt-stat-block|ai-fmt-status-window/.test(html)) {
    return { contentType: "system" };
  }

  return { contentType: "narration" };
}

// ── Semantic Chunking ──────────────────────────────────────────────

interface RawChunk {
  text: string;
  endsWithSentence: boolean;
  endsWithExclamation: boolean;
}

/**
 * Check if a lowercase word should bind forward to the next word,
 * preventing a chunk break after it.
 */
function bindsForward(lower: string): boolean {
  if (ARTICLES.has(lower)) return true;
  if (PREPOSITIONS.has(lower)) return true;
  if (CONJUNCTIONS.has(lower)) return true;
  if (NEGATION_WORDS.has(lower)) return true;
  if (POSSESSIVE_PRONOUNS.has(lower)) return true;
  if (INTENSIFIERS.has(lower)) return true;
  if (lower.endsWith("'s")) return true;
  if (/^\+?\d+$/.test(lower) || NUMBER_WORDS.has(lower)) return true;
  return false;
}

function testSentenceEnd(word: string): boolean {
  return /[.!?]["'\u201d\u2019)]*$/.test(word);
}

function testExclamation(word: string): boolean {
  return /[!?]["'\u201d\u2019)]*$/.test(word);
}

function testClauseEnd(word: string): boolean {
  return /[,;]$/.test(word) || /\u2014$/.test(word);
}

function makeRaw(words: string[]): RawChunk {
  const last = words[words.length - 1] ?? "";
  return {
    text: words.join(" "),
    endsWithSentence: testSentenceEnd(last),
    endsWithExclamation: testExclamation(last),
  };
}

/**
 * Split plain text into semantic chunks of 1–5 words.
 *
 * Binding rules (what stays together):
 * - Article + noun/adjective, preposition + object, conjunction + next word
 * - Negation + verb, possessive + noun, intensifier + adjective
 * - Number + unit, "to" + infinitive
 *
 * Breaking rules (where to split), in priority order:
 * 1. Sentence boundary (.!?)
 * 2. Clause boundary (,;—)
 * 3. Between phrases at 3–5 words
 *
 * Special: short quotes <= 4 words stay together,
 * stuttered speech stays as one token, ellipsis trails with word.
 */
function chunkText(text: string): RawChunk[] {
  // Pre-process: ensure spaces after em-dashes for proper splitting
  let processed = text.replace(/(\S)\u2014(\S)/g, "$1\u2014 $2");
  processed = processed.replace(/(\S)--(\S)/g, "$1-- $2");

  const words = processed.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Short quote (<=4 words, starts and ends with quote marks): single chunk
  const joined = words.join(" ");
  if (words.length <= 4 && /^["'\u201c]/.test(joined) && /["'\u201d][.!?]*$/.test(joined)) {
    return [makeRaw(words)];
  }

  const chunks: RawChunk[] = [];
  let current: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lower = word.toLowerCase().replace(/[^a-z0-9'+\-]/g, "");

    // Conjunctions break before (start new chunk), if current has >= 2 words
    if (CONJUNCTIONS.has(lower) && current.length >= 2) {
      chunks.push(makeRaw(current));
      current = [];
    }

    current.push(word);

    // Priority 1: Sentence boundary — always break after
    if (testSentenceEnd(word)) {
      chunks.push(makeRaw(current));
      current = [];
      continue;
    }

    // Priority 2: Clause boundary — break after
    if (testClauseEnd(word)) {
      chunks.push(makeRaw(current));
      current = [];
      continue;
    }

    // Binding: if word binds forward and we haven't hit the hard max, continue
    if (bindsForward(lower) && i < words.length - 1 && current.length < 5) {
      continue;
    }

    // Size-based breaking at 3+ words
    if (current.length >= 3) {
      const remaining = words.length - i - 1;
      // Avoid leaving a single orphan at the end
      if (remaining !== 1 || current.length >= 4) {
        chunks.push(makeRaw(current));
        current = [];
        continue;
      }
    }

    // Hard max at 5 words
    if (current.length >= 5) {
      chunks.push(makeRaw(current));
      current = [];
    }
  }

  // Flush remaining words
  if (current.length > 0) {
    // Merge single orphan with previous chunk if possible
    if (current.length === 1 && chunks.length > 0) {
      const last = chunks[chunks.length - 1];
      if (countWords(last.text) < 5) {
        last.text += " " + current[0];
        // Update flags based on new last word
        last.endsWithSentence = testSentenceEnd(current[0]);
        last.endsWithExclamation = testExclamation(current[0]);
        return chunks.filter(c => c.text.trim().length > 0);
      }
    }
    chunks.push(makeRaw(current));
  }

  return chunks.filter(c => c.text.trim().length > 0);
}

// ── Main Chunking Function ─────────────────────────────────────────

/**
 * Convert an array of HTML paragraphs into an array of speed-reader chunks.
 *
 * Each paragraph is classified by content type, then split into semantic
 * chunks of 1–5 words that follow natural phrase boundaries.
 *
 * Special rules:
 * - Scene breaks: single chunk with isSceneBreak=true
 * - System notifications: entire content as one chunk regardless of length
 * - SFX: normal chunking but with SFX content type and timing
 */
export function chunkParagraphs(htmlParagraphs: string[]): SpeedReaderChunk[] {
  const result: SpeedReaderChunk[] = [];

  for (let paraIndex = 0; paraIndex < htmlParagraphs.length; paraIndex++) {
    const html = htmlParagraphs[paraIndex];
    const { contentType, speakerName, speakerColor } = classifyParagraph(html);

    // Scene breaks: single chunk
    if (contentType === "scene-break") {
      result.push({
        text: stripHtml(html) || "* * *",
        html,
        paraIndex,
        contentType,
        isSceneBreak: true,
        wordCount: 0,
        endsWithSentence: false,
        endsWithExclamation: false,
        isLastInParagraph: true,
      });
      continue;
    }

    const plainText = stripHtml(html);
    if (!plainText) continue;

    // System notifications: entire content as one chunk
    if (contentType === "system") {
      result.push({
        text: plainText,
        html: buildChunkHtml(plainText, contentType),
        paraIndex,
        contentType,
        isSceneBreak: false,
        wordCount: countWords(plainText),
        endsWithSentence: false,
        endsWithExclamation: false,
        isLastInParagraph: true,
      });
      continue;
    }

    const rawChunks = chunkText(plainText);
    if (rawChunks.length === 0) continue;

    for (let i = 0; i < rawChunks.length; i++) {
      const raw = rawChunks[i];
      const isLast = i === rawChunks.length - 1;

      const chunk: SpeedReaderChunk = {
        text: raw.text,
        html: buildChunkHtml(raw.text, contentType, speakerColor, i === 0 && !!speakerName),
        paraIndex,
        contentType,
        isSceneBreak: false,
        wordCount: countWords(raw.text),
        endsWithSentence: raw.endsWithSentence,
        endsWithExclamation: raw.endsWithExclamation,
        isLastInParagraph: isLast,
      };

      // Attach speaker info to the first chunk of dialogue paragraphs
      if (i === 0 && speakerName) {
        chunk.speakerName = speakerName;
        chunk.speakerColor = speakerColor;
      }

      result.push(chunk);
    }
  }

  return result;
}

/**
 * Build minimal HTML for a chunk, preserving content-type styling context.
 */
function buildChunkHtml(
  text: string,
  contentType: ContentType,
  speakerColor?: string,
  isSpeakerChunk?: boolean,
): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  switch (contentType) {
    case "rapid-dialogue":
    case "dialogue":
      if (isSpeakerChunk && speakerColor) {
        return `<span class="${DIALOGUE_CLASS_PREFIX}${speakerColor}">${escaped}</span>`;
      }
      return `<span class="speed-reader-dialogue">${escaped}</span>`;

    case "thought":
      return `<em class="speed-reader-thought">${escaped}</em>`;

    case "sfx":
      return `<span class="ai-fmt-sfx">${escaped}</span>`;

    case "system":
      return `<span class="speed-reader-system">${escaped}</span>`;

    case "exposition":
      return `<span class="speed-reader-exposition">${escaped}</span>`;

    default:
      return `<span>${escaped}</span>`;
  }
}

// ── Timing Engine ──────────────────────────────────────────────────

/**
 * Calculate how long a chunk should be displayed, in milliseconds.
 *
 * Formula:
 *   chunk_duration = (base_ms × avg_lexical × structural × fatigue) / warmup + pause_ms
 *
 * Clamped to [80ms, 2000ms].
 */
export function calculateChunkDuration(
  chunk: SpeedReaderChunk,
  config: TimingConfig,
): number {
  const { targetWpm, chunksPlayed, sessionMinutes } = config;

  // Scene breaks: fixed pause
  if (chunk.contentType === "scene-break") {
    return PAUSE_SCENE_BREAK;
  }

  // Empty chunks
  if (chunk.wordCount === 0) return 80;

  // 1. Base duration from target WPM
  const baseDuration = (chunk.wordCount / targetWpm) * 60_000;

  // 2. Lexical multiplier (average across words)
  const lexicalMult = calculateLexicalMultiplier(chunk.text);

  // 3. Structural multiplier based on content type
  const structuralMult = STRUCTURAL_MULTIPLIERS[chunk.contentType] ?? 1.0;

  // 4. Warmup: slower at session start, ramps to full speed
  const warmup = calculateWarmup(chunksPlayed);

  // 5. Fatigue: gradually slower after 30 minutes
  const fatigueMult = calculateFatigue(sessionMinutes);

  // 6. Pause: added after the base calculation
  const pauseMs = calculatePause(chunk);

  // Final
  const raw = (baseDuration * lexicalMult * structuralMult * fatigueMult) / warmup + pauseMs;

  return clamp(raw, 80, 2000);
}

/**
 * Lexical multiplier: averaged across words in the chunk.
 *
 * - Common function words: 0.7x
 * - Common verbs: 0.85x
 * - Standard content words: 1.0x
 * - Long words (8+ chars): 1.15x
 * - Proper nouns / places: 1.15x
 * - Numbers: 1.1x
 */
function calculateLexicalMultiplier(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1.0;

  let total = 0;

  for (const word of words) {
    const clean = word.toLowerCase().replace(/[^a-z']/g, "");

    if (FUNCTION_WORDS.has(clean)) {
      total += 0.7;
    } else if (COMMON_VERBS.has(clean)) {
      total += 0.85;
    } else if (/^\+?\d/.test(word)) {
      total += 1.1;
    } else if (clean.length >= 8) {
      total += 1.15;
    } else if (/^[A-Z]/.test(word) && !FUNCTION_WORDS.has(clean)) {
      // Proper nouns / places (capitalized, not a function word)
      total += 1.15;
    } else {
      total += 1.0;
    }
  }

  return total / words.length;
}

/**
 * Session warmup: gradual ramp from 70% to 100%.
 *
 * - Chunks 1–5: 70% speed (divide duration by 0.7 = 1.43x longer)
 * - Chunks 6–15: 85% speed
 * - Chunks 16+: 100% speed
 */
function calculateWarmup(chunksPlayed: number): number {
  if (chunksPlayed < 5) return 0.7;
  if (chunksPlayed < 15) return 0.85;
  return 1.0;
}

/**
 * Fatigue decay: step function that gradually increases display time.
 *
 * Returns a multiplier >= 1.0 (higher = longer display = slower reading).
 *
 * - 0–30 min: 100% speed (1.0x duration)
 * - 30–60 min: 97% speed (~1.03x duration)
 * - 60–90 min: 93% speed (~1.08x duration)
 * - 90–120 min: 88% speed (~1.14x duration)
 * - 120+ min: 85% speed (~1.18x duration) — floor
 */
function calculateFatigue(sessionMinutes: number): number {
  if (sessionMinutes <= 30) return 1.0;
  if (sessionMinutes <= 60) return 1.0 / 0.97;
  if (sessionMinutes <= 90) return 1.0 / 0.93;
  if (sessionMinutes <= 120) return 1.0 / 0.88;
  return 1.0 / 0.85;
}

/**
 * Calculate pause duration (ms) to add after this chunk.
 *
 * Pauses stack when multiple conditions apply.
 */
function calculatePause(chunk: SpeedReaderChunk): number {
  let pause = 0;

  // SFX: post-SFX dramatic beat
  if (chunk.contentType === "sfx") {
    pause += PAUSE_AFTER_SFX;
  }

  // System notifications
  if (chunk.contentType === "system") {
    pause += PAUSE_AFTER_SYSTEM;
  }

  // Exclamation in dialogue: emotional moment
  if (chunk.endsWithExclamation &&
      (chunk.contentType === "dialogue" || chunk.contentType === "rapid-dialogue")) {
    pause += PAUSE_AFTER_EXCLAMATION;
  }

  // End of sentence (period, or non-dialogue exclamation)
  if (chunk.endsWithSentence) {
    if (!chunk.endsWithExclamation ||
        (chunk.contentType !== "dialogue" && chunk.contentType !== "rapid-dialogue")) {
      pause += PAUSE_END_OF_SENTENCE;
    }
  }

  // Speaker label: register who is speaking
  if (chunk.speakerName) {
    pause += PAUSE_AFTER_SPEAKER_LABEL;
  }

  // End of paragraph
  if (chunk.isLastInParagraph) {
    pause += PAUSE_END_OF_PARAGRAPH;

    // After inner monologue block: transition back to narration
    if (chunk.contentType === "thought") {
      pause += PAUSE_AFTER_THOUGHT_BLOCK;
    }
  }

  return pause;
}

/** Clamp a number between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
