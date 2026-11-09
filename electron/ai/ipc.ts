/**
 * AI core (ai:*) RPC handlers (owner: WS-A).
 *
 * Creates the AI runtime singleton (`runtime.ts`) and registers every `ai:*` channel. Runs first
 * in `registerAll`, so other areas can call `getAIRuntime()` in their own `register*()`.
 *
 * Owner-window cancellation: every webContents' `destroyed` cancels the jobs it submitted
 * (interest removal: a job other windows also asked for keeps running), except Background jobs
 * of a book that another reader window still shows (bulk runs survive closing one of two windows).
 *
 * Phase 2a: the renderer uses these channels for every AI call. The legacy renderer client
 * (`src/lib/ai-client.ts`) submits the `legacy.complete` task registered here (see legacy.ts).
 * No top-level `electron` import: it is required lazily, and tests can inject.
 */

import type { AreaContext } from "../ipc/context";
import type { CacheSelector, CancelSelector, JobSpec, TaskId } from "../shared/ai/types";
import { Priority } from "../shared/ai/types";
import { isBookOpen } from "../book/windows";
import { initAIRuntime, type AIRuntime, type AIRuntimeDeps } from "./runtime";
import type { SecretCipher } from "./settings";
import { legacyCompleteTask, sanitizeLegacyInput } from "./legacy";

/** The bits of the `electron` module this file uses (structural, for tests). */
export interface ElectronLike {
  app?: {
    getLocale?(): string;
    on(event: "web-contents-created", listener: (event: unknown, wc: WebContentsLike) => void): unknown;
  };
  webContents?: { getAllWebContents(): WebContentsLike[] };
  safeStorage?: {
    isEncryptionAvailable(): boolean;
    encryptString(plain: string): Uint8Array;
    decryptString(data: Buffer): string;
  };
}

export interface WebContentsLike {
  id: number;
  once(event: "destroyed", listener: () => void): unknown;
}

export interface RegisterAIOptions extends Partial<Omit<AIRuntimeDeps, "db" | "broadcast">> {
  /** Inject for tests; default `require("electron")` when running inside Electron. */
  electron?: ElectronLike | null;
}

function loadElectron(): ElectronLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("electron");
    return mod && typeof mod === "object" ? (mod as ElectronLike) : null; // plain node returns a path string
  } catch {
    return null;
  }
}

function cipherFrom(e: ElectronLike | null): SecretCipher | undefined {
  const ss = e?.safeStorage;
  if (!ss) return undefined;
  return {
    isAvailable: () => {
      try {
        return ss.isEncryptionAvailable();
      } catch {
        return false;
      }
    },
    encrypt: (plain) => ss.encryptString(plain),
    decrypt: (data) => ss.decryptString(Buffer.from(data)),
  };
}

const PRIORITIES = new Set<number>(Object.values(Priority));

/** Reject malformed specs from renderers (structured clone already stripped functions). */
export function sanitizeSpec(raw: unknown): JobSpec {
  const s = (raw ?? {}) as Partial<JobSpec>;
  if (typeof s.task !== "string" || !s.task) throw new Error("ai:submit: spec.task is required");
  const priority = PRIORITIES.has(s.priority as number) ? (s.priority as Priority) : Priority.Visible;
  const spec: JobSpec = { task: s.task as TaskId, input: s.input, priority };
  if (s.scope && typeof s.scope === "object") {
    const sc = s.scope;
    spec.scope = {};
    if (typeof sc.filePath === "string") spec.scope.filePath = sc.filePath;
    if (typeof sc.chapterIndex === "number") spec.scope.chapterIndex = sc.chapterIndex;
    if (typeof sc.chapterId === "string") spec.scope.chapterId = sc.chapterId;
  }
  if (typeof s.group === "string" && s.group) spec.group = s.group.slice(0, 200);
  if (s.cache === "use" || s.cache === "refresh" || s.cache === "bypass") spec.cache = s.cache;
  if (s.stream) spec.stream = true;
  return spec;
}

export function sanitizeCancel(raw: unknown): CancelSelector | null {
  const s = (raw ?? {}) as Record<string, unknown>;
  if (typeof s.jobId === "string") return { jobId: s.jobId };
  if (typeof s.group === "string") return { group: s.group };
  if (typeof s.filePath === "string") {
    const p = s.priorityAtLeast;
    return PRIORITIES.has(p as number) ? { filePath: s.filePath, priorityAtLeast: p as Priority } : { filePath: s.filePath };
  }
  return null;
}

