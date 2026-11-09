"use client";

/**
 * What's New — release timeline.
 *
 * Composition adapted from two 21st.dev components:
 *  - "What's New Changelog Timeline" (dhxwhy, id 36570): vertical rail with
 *    category-coloured nodes, expand-in-place rows (grid-rows 0fr→1fr).
 *  - "Changelog" (mohammadshehadeh / Hirael, id 28402): sticky version rail,
 *    version badges, New / Improved / Fixed tags and a category filter.
 * Restyled for Codex Glass: serif release headings, latest release as a hero
 * glass card with paper grain, motion/react entrances.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  Megaphone,
  ChevronDown,
  Download,
  Loader2,
  ArrowDownToLine,
  Sparkles,
  Bug,
  TrendingUp,
  Hammer,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/ui/blur-fade";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SegmentedControl } from "@/components/ui/segmented-control";

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

interface GitHubCommitRaw {
  sha: string;
  commit: {
    message: string;
    committer: { date: string } | null;
    author: { name: string } | null;
  };
}

interface CommitEntry {
  sha: string;
  version: string | null;
  title: string;
  description: string;
  date: string;
  release?: GitHubRelease;
}

/* ── Parse version from commit message ────────────────────── */

const VERSION_RE = /\(v?(\d+\.\d+\.\d+)\)\s*$/;

function parseCommitMessage(message: string): { title: string; version: string | null } {
  const match = message.match(VERSION_RE);
  if (match) {
    return {
      title: message.replace(VERSION_RE, "").trim(),
      version: match[1],
    };
  }
  return { title: message, version: null };
}

/* ── Version comparison ───────────────────────────────────── */

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
  }
  return 0;
}

/* ── Presentation: change categories ──────────────────────── */

type ChangeKind = "feature" | "improvement" | "fix" | "chore";
type KindFilter = "all" | ChangeKind;

const KIND: Record<
  ChangeKind,
  { label: string; dot: string; text: string; badge: "success" | "accent" | "warning" | "default"; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }
> = {
  feature: { label: "New", dot: "bg-success", text: "text-success", badge: "success", icon: Sparkles },
  improvement: { label: "Improved", dot: "bg-info", text: "text-info", badge: "accent", icon: TrendingUp },
  fix: { label: "Fixed", dot: "bg-warning", text: "text-warning", badge: "warning", icon: Bug },
  chore: { label: "Maintenance", dot: "bg-label-quaternary", text: "text-label-tertiary", badge: "default", icon: Hammer },
};

const KIND_ORDER: ChangeKind[] = ["feature", "improvement", "fix", "chore"];

/** Classify a commit title by its conventional-commit prefix (display only). */
function classify(title: string): { kind: ChangeKind; text: string } {
  const prefix = title.match(/^(\w+)(\([^)]*\))?!?:\s*/);
  let kind: ChangeKind = "improvement";
  let text = title;
  if (prefix) {
    const type = prefix[1].toLowerCase();
    text = title.slice(prefix[0].length);
    if (type === "feat" || type === "feature") kind = "feature";
    else if (type === "fix" || type === "hotfix") kind = "fix";
    else if (type === "perf" || type === "refactor" || type === "style") kind = "improvement";
    else kind = "chore";
  } else if (/^⚡/.test(title)) {
    kind = "improvement";
    text = title.replace(/^⚡\s*(Bolt:\s*)?(\[[^\]]*\]\s*)?/u, "");
  } else if (/^(merge|update|bump)\b/i.test(title)) {
    kind = "chore";
  } else if (/^(add|new|introduce|implement)\b/i.test(title)) {
    kind = "feature";
  } else if (/^fix/i.test(title)) {
    kind = "fix";
  }
  text = text.trim();
  return { kind, text: text ? text.charAt(0).toUpperCase() + text.slice(1) : title };
}

/* ── Presentation: group commits into releases ────────────── */

interface ReleaseGroup {
  key: string;
  version: string | null;
  entries: CommitEntry[];
  release?: GitHubRelease;
  date: string;
  isLatest: boolean;
}

