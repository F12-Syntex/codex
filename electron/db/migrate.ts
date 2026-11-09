/**
 * Per-area schema migrations, tracked in `schema_migrations(area, version)`.
 *
 * Each area (ai, chapters, book, knowledge, assistant) owns an append-only list in its own
 * `schema.ts`. To change a schema, APPEND a migration with the next version, never edit an applied one.
 *
 * Semantics:
 * - Versions within an area must be positive integers, strictly increasing (validated up front).
 * - Each pending migration runs in its own transaction together with its `schema_migrations` row,
 *   so a failure leaves neither partial DDL nor a record.
 * - A failure stops that area (later versions may depend on it) but other areas still run.
 *   Errors are returned in the report and logged; startup is never aborted.
 * - Re-running is a no-op.
 */

import type { SqlDb } from "./sql";
import { aiMigrations } from "../ai/schema";
import { chaptersMigrations } from "../ai/artifacts-schema";
import { bookMigrations } from "../book/schema";
import { knowledgeMigrations } from "../knowledge/schema";
import { assistantMigrations } from "../assistant/schema";

export interface Migration {
  /** 1, 2, 3… within the area. */
  version: number;
  /** Short description, recorded for debugging. */
  name: string;
  /** SQL script (may contain several statements) or a function for data migrations. */
  up: string | ((db: SqlDb) => void);
}

export interface AreaMigrations {
  area: string;
  migrations: readonly Migration[];
}

export interface MigrationReport {
  applied: { area: string; version: number; name: string }[];
  errors: { area: string; version: number; name: string; error: string }[];
}

/** Production order. Areas are independent; the order only matters for readability of logs. */
export const AREA_MIGRATIONS: readonly AreaMigrations[] = [
  { area: "ai", migrations: aiMigrations },
  { area: "chapters", migrations: chaptersMigrations },
  { area: "book", migrations: bookMigrations },
  { area: "knowledge", migrations: knowledgeMigrations },
  { area: "assistant", migrations: assistantMigrations },
];

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    area TEXT NOT NULL,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    PRIMARY KEY (area, version)
  );
`;

/** Throws on malformed lists (programmer error, caught by tests). */
export function validateMigrations(areas: readonly AreaMigrations[]): void {
  const seenAreas = new Set<string>();
  for (const { area, migrations } of areas) {
    if (!area) throw new Error("migrations: empty area name");
    if (seenAreas.has(area)) throw new Error(`migrations: duplicate area "${area}"`);
    seenAreas.add(area);
    let prev = 0;
    for (const m of migrations) {
      if (!Number.isInteger(m.version) || m.version <= prev) {
        throw new Error(`migrations: area "${area}" version ${m.version} must be an integer > ${prev}`);
      }
      prev = m.version;
    }
  }
}

export function getAppliedVersions(db: SqlDb, area: string): number[] {
  db.exec(SCHEMA_SQL);
  return db
    .all<{ version: number }>("SELECT version FROM schema_migrations WHERE area = ? ORDER BY version", [area])
    .map((r) => Number(r.version));
}

export function runMigrations(
  db: SqlDb,
  areas: readonly AreaMigrations[] = AREA_MIGRATIONS,
  log: (msg: string, err?: unknown) => void = (msg, err) => console.error(`[migrate] ${msg}`, err ?? ""),
): MigrationReport {
  validateMigrations(areas);
  db.exec(SCHEMA_SQL);
  const report: MigrationReport = { applied: [], errors: [] };

  for (const { area, migrations } of areas) {
    const done = new Set(getAppliedVersions(db, area));
    for (const m of migrations) {
      if (done.has(m.version)) continue;
      try {
        db.transaction(() => {
          if (typeof m.up === "string") db.exec(m.up);
          else m.up(db);
          db.run(
            "INSERT INTO schema_migrations (area, version, name, applied_at) VALUES (?, ?, ?, ?)",
            [area, m.version, m.name, Date.now()],
          );
        });
        report.applied.push({ area, version: m.version, name: m.name });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        report.errors.push({ area, version: m.version, name: m.name, error });
        log(`area "${area}" v${m.version} (${m.name}) failed; skipping the rest of this area`, err);
        break;
      }
    }
  }
  return report;
}