function sanitizeCacheSelector(raw: unknown): CacheSelector {
  const s = (raw ?? {}) as Record<string, unknown>;
  const out: CacheSelector = {};
  if (typeof s.filePath === "string") out.filePath = s.filePath;
  if (typeof s.task === "string") out.task = s.task as TaskId;
  if (typeof s.belowVersion === "number") out.belowVersion = s.belowVersion;
  return out;
}

/** Cancel what a destroyed window submitted (kept: Background jobs of a book still open elsewhere). */
export function cancelForOwner(rt: Pick<AIRuntime, "scheduler">, ownerId: number, bookOpen: (filePath: string, except: number) => boolean = isBookOpen): number {
  return rt.scheduler.cancel({
    owner: ownerId,
    keep: (job) => job.priority === Priority.Background && !!job.scope?.filePath && bookOpen(job.scope.filePath, ownerId),
  });
}

export function registerAI(ctx: AreaContext, opts: RegisterAIOptions = {}): AIRuntime {
  const electron = opts.electron === undefined ? loadElectron() : opts.electron;
  let locale = opts.locale;
  if (!locale) {
    try {
      locale = electron?.app?.getLocale?.();
    } catch { /* app not ready */ }
  }

  const rt = initAIRuntime({
    ...opts,
    db: ctx.db,
    broadcast: (e) => ctx.broadcast("ai:event", e),
    cipher: opts.cipher ?? cipherFrom(electron),
    locale,
  });

  if (!rt.registry.has("legacy.complete")) rt.registry.register(legacyCompleteTask);

  // ── jobs ──
  ctx.handle("ai:submit", (meta, raw) => {
    const spec = sanitizeSpec(raw);
    // Validate the legacy payload here, so a malformed request fails at once (and is never cached).
    if (spec.task === "legacy.complete") spec.input = sanitizeLegacyInput(spec.input);
    return rt.scheduler.submit(spec, meta.senderId);
  });
  ctx.handle("ai:result", (_meta, jobId) => rt.scheduler.result(String(jobId)));
  ctx.handle("ai:cancel", (meta, sel) => {
    const s = sanitizeCancel(sel);
    if (!s) return 0;
    if ("jobId" in s) {
      // A window cancelling a job it asked for only withdraws ITS interest, so a job another
      // window joined keeps running. A job this window never asked for is cancelled outright.
      if (rt.scheduler.ownsInterest?.(s.jobId, meta.senderId)) {
        return rt.scheduler.cancel({ owner: meta.senderId, keep: (j) => j.jobId !== s.jobId });
      }
    }
    return rt.scheduler.cancel(s);
  });

  // ── settings / key ──
  ctx.handle("ai:settings:get", () => rt.settings.getPublic());
  ctx.handle("ai:settings:update", (_meta, patch) => rt.settings.update(patch ?? {}));
  ctx.handle("ai:key:set", (_meta, key) => rt.setApiKey(typeof key === "string" ? key : ""));
  ctx.handle("ai:key:test", () => rt.testKey());
  ctx.handle("ai:health", () => rt.health());

  // ── models / usage / cache ──
  ctx.handle("ai:models", () => rt.models.list());
  ctx.handle("ai:usage", (_meta, sel) => {
    const s = (sel ?? {}) as { filePath?: unknown; sinceMs?: unknown };
    return rt.usage.summary({
      filePath: typeof s.filePath === "string" ? s.filePath : undefined,
      sinceMs: typeof s.sinceMs === "number" ? s.sinceMs : undefined,
    });
  });
  ctx.handle("ai:cache:stats", () => rt.cache.stats());
  ctx.handle("ai:cache:clear", (_meta, sel) => rt.cache.invalidate(sanitizeCacheSelector(sel)));

  // ── owner-window cancellation ──
  const attached = new Set<number>();
  const attach = (wc: WebContentsLike) => {
    if (!wc || attached.has(wc.id)) return;
    attached.add(wc.id);
    const id = wc.id;
    wc.once("destroyed", () => {
      attached.delete(id);
      try {
        cancelForOwner(rt, id);
      } catch (err) {
        console.warn("[ai] owner cancellation failed", err);
      }
    });
  };
  try {
    electron?.app?.on("web-contents-created", (_e, wc) => attach(wc));
    for (const wc of electron?.webContents?.getAllWebContents() ?? []) attach(wc);
  } catch (err) {
    console.warn("[ai] could not hook web-contents lifecycle", err);
  }

  return rt;
}
