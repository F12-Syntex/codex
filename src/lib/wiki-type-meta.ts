/**
 * Wiki palette: the one place wiki colours are defined.
 *
 * Entry types, stat categories, chapter moods, relationship groups and the
 * reader's entity-colour names all map onto the `--system-*` tokens in
 * globals.css. That way they adapt to the dark, dim and light appearances. Tints are
 * `color-mix` washes of the same token, so swatches, avatars and text agree.
 */

import {
  Activity,
  BarChart2,
  Coins,
  Flame,
  Lightbulb,
  MapPin,
  Package,
  Shield,
  Swords,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { WikiEntryType } from "@/lib/ai-wiki";

/** `pct`% of `color` over transparent: rings, glows and washes. */
export function tintOf(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/** A foreground colour plus its 16% background wash. */
export function wikiTint(color: string): { color: string; bg: string } {
  return { color, bg: tintOf(color, 16) };
}

const BLUE = "var(--system-blue)";
const ORANGE = "var(--system-orange)";
const GREEN = "var(--system-green)";
const PINK = "var(--system-pink)";
const PURPLE = "var(--system-purple)";
const NEUTRAL = "var(--label-secondary)";

/* ── Entry types ─────────────────────────────────────────── */

export interface WikiTypeMeta {
  label: string;
  plural: string;
  Icon: LucideIcon;
  color: string;
  bg: string;
}

export const WIKI_TYPE_ORDER: WikiEntryType[] = ["character", "item", "location", "event", "concept"];

export const WIKI_TYPE_META: Record<WikiEntryType, WikiTypeMeta> = {
  character: { label: "Character", plural: "Characters", Icon: User, ...wikiTint(BLUE) },
  item: { label: "Item", plural: "Items", Icon: Swords, ...wikiTint(ORANGE) },
  location: { label: "Location", plural: "Locations", Icon: MapPin, ...wikiTint(GREEN) },
  event: { label: "Event", plural: "Events", Icon: Flame, ...wikiTint(PINK) },
  concept: { label: "Concept", plural: "Concepts", Icon: Lightbulb, ...wikiTint(PURPLE) },
};

/**
 * Colour names the AI uses for entities in the reader (EntityContextMenu,
 * wiki highlights), mapped onto the same tokens as the entry types.
 */
export const WIKI_ENTITY_COLOR: Record<string, string> = {
  blue: BLUE,
  amber: ORANGE,
  emerald: GREEN,
  rose: PINK,
  violet: PURPLE,
};

/* ── Protagonist stat categories ─────────────────────────── */

export interface WikiStatCategoryMeta {
  label: string;
  Icon: LucideIcon;
  color: string;
  bg: string;
}

export const WIKI_STAT_CATEGORY_ORDER = ["attributes", "skills", "inventory", "currency", "status", "other"];

export const WIKI_STAT_CATEGORY_META: Record<string, WikiStatCategoryMeta> = {
  attributes: { label: "Attributes", Icon: Shield, ...wikiTint(BLUE) },
  skills: { label: "Skills", Icon: Zap, ...wikiTint(PURPLE) },
  inventory: { label: "Inventory", Icon: Package, ...wikiTint(GREEN) },
  currency: { label: "Currency", Icon: Coins, ...wikiTint(ORANGE) },
  status: { label: "Status Effects", Icon: Activity, ...wikiTint(PINK) },
  other: { label: "Other", Icon: BarChart2, color: NEUTRAL, bg: "var(--fill-tertiary)" },
};

/* ── Chapter moods ───────────────────────────────────────── */

const MOOD_COLOR: Record<string, string> = {
  tension: PINK,
  action: ORANGE,
  calm: GREEN,
  mystery: PURPLE,
  revelation: BLUE,
};

export function wikiMoodTint(mood: string): { color: string; bg: string } {
  const c = MOOD_COLOR[mood];
  return c ? wikiTint(c) : { color: NEUTRAL, bg: "var(--fill-tertiary)" };
}

/* ── Relationship groups (graph view) ────────────────────── */

export const WIKI_RELATION_CATEGORIES: { label: string; match: RegExp; color: string }[] = [
  { label: "Allies", match: /ally|friend|companion|comrade|partner|trusted/i, color: GREEN },
  { label: "Family", match: /family|father|mother|brother|sister|parent|child|son|daughter|spouse|husband|wife|sibling/i, color: ORANGE },
  { label: "Rivals", match: /enemy|rival|antagonist|opponent|adversary|nemesis|hostile/i, color: PINK },
  { label: "Mentors", match: /mentor|student|teacher|master|apprentice|disciple|guide/i, color: PURPLE },
  { label: "Other", match: /.*/, color: "var(--label-tertiary)" },
];
