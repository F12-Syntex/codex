/**
 * Lexicon (word replacements) store (owner: WS-C). Backs `lexicon:get` / `lexicon:set`.
 *
 * Storage: settings key `lexicon:v1` = `{ entries, legacyRaw }`. Until the reader cutover the old
 * renderer code still reads/writes the legacy `wordReplacements` key (`{from,to}[]`), so:
 * - `set()` also writes the legacy key (display/both entries), keeping the old reader in sync;
 * - `get()` notices when the legacy key was edited elsewhere (old Settings page) and re-imports
 *   it, keeping speech-only entries and per-word scope/match from the new store.
 * First run: the legacy list is imported AS SAVED. There are no hidden defaults: users who never
 * saved a list get an empty lexicon (owner decision; the old defaults are the opt-in
 * "Cultivation terms" preset, see shared/pipeline/lexicon-presets.ts).
 */

import type { SqlDb } from "../db/sql";
import type { Lexicon, LexiconEntry } from "../shared/pipeline/types";
import { entriesFromLegacy, entriesToLegacy, makeLexicon, normalizeLexiconEntries } from "../shared/pipeline/lexicon";
import { mergePreset } from "../shared/pipeline/lexicon-presets";

export const LEXICON_KEY = "lexicon:v1";
export const LEGACY_REPLACEMENTS_KEY = "wordReplacements";

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** The app's `settings(key, value)` table as a KeyValueStore. */
export function settingsKV(db: SqlDb): KeyValueStore {
  return {
    get: (key) => db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key])?.value ?? null,
    set: (key, value) => {
      db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
    },
  };
}

interface Stored {
  entries: LexiconEntry[];
  legacyRaw: string | null;
}

function readStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Stored>;
    if (!v || !Array.isArray(v.entries)) return null;
    return { entries: normalizeLexiconEntries(v.entries), legacyRaw: typeof v.legacyRaw === "string" ? v.legacyRaw : null };
  } catch {
    return null;
  }
}

export class LexiconStore {
  private lastVersion: string | null = null;

  constructor(private readonly kv: KeyValueStore, private readonly onChange?: (lex: Lexicon) => void) {}

  get(): Lexicon {
    const legacyRaw = this.kv.get(LEGACY_REPLACEMENTS_KEY);
    const stored = readStored(this.kv.get(LEXICON_KEY));
    let entries: LexiconEntry[];
    if (stored && stored.legacyRaw === legacyRaw) {
      entries = stored.entries;
    } else {
      entries = this.importLegacy(legacyRaw, stored);
      this.kv.set(LEXICON_KEY, JSON.stringify({ entries, legacyRaw } satisfies Stored));
    }
    return this.publish(makeLexicon(entries));
  }

  /** Replace all entries; mirrors display/both entries to the legacy key. */
  set(entries: readonly Partial<LexiconEntry>[]): Lexicon {
    const prev = this.get().version;
    const lex = makeLexicon(entries);
    const legacyRaw = JSON.stringify(entriesToLegacy(lex.entries));
    this.kv.set(LEGACY_REPLACEMENTS_KEY, legacyRaw);
    this.kv.set(LEXICON_KEY, JSON.stringify({ entries: lex.entries, legacyRaw } satisfies Stored));
    this.lastVersion = prev;
    return this.publish(lex);
  }

  /** Merge a named preset into the user's list (their entries win). */
  applyPreset(presetId: string): Lexicon {
    return this.set(mergePreset(this.get().entries, presetId));
  }

  private importLegacy(legacyRaw: string | null, stored: Stored | null): LexiconEntry[] {
    const legacy = entriesFromLegacy(legacyRaw);
    if (!stored) return legacy;
    const prior = new Map(stored.entries.filter((e) => e.scope !== "speech").map((e) => [e.from.toLowerCase(), e]));
    const merged = legacy.map((e) => {
      const p = prior.get(e.from.toLowerCase());
      return p ? { ...p, from: e.from, to: e.to } : e;
    });
    return normalizeLexiconEntries([...merged, ...stored.entries.filter((e) => e.scope === "speech")]);
  }

  private publish(lex: Lexicon): Lexicon {
    // Record the version BEFORE notifying: a listener that reads the lexicon re-enters publish()
    // and must see no change (QA-P2-4).
    const changed = this.lastVersion !== null && this.lastVersion !== lex.version;
    this.lastVersion = lex.version;
    if (changed) this.onChange?.(lex);
    return lex;
  }
}
