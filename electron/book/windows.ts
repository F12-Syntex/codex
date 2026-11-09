/**
 * Which reader windows are open for which book (owner: WS-C after Phase 0).
 *
 * Used for: owner-window job cancellation (keep Background bulk jobs alive while another window
 * of the same book is open), `book:reveal` (focus the reader for a file), and live frontier
 * lookups from secondary windows. Structural types only, so it is testable without Electron.
 */

/** Subset of `BrowserWindow` this module needs. */
export interface ReaderWindowLike {
  isDestroyed(): boolean;
  webContents: { id: number };
  once(event: "closed", listener: () => void): unknown;
}

interface Entry {
  win: ReaderWindowLike;
  filePath: string;
  webContentsId: number;
}

const byWebContents = new Map<number, Entry>();
const lastClosedListeners = new Set<(filePath: string) => void>();

/**
 * Called when the LAST reader window of a book closes (e.g. the orchestrator stops that book's
 * bulk runs and queued chapter work: matrix #11). Returns an unsubscriber.
 */
export function onBookLastWindowClosed(listener: (filePath: string) => void): () => void {
  lastClosedListeners.add(listener);
  return () => {
    lastClosedListeners.delete(listener);
  };
}

/** Register a reader window for `filePath`; it is forgotten automatically when closed. */
export function trackReaderWindow<W extends ReaderWindowLike>(win: W, filePath: string): void {
  if (win.isDestroyed()) return;
  // Capture the id now: `webContents` is not accessible after the window is destroyed.
  const webContentsId = win.webContents.id;
  byWebContents.set(webContentsId, { win, filePath, webContentsId });
  win.once("closed", () => {
    const e = byWebContents.get(webContentsId);
    if (e && e.win === win) byWebContents.delete(webContentsId);
    if (!isBookOpen(filePath, webContentsId)) {
      for (const l of Array.from(lastClosedListeners)) {
        try {
          l(filePath);
        } catch (err) {
          console.warn("[book] last-window listener failed", err);
        }
      }
    }
  });
}

/** Live reader windows, optionally only those showing `filePath`. */
export function getReaderWindows(filePath?: string): ReaderWindowLike[] {
  const out: ReaderWindowLike[] = [];
  for (const e of byWebContents.values()) {
    if (e.win.isDestroyed()) continue;
    if (filePath === undefined || e.filePath === filePath) out.push(e.win);
  }
  return out;
}

/** The book shown by the reader whose webContents id is `webContentsId`, if it is a reader. */
export function getReaderFilePath(webContentsId: number): string | undefined {
  const e = byWebContents.get(webContentsId);
  return e && !e.win.isDestroyed() ? e.filePath : undefined;
}

/** True if any live reader window shows `filePath`, ignoring `exceptWebContentsId`. */
export function isBookOpen(filePath: string, exceptWebContentsId?: number): boolean {
  for (const e of byWebContents.values()) {
    if (e.webContentsId === exceptWebContentsId || e.win.isDestroyed()) continue;
    if (e.filePath === filePath) return true;
  }
  return false;
}

/** Test helper. */
export function _resetReaderWindowsForTests(): void {
  byWebContents.clear();
  lastClosedListeners.clear();
}
