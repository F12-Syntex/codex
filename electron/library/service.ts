/**
 * Library AI service (owner: WS-E for Phase 2d; AI_AUDIT §6 F5). Batches untagged library items
 * into `library.tag` jobs (Background priority, lane `library`, cached), stores the results as
 * suggestions, and detects series (local rules first, tagging results for the gaps).
 *
 * No `electron` import: the scheduler, the item list and the file signature are injected.
 */

import { randomUUID } from "crypto";
import type { SqlDb } from "../db/sql";
import type { Scheduler } from "../ai/scheduler";
import { Priority } from "../shared/ai/types";
import type {
  LibraryTagInput, LibraryTagItemInput, LibraryTagOutput, LibraryTagRequest, LibraryTagRun, SeriesSuggestion,
} from "../shared/library/types";
import { detectSeries } from "../shared/library/series";
import { LIBRARY_TAG_BATCH, LIBRARY_TAG_VERSION } from "../ai/tasks/library-tags";
import { LibraryStore } from "./store";

export type LibrarySchedulerLike = Pick<Scheduler, "submit" | "result" | "cancel">;

export interface LibraryItemRow {
  filePath: string;
  title: string;
  author: string;
  format: string;
  section: string;
}

export interface LibraryServiceDeps {
  scheduler?: LibrarySchedulerLike | null;
  /** Default: the legacy `items` table. */
  listItems?: () => LibraryItemRow[];
  /** File signature (e.g. `${mtimeMs}-${size}`) so changed files are re-tagged. */
  signature?: (filePath: string) => string | undefined;
  now?: () => number;
  newId?: () => string;
  log?: (msg: string, err?: unknown) => void;
}

interface RunState extends LibraryTagRun {
  group: string;
  pending: number;
}

function itemsFromDb(db: SqlDb): LibraryItemRow[] {
  try {
    return db.all<LibraryItemRow>("SELECT filePath, title, author, format, section FROM items ORDER BY id");
  } catch {
    return []; // no items table (tests)
  }
}

export function toTagInput(item: LibraryItemRow, sig?: string): LibraryTagItemInput {
  const parts = item.filePath.split(/[\\/]/).filter(Boolean);
  const filename = parts.pop() ?? item.filePath;
  const folder = parts.slice(-2).join(" / ");
  return {
    filePath: item.filePath,
    title: item.title || filename,
    ...(item.author && item.author !== "Unknown" ? { author: item.author } : {}),
    filename,
    ...(folder ? { folder } : {}),
    ...(item.format ? { format: item.format.toUpperCase() } : {}),
    ...(sig ? { sig } : {}),
  };
}

export class LibraryService {
  readonly store: LibraryStore;
  private run: RunState | null = null;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly db: SqlDb, private deps: LibraryServiceDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? randomUUID;
    this.store = new LibraryStore(db, this.now);
  }

  configure(deps: Partial<LibraryServiceDeps>): void {
    this.deps = { ...this.deps, ...deps };
  }

  items(): LibraryItemRow[] {
    return (this.deps.listItems ?? (() => itemsFromDb(this.db)))();
  }

  status(): LibraryTagRun | null {
    if (!this.run) return null;
    const { group: _g, pending: _p, ...pub } = this.run;
    return { ...pub };
  }

  /** Queue tagging jobs. A running run is joined (its status returned) rather than duplicated. */
  startTagging(req: LibraryTagRequest = {}): LibraryTagRun {
    if (this.run?.state === "running") return this.status()!;
    const scheduler = this.deps.scheduler;
    if (!scheduler) throw new Error("Library tagging is not available yet (AI scheduler missing)");

    const want = req.filePaths ? new Set(req.filePaths) : null;
    const tagged = req.force ? new Set<string>() : this.store.taggedFiles(LIBRARY_TAG_VERSION);
    const items = this.items().filter(
      (it) => (!want || want.has(it.filePath)) && (!req.section || it.section === req.section) && !tagged.has(it.filePath),
    );
    const runId = this.newId();
    const run: RunState = {
      runId, group: `library:tag:${runId}`, state: "running", total: items.length, done: 0, failed: 0, pending: 0, startedAt: this.now(),
    };
    this.run = run;
    if (items.length === 0) {
      run.state = "done";
      run.finishedAt = this.now();
      return this.status()!;
    }

    for (let i = 0; i < items.length; i += LIBRARY_TAG_BATCH) {
      const batch = items.slice(i, i + LIBRARY_TAG_BATCH);
      const input: LibraryTagInput = { items: batch.map((it) => toTagInput(it, this.deps.signature?.(it.filePath))) };
      run.pending++;
      let ticket;
      try {
        ticket = scheduler.submit<LibraryTagInput>({
          task: "library.tag", input, priority: req.interactive ? Priority.Interactive : Priority.Background, group: run.group, ...(req.force ? { cache: "refresh" as const } : {}),
        });
      } catch (err) {
        this.settle(run, batch.length, null, err instanceof Error ? err.message : String(err));
        continue;
      }
      void scheduler.result<LibraryTagOutput>(ticket.jobId).then(
        (r) => {
          if (r.state === "done" && r.output) this.settle(run, batch.length, r.output);
          else this.settle(run, batch.length, null, r.state === "cancelled" ? undefined : r.error?.message ?? "Tagging failed");
        },
        (err) => this.settle(run, batch.length, null, err instanceof Error ? err.message : String(err)),
      );
    }
    return this.status()!;
  }

  private settle(run: RunState, size: number, out: LibraryTagOutput | null, error?: string): void {
    run.pending = Math.max(0, run.pending - 1);
    if (out) {
      let stored = 0;
      for (const [filePath, result] of Object.entries(out.items)) {
        try {
          this.store.applyTagResult(filePath, result, LIBRARY_TAG_VERSION);
          stored++;
        } catch (err) {
          this.deps.log?.("[library] could not store tags", err);
        }
      }
      run.done += stored;
      run.failed += Math.max(0, size - stored);
    } else {
      run.failed += size;
      if (error) run.error = error;
    }
    if (run.pending === 0 && run.state === "running") {
      run.state = "done";
      run.finishedAt = this.now();
    }
  }

  cancel(): void {
    const run = this.run;
    if (!run || run.state !== "running") return;
    run.state = "cancelled";
    run.finishedAt = this.now();
    try {
      this.deps.scheduler?.cancel({ group: run.group });
    } catch { /* nothing queued */ }
  }

  /**
   * Series suggestions for `filePaths` (default: the whole library). Dismissed pairs are skipped;
   * groups whose volumes are all already accepted in that series are not suggested again.
   */
  detectSeries(filePaths?: readonly string[]): SeriesSuggestion[] {
    const want = filePaths ? new Set(filePaths) : null;
    const items = this.items().filter((it) => !want || want.has(it.filePath));
    const accepted = this.store.acceptedSeriesKeys();
    const groups = detectSeries(
      items.map((it) => ({ filePath: it.filePath, title: it.title })),
      { aiSeries: this.store.aiSeries(), exclude: (fp, key) => this.store.isDismissed(fp, key) },
    );
    return groups.filter((g) => g.volumes.some((v) => accepted.get(v.filePath) !== g.key));
  }
}
