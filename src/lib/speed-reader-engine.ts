/* ── Speed Reader: Chunking & Timing Engine ─────────────────────────
 * Converts formatted HTML paragraphs into semantically-chunked phrases
 * and calculates adaptive timing for speed-reading display.
 *
 * No external dependencies — uses only built-in string/regex operations.
 * ─────────────────────────────────────────────────────────────────── */

// ── Types ──────────────────────────────────────────────────────────

export type ContentType =
  | "narration"
  | "dialogue"
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
  /** Character color class suffix if dialogue (e.g. "hero", "villain") */
  speakerColor?: string;
  /** Whether this marks a scene transition */
  isSceneBreak: boolean;
  /** Number of words in this chunk */
  wordCount: number;
}

export interface TimingConfig {
  /** User's target words-per-minute, e.g. 450 */
  targetWpm: number;
  /** Warmup factor: 0.7 at start, ramps to 1.0 over first ~15 chunks */
  warmupFactor: number;
  /** How long the session has been running, in minutes */
  sessionMinutes: number;
}

// ── Constants ──────────────────────────────────────────────────────

/** Articles that bind forward to the following noun */
const ARTICLES = new Set(["a", "an", "the"]);

/** Prepositions that bind forward to their object */
const PREPOSITIONS = new Set([
  "in", "on", "at", "to", "for", "with", "from", "of", "by", "about",
  "into", "through", "over", "under", "between", "after", "before", "during",
]);

/** Conjunctions that start new chunks */
const CONJUNCTIONS = new Set(["and", "or", "but", "yet", "so", "nor"]);

/** Common function words with reduced reading time (0.7x lexical weight) */
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

/** Dialogue class prefix for detecting speaker tags */
const DIALOGUE_CLASS_PREFIX = "ai-fmt-dialogue-";

/** Scene break patterns (text content after stripping HTML) */
const SCENE_BREAK_RE = /^\s*(\*\s*\*\s*\*|---+|___+|[*]{3,}|[─]{3,})\s*$/;

/** Structural timing multipliers per content type */
const STRUCTURAL_MULTIPLIERS: Record<ContentType, number> = {
  narration: 1.0,
  dialogue: 0.85,
  thought: 1.1,
  sfx: 1.5,
  system: 0.7,
  "scene-break": 2.0,
  exposition: 1.2,
};

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

interface ClassificationResult {
  contentType: ContentType;
  speakerName?: string;
  speakerColor?: string;
}

/**
 * Classify a paragraph's content type from its HTML.
 * Checks AI formatting classes and structural patterns.
 */
function classifyParagraph(html: string): ClassificationResult {
  const plainText = stripHtml(html);

  // Scene breaks: just separators like *** or ---
  if (SCENE_BREAK_RE.test(plainText)) {
    return { contentType: "scene-break" };
  }

  // Dialogue: ai-fmt-dialogue-{color} class with speaker name in span text
  const dialogueMatch = html.match(
    /class="[^"]*ai-fmt-dialogue-(\w+)[^"]*"[^>]*>([^<]+)<\/span>/
  );
  if (dialogueMatch) {
    return {
      contentType: "dialogue",
      speakerName: dialogueMatch[2].trim(),
      speakerColor: dialogueMatch[1],
    };
  }

  // Thought: ai-fmt-thought or ai-fmt-thought-block, or pure <em>/<i> wrapping
  if (/ai-fmt-thought/.test(html)) {
    return { contentType: "thought" };
  }
  // Pure italics paragraph (entire content is <em> or <i>)
  if (/^<(em|i)>.*<\/\1>$/i.test(html.trim())) {
    return { contentType: "thought" };
  }

  // SFX: ai-fmt-sfx
  if (/ai-fmt-sfx/.test(html)) {
    return { contentType: "sfx" };
  }

  // System: ai-fmt-system-message, ai-fmt-stat-block, ai-fmt-status-window
  if (/ai-fmt-system-message|ai-fmt-stat-block|ai-fmt-status-window/.test(html)) {
    return { contentType: "system" };
  }

  // Default: narration
  return { contentType: "narration" };
}

