/**
 * Entity resolution (owner: WS-B). PURE: moved from `src/lib/ai-wiki.ts` (EntityResolver).
 *
 * Multi-signal matching to stop the model creating duplicates: exact id, exact name/alias,
 * the new entry's aliases, substring (type-aware: "Kim" → "Kim Soyoung"), and fuzzy
 * (Levenshtein ≤ 20% of the longer string, same type only). Matches below score 50 are ignored.
 */

export interface ResolverEntry {
  id: string;
  name: string;
  type: string;
  significance: number;
}

export interface ResolverAlias {
  entry_id: string;
  alias: string;
  relevance: number;
}

export interface ResolveMatch {
  id: string;
  score: number;
  reason: "exact-id" | "exact-name" | "alias-match" | "substring-match" | "fuzzy-match";
}

/** Auto-merge threshold. */
export const RESOLVE_THRESHOLD = 50;
const FUZZY_MIN_LEN = 6;

export class EntityResolver {
  private entries = new Map<string, ResolverEntry>();
  /** lowercase name/alias/id → entry id */
  private nameIndex = new Map<string, string>();

  constructor(entries: readonly ResolverEntry[], aliases: readonly ResolverAlias[]) {
    for (const e of entries) {
      this.entries.set(e.id, { id: e.id, name: e.name, type: e.type, significance: e.significance });
      this.nameIndex.set(e.name.toLowerCase().trim(), e.id);
      this.nameIndex.set(e.id.toLowerCase(), e.id);
    }
    for (const a of aliases) {
      if (a.relevance >= 2 && this.entries.has(a.entry_id)) {
        this.nameIndex.set(a.alias.toLowerCase().trim(), a.entry_id);
      }
    }
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Register an entry created (or remapped) in this run, so later references resolve to it.
   *  `id` may be a model-proposed id that was remapped onto `canonicalId`. */
  register(id: string, name: string, type: string, aliases: readonly string[], canonicalId: string = id): void {
    if (!this.entries.has(canonicalId)) this.entries.set(canonicalId, { id: canonicalId, name, type, significance: 1 });
    this.nameIndex.set(name.toLowerCase().trim(), canonicalId);
    this.nameIndex.set(id.toLowerCase(), canonicalId);
    for (const alias of aliases) {
      if (alias.trim().length >= 2) this.nameIndex.set(alias.toLowerCase().trim(), canonicalId);
    }
  }

  /** Forget an id (e.g. merged away) and point its keys at `intoId`. */
  remap(fromId: string, intoId: string): void {
    this.entries.delete(fromId);
    for (const [k, v] of this.nameIndex) if (v === fromId) this.nameIndex.set(k, intoId);
    this.nameIndex.set(fromId.toLowerCase(), intoId);
  }

  /** Look up an id directly (exact, or via any registered name/alias/remapped id). */
  lookupId(id: string): string | undefined {
    if (this.entries.has(id)) return id;
    return this.nameIndex.get(id.toLowerCase());
  }

  /** Resolve a name+type to an existing entry, or null. */
  resolve(name: string, type: string, aliases?: readonly string[]): ResolveMatch | null {
    const normalized = name.toLowerCase().trim();
    if (!normalized) return null;

    if (this.entries.has(name)) return { id: name, score: 100, reason: "exact-id" };

    const candidates: ResolveMatch[] = [];

    // Exact name/alias match (case-insensitive); type-aware confidence.
    const exactMatch = this.nameIndex.get(normalized);
    if (exactMatch) {
      const entry = this.entries.get(exactMatch);
      if (entry) candidates.push({ id: exactMatch, score: entry.type === type ? 95 : 55, reason: "exact-name" });
    }

    // The new entry's own aliases against existing names/aliases.
    for (const alias of aliases ?? []) {
      const aliasNorm = alias.toLowerCase().trim();
      if (aliasNorm.length < 2) continue;
      const aliasMatch = this.nameIndex.get(aliasNorm);
      if (aliasMatch && aliasMatch !== exactMatch) {
        const entry = this.entries.get(aliasMatch);
        if (entry) candidates.push({ id: aliasMatch, score: entry.type === type ? 85 : 45, reason: "alias-match" });
      }
    }

    // Substring (same type): a single word that is a whole word of a multi-word name, either way.
    const nameParts = normalized.split(/\s+/).filter((p) => p.length >= 2);
    if (nameParts.length > 0) {
      const seen = new Set(candidates.map((c) => c.id));
      for (const [key, entryId] of this.nameIndex) {
        if (seen.has(entryId)) continue;
        const entry = this.entries.get(entryId);
        if (!entry || entry.type !== type) continue;
        const keyParts = key.split(/\s+/);
        const isSubstring =
          (nameParts.length === 1 && keyParts.length > 1 && keyParts.includes(normalized)) ||
          (keyParts.length === 1 && nameParts.length > 1 && nameParts.includes(key));
        if (isSubstring) {
          candidates.push({ id: entryId, score: 70, reason: "substring-match" });
          seen.add(entryId);
        }
      }
    }

    // Fuzzy (same type): spelling variants of names ≥ 6 chars ("Soyoung" / "Soyeong"),
    // Levenshtein ≤ max(1, 15% of the longer string). The legacy scorer capped fuzzy scores
    // below the threshold, so fuzzy matches could never apply; short names stay excluded
    // because one letter there is usually a different name ("Mira" / "Mila").
    if (normalized.length >= FUZZY_MIN_LEN) {
      const seen = new Set(candidates.map((c) => c.id));
      for (const [key, entryId] of this.nameIndex) {
        if (seen.has(entryId)) continue;
        const entry = this.entries.get(entryId);
        if (!entry || entry.type !== type || key.length < FUZZY_MIN_LEN) continue;
        const maxLen = Math.max(normalized.length, key.length);
        const allowed = Math.max(1, Math.floor(maxLen * 0.15));
        if (Math.abs(normalized.length - key.length) > allowed) continue;
        const dist = levenshtein(normalized, key);
        if (dist <= allowed) {
          const score = Math.round(85 * (1 - dist / maxLen));
          if (score >= 25) {
            candidates.push({ id: entryId, score, reason: "fuzzy-match" });
            seen.add(entryId);
          }
        }
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].score >= RESOLVE_THRESHOLD ? candidates[0] : null;
  }
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