function groupEntries(entries: CommitEntry[], latestSha: string | null): ReleaseGroup[] {
  const groups: ReleaseGroup[] = [];
  let current: ReleaseGroup | null = null;
  for (const e of entries) {
    // A versioned commit opens a new release; older unversioned commits
    // shipped with the version above them.
    if (!current || (e.version !== null && e.version !== current.version)) {
      current = { key: e.sha, version: e.version, entries: [], date: e.date, isLatest: false };
      groups.push(current);
    }
    current!.entries.push(e);
    if (e.release && !current!.release) current!.release = e.release;
    if (e.sha === latestSha) current!.isLatest = true;
  }
  return groups;
}

function groupHeading(group: ReleaseGroup): string {
  const r = group.release;
  if (r?.name && r.name !== r.tag_name) return r.name;
  const items = group.entries.map((e) => classify(e.title));
  return (items.find((i) => i.kind === "feature") ?? items.find((i) => i.kind !== "chore") ?? items[0]).text;
}

function dominantKind(group: ReleaseGroup): ChangeKind {
  const kinds = group.entries.map((e) => classify(e.title).kind);
  return KIND_ORDER.find((k) => kinds.includes(k)) ?? "chore";
}

/* ── Update Banner ────────────────────────────────────────── */

type UpdateState = "idle" | "checking" | "downloading" | "ready" | "error";

function UpdateBanner({ latestVersion }: { latestVersion: string }) {
  const [state, setState] = useState<UpdateState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const cleanup = api.onUpdateStatus((event) => {
      switch (event.status) {
        case "checking":
          setState("checking");
          break;
        case "available":
          setState("downloading");
          break;
        case "not-available":
          setState("idle");
          break;
        case "progress": {
          setState("downloading");
          const data = event.data as { percent: number } | undefined;
          if (data) setProgress(data.percent);
          break;
        }
        case "downloaded":
          setState("ready");
          break;
        case "error": {
          setState("error");
          const errData = event.data as { message?: string } | undefined;
          setErrorMessage(errData?.message ?? "Unknown error");
          break;
        }
      }
    });
    return cleanup;
  }, []);

  const handleUpdate = () => {
    setState("checking");
    window.electronAPI?.checkForUpdates();
  };

  const handleInstall = () => {
    window.electronAPI?.installUpdate();
  };

  return (
    <div className="glass-thin relative flex items-center gap-3 overflow-hidden rounded-xl py-2.5 pr-2.5 pl-3">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-fg">
        <ArrowDownToLine className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-headline text-label">Update available</p>
        <p className={cn("truncate text-xs", state === "error" ? "text-danger" : "text-label-secondary")}>
          {state === "downloading"
            ? `Downloading v${latestVersion}... ${progress}%`
            : state === "ready"
              ? `v${latestVersion} is ready to install`
              : state === "checking"
                ? "Checking for updates..."
                : state === "error"
                  ? `Update failed — ${errorMessage ?? "try again"}`
                  : `v${APP_VERSION} → v${latestVersion}`}
        </p>
      </div>

      {state === "ready" ? (
        <Button size="sm" onClick={handleInstall}>
          <Download className="size-3.5" />
          Restart &amp; Update
        </Button>
      ) : state === "downloading" || state === "checking" ? (
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fill-tertiary px-3 text-xs text-label-secondary tabular-nums">
          <Loader2 className="size-3.5 animate-spin" />
          {state === "checking" ? "Checking..." : `${progress}%`}
        </span>
      ) : (
        <Button size="sm" onClick={handleUpdate}>
          <Download className="size-3.5" />
          Update Now
        </Button>
      )}

      {state === "downloading" && (
        <motion.span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 bg-brand"
          initial={false}
          animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
        />
      )}
    </div>
  );
}

/* ── Markdown helpers ─────────────────────────────────────── */

function applyBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-label">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function renderBody(body: string) {
  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      elements.push(<div key={i} className="h-1.5" />);
      continue;
    }

    if (/^#{2,3}\s+/.test(line)) {
      const text = line.replace(/^#{2,3}\s+/, "");
      elements.push(
        <p key={i} className="text-section mt-3 mb-1.5 text-label-tertiary">
          {text}
        </p>
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const text = line.replace(/^\s*[-*]\s+/, "");
      elements.push(
        <div key={i} className="flex gap-2.5 py-0.5">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-label-quaternary" />
          <span className="text-sm leading-relaxed text-label-secondary">{applyBold(text)}</span>
        </div>
      );
      continue;
    }

    elements.push(
      <p key={i} className="text-sm leading-relaxed text-label-secondary">
        {applyBold(line)}
      </p>
    );
  }

  return elements;
}

/* ── Skeleton ─────────────────────────────────────────────── */

function Skeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true" aria-label="Loading history">
      <div className="glass grain relative flex flex-col gap-4 rounded-2xl p-6">
        <div className="flex gap-2">
          <div className="h-5 w-16 animate-pulse rounded-full bg-fill-tertiary" />
          <div className="h-5 w-12 animate-pulse rounded-full bg-fill-quaternary" />
        </div>
        <div className="h-6 w-2/3 animate-pulse rounded-sm bg-fill-tertiary" />
        <div className="flex flex-col gap-2.5 pt-1">
          {[72, 58, 64].map((w) => (
            <div key={w} className="h-3 animate-pulse rounded-xs bg-fill-quaternary" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-5">
          <div className="mt-1 size-4 animate-pulse rounded-full bg-fill-tertiary" />
          <div className="flex flex-col gap-3">
            <div className="h-4 w-24 animate-pulse rounded-full bg-fill-quaternary" />
            <div className="h-5 animate-pulse rounded-sm bg-fill-tertiary" style={{ width: `${40 + ((i * 17) % 30)}%` }} />
            <div className="h-3 w-1/2 animate-pulse rounded-xs bg-fill-quaternary" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Change row (one commit) ──────────────────────────────── */

function ChangeRow({
  entry,
  date,
  expanded,
  onToggle,
  showKindLabel,
}: {
  entry: CommitEntry;
  date: string;
  expanded: boolean;
  onToggle: () => void;
  showKindLabel?: boolean;
}) {
  const hasDetails = entry.description.length > 0 || !!entry.release?.body;
  const { kind, text } = classify(entry.title);
  const meta = KIND[kind];
  const Comp = hasDetails ? "button" : "div";

  return (
    <li className="group/change">
      <Comp
        type={hasDetails ? "button" : undefined}
        onClick={hasDetails ? onToggle : undefined}
        aria-expanded={hasDetails ? expanded : undefined}
        className={cn(
          "-mx-2 flex min-h-8 w-[calc(100%+1rem)] items-start gap-2.5 rounded-md px-2 py-1.5 text-left",
          hasDetails && "focus-ring cursor-pointer transition-colors duration-150 hover:bg-fill-quaternary",
        )}
      >
        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", meta.dot)} />
        <span className="min-w-0 flex-1 text-sm leading-relaxed text-label-secondary group-hover/change:text-label">
          {showKindLabel && <span className={cn("mr-1.5 font-medium", meta.text)}>{meta.label}</span>}
          {text}
        </span>
        {entry.release && (
          <Badge variant="outline" className="mt-0.5">
            <Megaphone strokeWidth={2} />
            Release
          </Badge>
        )}
        {hasDetails && (
          <ChevronDown
            className={cn(
              "mt-1 size-3.5 shrink-0 text-label-tertiary transition-transform duration-200 ease-apple",
              expanded && "rotate-180",
            )}
            strokeWidth={2}
          />
        )}
        <span className="mt-0.5 w-12 shrink-0 text-right text-2xs text-label-tertiary tabular-nums">{date}</span>
      </Comp>

      {/* Expand-in-place (grid-rows 0fr → 1fr) */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-apple",
          expanded && hasDetails ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        aria-hidden={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-1 mb-2 ml-4 border-l border-separator pl-4">
            {entry.release?.name && entry.release.name !== entry.release.tag_name && (
              <p className="mb-2 text-headline text-label">{entry.release.name}</p>
            )}
            {entry.release?.body ? (
              renderBody(entry.release.body)
            ) : (
              entry.description.split("\n").map((line, i) => (
                <p key={i} className="text-xs leading-relaxed text-label-tertiary">
                  {line || " "}
                </p>
              ))
            )}
            {entry.release?.html_url && (
              <button
                type="button"
                onClick={() => window.open(entry.release!.html_url, "_blank")}
                className="focus-ring mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-brand hover:underline"
              >
                View on GitHub
                <ExternalLink className="size-3" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/* ── Release body: categorized change lists ───────────────── */

function ReleaseChanges({
  group,
  expandedShas,
  onToggle,
  formatDate,
}: {
  group: ReleaseGroup;
  expandedShas: Set<string>;
  onToggle: (sha: string) => void;
  formatDate: (d: string) => string;
}) {
  const byKind = useMemo(() => {
    const map = new Map<ChangeKind, CommitEntry[]>();
    for (const e of group.entries) {
      const k = classify(e.title).kind;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return KIND_ORDER.filter((k) => map.has(k)).map((k) => [k, map.get(k)!] as const);
  }, [group]);

  // A single-change release reads as one line — no section headers.
  if (group.entries.length === 1) {
    const e = group.entries[0];
    return (
      <ul>
        <ChangeRow entry={e} date={formatDate(e.date)} expanded={expandedShas.has(e.sha)} onToggle={() => onToggle(e.sha)} showKindLabel />
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {byKind.map(([kind, items]) => {
        const meta = KIND[kind];
        const Icon = meta.icon;
        return (
          <section key={kind}>
            <h4 className="text-section mb-1 flex items-center gap-1.5 text-label-tertiary">
              <Icon className={cn("size-3", meta.text)} strokeWidth={2.25} />
              {meta.label}
              <span className="font-normal text-label-quaternary tabular-nums">{items.length}</span>
            </h4>
            <ul>
              {items.map((e) => (
                <ChangeRow key={e.sha} entry={e} date={formatDate(e.date)} expanded={expandedShas.has(e.sha)} onToggle={() => onToggle(e.sha)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function VersionPill({ group, className }: { group: ReleaseGroup; className?: string }) {
  return group.version ? (
    <Badge variant="outline" className={cn("font-mono", className)}>v{group.version}</Badge>
  ) : (
    <Badge variant="outline" className={className}>In development</Badge>
  );
}

/* ── Data fetching ────────────────────────────────────────── */

const REPO = "F12-Syntex/codex";

async function fetchAllPages<T>(baseUrl: string, maxPages = 5): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const res = await fetch(`${baseUrl}${sep}per_page=100&page=${page}`);
    if (!res.ok) throw new Error(`Failed to fetch ${baseUrl}`);
    const data: T[] = await res.json();
    all.push(...data);
    if (data.length < 100) break;
  }
  return all;
}

async function fetchData(): Promise<{ entries: CommitEntry[]; latestRelease: string | null }> {
  const [commits, releases, tags] = await Promise.all([
    fetchAllPages<GitHubCommitRaw>(
      `https://api.github.com/repos/${REPO}/commits`
    ),
    fetchAllPages<GitHubRelease>(
      `https://api.github.com/repos/${REPO}/releases`
    ),
    fetchAllPages<{ name: string; commit: { sha: string } }>(
      `https://api.github.com/repos/${REPO}/tags`
    ),
  ]);

  const releaseMap = new Map<string, GitHubRelease>();
  for (const r of releases) releaseMap.set(r.tag_name, r);

  const tagBySha = new Map<string, string>();
  for (const t of tags) tagBySha.set(t.commit.sha, t.name);

  // Find latest release version
  let latestRelease: string | null = null;
  if (releases.length > 0) {
    latestRelease = releases[0].tag_name.replace(/^v/, "");
  }

  const entries = commits.map((c) => {
    const fullMessage = c.commit.message;
    const firstLine = fullMessage.split("\n")[0];
    const rest = fullMessage.split("\n").slice(1).join("\n").trim();

    const { title, version: parsedVersion } = parseCommitMessage(firstLine);

    // Check if this commit has a tag → release
    const tagName = tagBySha.get(c.sha);
    const release = tagName ? releaseMap.get(tagName) : undefined;

    // Version: prefer parsed from message, fall back to tag name
    let version = parsedVersion;
    if (!version && tagName) {
      const tagVersion = tagName.replace(/^v/, "");
      if (/^\d+\.\d+\.\d+/.test(tagVersion)) version = tagVersion;
    }

    return {
      sha: c.sha,
      version,
      title: title || firstLine,
      description: rest,
      date: c.commit.committer?.date ?? "",
      release,
    };
  });

  return { entries, latestRelease };
}

/* ── Page component ───────────────────────────────────────── */

export function ChangelogPage() {
  const [entries, setEntries] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedShas, setExpandedShas] = useState<Set<string>>(new Set());
  const [latestRelease, setLatestRelease] = useState<string | null>(null);
  const [filter, setFilter] = useState<KindFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    fetchData()
      .then((data) => {
        setEntries(data.entries);
        setLatestRelease(data.latestRelease);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const toggleExpanded = useCallback((sha: string) => {
    setExpandedShas((prev) => {
      const next = new Set(prev);
      if (next.has(sha)) next.delete(sha);
      else next.add(sha);
      return next;
    });
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const firstReleaseIdx = entries.findIndex((e) => e.release);
  const isOutdated = latestRelease !== null && compareVersions(APP_VERSION, latestRelease) < 0;

  const latestSha = firstReleaseIdx >= 0 ? entries[firstReleaseIdx].sha : null;
  const allGroups = useMemo(() => groupEntries(entries, latestSha), [entries, latestSha]);
  const groups = useMemo(() => {
    if (filter === "all") return allGroups;
    return allGroups
      .map((g) => ({ ...g, entries: g.entries.filter((e) => classify(e.title).kind === filter) }))
      .filter((g) => g.entries.length > 0);
  }, [allGroups, filter]);

  const [hero, ...rest] = groups;

  const scrollToGroup = (key: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-group="${key}"]`);
    el?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  const ready = !loading && !error && entries.length > 0;

  return (
    <div ref={scrollRef} className="flex h-full flex-col overflow-y-auto scroll-pt-6">
      {/* ── Header ─────────────────────────────────── */}
      <header className="flex items-end justify-between gap-6 px-8 pt-6 pb-4">
        <div className="min-w-0">
          <h1 className="text-large-title font-display text-label">What&apos;s New</h1>
          <p className="mt-1 text-sm text-label-secondary">
            {ready ? (
              <>
                <NumberTicker value={entries.length} className="tabular-nums" /> changes across{" "}
                <NumberTicker value={allGroups.length} className="tabular-nums" /> versions of Codex.
              </>
            ) : (
              "Every commit and release to Codex."
            )}
          </p>
        </div>
        {ready && (
          <SegmentedControl<KindFilter>
            value={filter}
            onValueChange={setFilter}
            size="sm"
            options={[
              { value: "all", label: "All" },
              { value: "feature", label: "New" },
              { value: "improvement", label: "Improved" },
              { value: "fix", label: "Fixed" },
            ]}
          />
        )}
      </header>

      {/* Update banner */}
      {!loading && isOutdated && (
        <div className="max-w-5xl px-8 pb-2">
          <UpdateBanner latestVersion={latestRelease!} />
        </div>
      )}

      <div className="flex w-full max-w-5xl gap-10 px-8 pt-4 pb-32">
        {/* ── Version index (sticky rail) ─────────────── */}
        {ready && groups.length > 1 && (
          <nav aria-label="Versions" className="sticky top-6 hidden w-36 shrink-0 self-start lg:block">
            <p className="text-section mb-2 px-2 text-label-tertiary">Versions</p>
            <ul className="scrollbar-none flex max-h-[60vh] flex-col overflow-y-auto">
              {groups.slice(0, 40).map((g) => (
                <li key={g.key}>
                  <button
                    type="button"
                    onClick={() => scrollToGroup(g.key)}
                    className="focus-ring flex h-7 w-full items-center gap-2 rounded-md px-2 text-left transition-colors duration-150 hover:bg-fill-quaternary"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", KIND[dominantKind(g)].dot)} />
                    <span className="flex-1 truncate font-mono text-xs text-label-secondary">
                      {g.version ? `v${g.version}` : "Next"}
                    </span>
                    <span className="text-2xs text-label-quaternary tabular-nums">{formatDate(g.date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="min-w-0 max-w-2xl flex-1">
          {loading && <Skeleton />}

          {error && (
            <EmptyState
              icon={<AlertCircle />}
              title="Couldn't load history"
              description="Check your connection and try again."
            />
          )}

          {!loading && !error && entries.length === 0 && (
            <EmptyState icon={<Megaphone />} title="No commits yet" description="Release notes will appear here." />
          )}

          {ready && groups.length === 0 && (
            <EmptyState icon={<Megaphone />} title="Nothing here" description="No changes match this filter." />
          )}

          <AnimatePresence mode="wait" initial={false}>
            {ready && hero && (
              <motion.div
                key={filter}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              >
                {/* ── Hero: latest release ─────────────── */}
                <BlurFade>
                  <article data-group={hero.key} className="glass grain relative overflow-hidden rounded-2xl p-6">
                    <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-brand/25 blur-3xl" />
                    <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 size-56 rounded-full bg-brand/10 blur-3xl" />
                    <div className="relative">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="accent">
                          <Sparkles strokeWidth={2} />
                          Latest
                        </Badge>
                        <VersionPill group={hero} />
                        {hero.isLatest && <Badge variant="success">Release</Badge>}
                        <span className="text-xs text-label-tertiary">{formatDate(hero.date)}</span>
                      </div>
                      <h2 className="mt-3 text-title font-display text-label text-balance">{groupHeading(hero)}</h2>
                      <p className="mt-1 text-xs text-label-tertiary">
                        {hero.entries.length} {hero.entries.length === 1 ? "change" : "changes"}
                      </p>
                      {(hero.entries.length > 1 || hero.entries[0].description || hero.entries[0].release?.body) && (
                        <div className="mt-5">
                          <ReleaseChanges group={hero} expandedShas={expandedShas} onToggle={toggleExpanded} formatDate={formatDate} />
                        </div>
                      )}
                    </div>
                  </article>
                </BlurFade>

                {/* ── Timeline ─────────────────────────── */}
                {rest.length > 0 && (
                  <ol className="relative mt-10">
                    <span aria-hidden className="pointer-events-none absolute top-2 bottom-2 left-2 w-px -translate-x-1/2 bg-separator" />
                    {rest.map((group, i) => {
                      const kind = dominantKind(group);
                      return (
                        <li key={group.key} data-group={group.key} className="relative scroll-mt-6 pb-10 last:pb-0">
                          <BlurFade inView delay={Math.min(i, 6) * 0.03} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-5">
                            <span className="relative z-10 mt-0.5 inline-flex size-4 items-center justify-center rounded-full bg-fill-tertiary hairline">
                              <span className={cn("size-2 rounded-full", KIND[kind].dot, group.isLatest && "shadow-[0_0_10px_var(--accent-brand)]")} />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <VersionPill group={group} />
                                {group.isLatest && <Badge variant="accent">Latest release</Badge>}
                                <span className="text-xs text-label-tertiary">{formatDate(group.date)}</span>
                              </div>
                              {group.entries.length > 1 && (
                                <h3 className="mt-2 font-display text-lg font-semibold text-label text-balance">
                                  {groupHeading(group)}
                                </h3>
                              )}
                              <div className="mt-2.5">
                                <ReleaseChanges group={group} expandedShas={expandedShas} onToggle={toggleExpanded} formatDate={formatDate} />
                              </div>
                            </div>
                          </BlurFade>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
