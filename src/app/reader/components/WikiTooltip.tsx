"use client";

/* ── Entity highlighting utilities ────────────────────── */

/**
 * Build a regex that matches all entity names/aliases in the wiki.
 * Returns matches sorted by length (longest first) to avoid partial matches.
 */
export function buildEntityRegex(
  entityIndex: Array<{ id: string; name: string }>,
): RegExp | null {
  if (entityIndex.length === 0) return null;

  // Escape special regex chars and sort by length desc
  const patterns = entityIndex
    .filter((e) => e.name.length >= 2) // Skip single-char names
    .map((e) => escapeRegex(e.name));

  if (patterns.length === 0) return null;

  // Word-boundary match, case insensitive
  return new RegExp(`\\b(${patterns.join("|")})\\b`, "gi");
}

/**
 * Inject wiki entity spans into HTML paragraph text.
 * Returns modified HTML with <span data-wiki-id="..." class="wiki-entity wiki-entity-{color}"> wrappers.
 */
export function injectWikiEntities(
  html: string,
  entityIndex: Array<{ id: string; name: string; color: string }>,
  regex: RegExp,
): string {
  // Build a name→entity lookup (case-insensitive)
  const lookup = new Map<string, { id: string; color: string }>();
  for (const e of entityIndex) {
    lookup.set(e.name.toLowerCase(), { id: e.id, color: e.color });
  }

  // Split HTML into tags and text segments, only modify text segments
  const parts = html.split(/(<[^>]+>)/);
  let insideTag = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith("<")) {
      // Check for tags we shouldn't inject into
      if (part.startsWith("<span data-wiki-id")) insideTag = true;
      if (part === "</span>" && insideTag) insideTag = false;
      continue;
    }
    if (insideTag) continue;

    // Replace entity names in text segments
    regex.lastIndex = 0;
    parts[i] = part.replace(regex, (match) => {
      const entity = lookup.get(match.toLowerCase());
      if (!entity) return match;
      return `<span data-wiki-id="${entity.id}" class="wiki-entity wiki-entity-${entity.color}">${match}</span>`;
    });
  }

  return parts.join("");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
