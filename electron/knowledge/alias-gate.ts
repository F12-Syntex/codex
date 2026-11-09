/**
 * Alias quality gate (owner: WS-B). PURE: moved from `src/lib/ai-wiki.ts`.
 *
 * Models like to record contextual references ("the stranger", "her mother") as aliases. Those
 * are kept (the wiki can show them) but downgraded to relevance 1 / type "epithet", which keeps
 * them out of the resolver (needs ≥ 2), highlighting and the entity index (need ≥ 3).
 */

export type AIAliasInput = string | { alias: string; type?: string; alias_type?: string; relevance?: number };

export interface GatedAlias {
  alias: string;
  alias_type: string;
  relevance: number;
}

const CONTEXTUAL_PATTERNS: readonly RegExp[] = [
  /^the\s+/i, // "the stranger", "the figure"
  /^a\s+/i, // "a newcomer"
  /^an\s+/i, // "an outsider"
  /^that\s+/i, // "that man"
  /^this\s+/i, // "this creature"
  /^some\s+/i, // "some warrior"
  /\b(?:he|she|they|it|him|her|them|his|their)\b/i, // pronouns
  /^(?:someone|somebody|anyone|one|nobody)\b/i, // indefinite
  /(?:figure|stranger|newcomer|person|man|woman|boy|girl|child|creature|being|entity|thing|one)\s*$/i, // generic endings
];

export const MAX_ALIAS_LENGTH = 50;
export const MIN_ALIAS_LENGTH = 2;

/** True for descriptions / contextual references that are not real names. */
export function isContextualAlias(alias: string): boolean {
  const trimmed = alias.trim();
  if (trimmed.length > MAX_ALIAS_LENGTH || trimmed.length < MIN_ALIAS_LENGTH) return true;
  if (trimmed.split(/\s+/).length > 4) return true; // a description, not a name
  return CONTEXTUAL_PATTERNS.some((p) => p.test(trimmed));
}

/** Normalise model alias inputs; contextual ones are kept at relevance ≤ 1 as "epithet". */
export function gateAliases(aliases: readonly AIAliasInput[] | undefined | null): GatedAlias[] {
  if (!Array.isArray(aliases)) return [];
  return aliases
    .map((a): GatedAlias | null => {
      if (typeof a === "string") return { alias: a, alias_type: "name", relevance: 3 };
      if (!a || typeof a.alias !== "string") return null;
      const relevance = typeof a.relevance === "number" && Number.isFinite(a.relevance) ? Math.max(1, Math.min(5, Math.round(a.relevance))) : 3;
      return { alias: a.alias, alias_type: a.alias_type ?? a.type ?? "name", relevance };
    })
    .filter((a): a is GatedAlias => !!a && a.alias.trim().length >= MIN_ALIAS_LENGTH)
    .map((a) => ({ ...a, alias: a.alias.trim() }))
    .map((a) => (isContextualAlias(a.alias) ? { ...a, relevance: Math.min(a.relevance, 1), alias_type: "epithet" } : a));
}

/** Alias strings of a model alias list (for resolution), without gating. */
export function aliasStrings(aliases: readonly AIAliasInput[] | undefined | null): string[] {
  if (!Array.isArray(aliases)) return [];
  return aliases.map((a) => (typeof a === "string" ? a : a?.alias)).filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}
