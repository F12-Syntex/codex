/**
 * SM-2 spaced repetition for the vocabulary deck (owner: WS-E). AI_AUDIT §6 F4.
 *
 * PURE: no `electron`, Node or DOM imports. Used by main (`electron/assistant/vocab.ts`) and by
 * the renderer (grade-button interval previews) through `@shared/srs`.
 *
 * SuperMemo-2 (Woźniak, 1987), implemented exactly:
 * - quality q ∈ 0..5; q ≥ 3 is a pass.
 * - pass: interval 1 day, then 6 days, then round(previous × ease); reps += 1.
 * - ease' = ease + (0.1 − (5 − q)(0.08 + (5 − q)·0.02)), floored at 1.3, applied on every pass.
 * - fail: reps = 0, interval = 1 day, ease unchanged; a fail on a learned card counts a lapse.
 *
 * The four buttons map onto q: Again = 1, Hard = 3, Good = 4, Easy = 5.
 */

export const DAY_MS = 86_400_000;
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;

export type SrsGrade = "again" | "hard" | "good" | "easy";
export type SrsQuality = 0 | 1 | 2 | 3 | 4 | 5;

export const SRS_GRADES: readonly SrsGrade[] = ["again", "hard", "good", "easy"];

export const GRADE_QUALITY: Readonly<Record<SrsGrade, SrsQuality>> = { again: 1, hard: 3, good: 4, easy: 5 };

/** Scheduling state of one card (mirrors the `vocab_items` columns). */
export interface SrsState {
  /** Days between the last review and the next; 0 for a new card. */
  intervalDays: number;
  ease: number;
  /** Passing reviews in a row since the last lapse. */
  reps: number;
  /** Times a learned card (reps > 0) was forgotten. */
  lapses: number;
  /** Epoch ms when the card is next due; a new card is due at creation. */
  dueAt: number;
}

export function newSrsState(now: number): SrsState {
  return { intervalDays: 0, ease: START_EASE, reps: 0, lapses: 0, dueAt: now };
}

function toQuality(grade: SrsGrade | SrsQuality): SrsQuality {
  if (typeof grade === "number") {
    if (!Number.isInteger(grade) || grade < 0 || grade > 5) throw new RangeError(`SM-2 quality must be 0..5, got ${grade}`);
    return grade;
  }
  const q = GRADE_QUALITY[grade];
  if (q === undefined) throw new RangeError(`Unknown SM-2 grade "${String(grade)}"`);
  return q;
}

/** One SM-2 review. Pure: returns a new state, never mutates `state`. */
export function reviewSrs(state: SrsState, grade: SrsGrade | SrsQuality, now: number): SrsState {
  const q = toQuality(grade);
  let { intervalDays, ease, reps, lapses } = state;
  if (q >= 3) {
    intervalDays = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(intervalDays * ease);
    reps += 1;
    ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  } else {
    if (reps > 0) lapses += 1;
    reps = 0;
    intervalDays = 1;
  }
  // Keep the ease readable (floating error accumulates over hundreds of reviews).
  ease = Math.round(ease * 1000) / 1000;
  return { intervalDays, ease, reps, lapses, dueAt: now + intervalDays * DAY_MS };
}

/** Interval each button would set, for "Good · 6 d" previews. */
export function previewIntervals(state: SrsState, now: number): Record<SrsGrade, number> {
  const out = {} as Record<SrsGrade, number>;
  for (const g of SRS_GRADES) out[g] = reviewSrs(state, g, now).intervalDays;
  return out;
}

/** Due by the end of the local day containing `now` is NOT assumed here: strictly `dueAt ≤ now`. */
export function isDue(state: Pick<SrsState, "dueAt">, now: number): boolean {
  return state.dueAt <= now;
}

/** "1 d", "6 d", "1.5 mo", "2.1 yr". */
export function formatInterval(days: number): string {
  if (days < 1) return "now";
  if (days < 30) return `${days} d`;
  if (days < 365) return `${(days / 30).toFixed(days < 300 ? 1 : 0)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}