// ── Semantic Chunking ──────────────────────────────────────────────

/**
 * Split plain text into semantic chunks of ~2-5 words.
 *
 * Rules:
 * - Articles bind forward to the next noun phrase
 * - Prepositions bind forward to their object
 * - Conjunctions start new chunks
 * - Commas and semicolons are chunk boundaries
 * - Short quotes (<=5 words) stay together
 * - Punctuation stays attached to its word
 */
function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // First, split on comma/semicolon boundaries (keep punctuation attached)
  const clauses = trimmed.split(/(?<=[,;])\s+/);
  const chunks: string[] = [];

  for (const clause of clauses) {
    const words = clause.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    // Check if this clause is a short quote (<=5 words, starts/ends with quote marks)
    const joined = words.join(" ");
    if (words.length <= 5 && /^["'\u201c]/.test(joined) && /["'\u201d][.!?]*$/.test(joined)) {
      chunks.push(joined);
      continue;
    }

    // Group words into 2-5 word chunks using binding rules
    let current: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const lower = word.toLowerCase().replace(/[^a-z']/g, "");

      // Conjunctions start a new chunk (unless current is empty)
      if (CONJUNCTIONS.has(lower) && current.length > 0) {
        chunks.push(current.join(" "));
        current = [word];
        continue;
      }

      current.push(word);

      // Articles and prepositions bind forward — don't end chunk here
      if ((ARTICLES.has(lower) || PREPOSITIONS.has(lower)) && i < words.length - 1) {
        continue;
      }

      // If we've reached 2+ words and the next word isn't bound by an article/prep,
      // check if we should break
      if (current.length >= 2) {
        const nextWord = i + 1 < words.length
          ? words[i + 1].toLowerCase().replace(/[^a-z']/g, "")
          : null;

        // Don't break if next word is bound by preceding article/preposition
        // (already handled above by continuing)

        // Break at 3-5 words unless next word would be left orphaned
        const remaining = words.length - i - 1;
        if (current.length >= 3 || (current.length >= 2 && remaining > 1)) {
          // Break if we hit 5 words (hard max per chunk)
          if (current.length >= 5) {
            chunks.push(current.join(" "));
            current = [];
            continue;
          }

          // Break at natural points: after non-binding words when chunk >= 3
          if (current.length >= 3 && !ARTICLES.has(lower) && !PREPOSITIONS.has(lower)) {
            // Don't break if next word is a conjunction (it'll start a new chunk anyway)
            if (!nextWord || !CONJUNCTIONS.has(nextWord)) {
              // Check if breaking would leave a single orphan word
              if (remaining !== 1 || current.length < 4) {
                chunks.push(current.join(" "));
                current = [];
                continue;
              }
            }
          }
        }
      }
    }

    // Flush remaining words
    if (current.length > 0) {
      // If there's a previous chunk and current is just 1 word, merge with previous
      if (current.length === 1 && chunks.length > 0) {
        const lastChunk = chunks[chunks.length - 1];
        const lastWords = lastChunk.split(/\s+/).length;
        if (lastWords < 5) {
          chunks[chunks.length - 1] = lastChunk + " " + current[0];
          continue;
        }
      }
      chunks.push(current.join(" "));
    }
  }

  return chunks.filter((c) => c.trim().length > 0);
}

// ── Main Chunking Function ─────────────────────────────────────────

/**
 * Convert an array of HTML paragraphs into an array of speed-reader chunks.
 *
 * Each paragraph is classified by content type, then split into semantic
 * chunks of 2-5 words that follow natural phrase boundaries.
 */
export function chunkParagraphs(htmlParagraphs: string[]): SpeedReaderChunk[] {
  const result: SpeedReaderChunk[] = [];

  for (let paraIndex = 0; paraIndex < htmlParagraphs.length; paraIndex++) {
    const html = htmlParagraphs[paraIndex];
    const { contentType, speakerName, speakerColor } = classifyParagraph(html);

    // Scene breaks produce a single chunk
    if (contentType === "scene-break") {
      result.push({
        text: stripHtml(html) || "* * *",
        html,
        paraIndex,
        contentType,
        isSceneBreak: true,
        wordCount: 0,
      });
      continue;
    }

    const plainText = stripHtml(html);
    if (!plainText) continue;

    const textChunks = chunkText(plainText);
    if (textChunks.length === 0) continue;

    for (let i = 0; i < textChunks.length; i++) {
      const chunkStr = textChunks[i];
      const wc = countWords(chunkStr);

      const chunk: SpeedReaderChunk = {
        text: chunkStr,
        // For HTML, wrap in a span that preserves the paragraph's formatting context
        html: buildChunkHtml(chunkStr, contentType, speakerColor, i === 0 && !!speakerName),
        paraIndex,
        contentType,
        isSceneBreak: false,
        wordCount: wc,
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
 * We wrap chunks in spans with appropriate classes so the renderer can style them.
 */
function buildChunkHtml(
  text: string,
  contentType: ContentType,
  speakerColor?: string,
  isSpeakerChunk?: boolean,
): string {
  // Escape HTML entities in the text
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  switch (contentType) {
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
 * Factors:
 * 1. Base duration from target WPM
 * 2. Lexical multiplier (function words faster, long words slower)
 * 3. Structural multiplier (content type affects pacing)
 * 4. Warmup ramp (slower at session start)
 * 5. Fatigue adjustment (gradually slower after 30 minutes)
 */
export function calculateChunkDuration(
  chunk: SpeedReaderChunk,
  config: TimingConfig,
): number {
  const { targetWpm, warmupFactor, sessionMinutes } = config;

  // Scene breaks get a fixed long pause
  if (chunk.contentType === "scene-break") {
    return 2000;
  }

  // Empty chunks shouldn't happen, but guard against division by zero
  if (chunk.wordCount === 0) return 120;

  // 1. Base duration: time for this many words at target WPM
  const baseDuration = (chunk.wordCount / targetWpm) * 60_000;

  // 2. Lexical multiplier: average across words in the chunk
  const lexicalMult = calculateLexicalMultiplier(chunk.text);

  // 3. Structural multiplier based on content type
  const structuralMult = STRUCTURAL_MULTIPLIERS[chunk.contentType] ?? 1.0;

  // 4. Fatigue: +5% per 30 minutes after the first 30 minutes
  //    0.0017 per minute beyond 30 = ~5% per 30 min
  const fatigueMult = 1.0 + Math.max(0, sessionMinutes - 30) * 0.0017;

  // 5. Warmup: warmupFactor ranges 0.7 (start) to 1.0 (warmed up)
  //    Dividing by a smaller number = longer duration = slower reading
  const clampedWarmup = Math.max(0.7, warmupFactor);

  // Final calculation
  const raw = (baseDuration * lexicalMult * structuralMult * fatigueMult) / clampedWarmup;

  // Clamp to [120ms, 3000ms]
  return clamp(raw, 120, 3000);
}

/**
 * Calculate the lexical multiplier for a chunk based on word complexity.
 *
 * - Common function words: 0.7x (fast, eyes glide over them)
 * - Long words (>8 chars): 1.2x (need more processing time)
 * - Very long words (>12 chars): 1.3x
 * - Normal words: 1.0x
 *
 * Returns the average multiplier across all words.
 */
function calculateLexicalMultiplier(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1.0;

  let totalMult = 0;

  for (const word of words) {
    // Strip punctuation for analysis, keep only letters and apostrophes
    const clean = word.toLowerCase().replace(/[^a-z']/g, "");

    if (FUNCTION_WORDS.has(clean)) {
      totalMult += 0.7;
    } else if (clean.length > 12) {
      totalMult += 1.3;
    } else if (clean.length > 8) {
      totalMult += 1.2;
    } else {
      totalMult += 1.0;
    }
  }

  return totalMult / words.length;
}

/** Clamp a number between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
