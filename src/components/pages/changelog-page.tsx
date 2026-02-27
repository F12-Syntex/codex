"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, GitCommit, Megaphone, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
  message: string;
  description: string;
  date: string;
  author: string;
  release?: GitHubRelease;
}

/* ── Markdown helpers ─────────────────────────────────────── */

function applyBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-medium text-white/70">
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
        <p
          key={i}
          className="mt-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/25"
        >
          {text}
        </p>
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const text = line.replace(/^\s*[-*]\s+/, "");
      elements.push(
        <div key={i} className="flex gap-2 py-0.5">
          <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-white/[0.25]" />
          <span className="text-[12px] text-white/50">{applyBold(text)}</span>
        </div>
      );
      continue;
    }

    elements.push(
      <p key={i} className="text-[12px] text-white/40">
        {applyBold(line)}
      </p>
    );
  }

  return elements;
}

/* ── Skeleton ─────────────────────────────────────────────── */

function Skeleton() {
  return (
    <div className="flex flex-col gap-0">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="flex gap-3 py-2">
          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/[0.08]" />
          <div className="flex flex-1 items-center gap-2">
            <div
              className="h-3 animate-pulse rounded-lg bg-white/[0.06]"
              style={{ width: `${60 + (i * 17) % 40}%` }}
            />
            <div className="ml-auto h-3 w-16 animate-pulse rounded-lg bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Release card ─────────────────────────────────────────── */

function ReleaseCard({
  release,
  date,
  isLatest,
}: {
  release: GitHubRelease;
  date: string;
  isLatest: boolean;
}) {
  return (
    <div className="my-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Megaphone className="h-3.5 w-3.5 text-white/25" strokeWidth={1.5} />
        <span className="text-[13px] font-medium text-white/80">
          {release.tag_name}
        </span>
        <span className="rounded-lg bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/40">
          Release
        </span>
        {isLatest && (
          <span className="rounded-lg bg-white/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-white/50">
            Latest
          </span>
        )}
        <span className="ml-auto text-[11px] text-white/25">{date}</span>
      </div>

      {release.name && release.name !== release.tag_name && (
        <p className="mb-2 text-[13px] font-medium text-white/60">
          {release.name}
        </p>
      )}

      {release.body && <div>{renderBody(release.body)}</div>}
    </div>
  );
}

/* ── Commit row (expandable) ──────────────────────────────── */

function CommitRow({
  entry,
  date,
  expanded,
  onToggle,
}: {
  entry: CommitEntry;
  date: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDescription = entry.description.length > 0;

  return (
    <button
      onClick={hasDescription ? onToggle : undefined}
      className={cn(
        "flex w-full gap-3 text-left transition-colors",
        hasDescription
          ? "cursor-pointer rounded-lg px-2 py-2 hover:bg-white/[0.03]"
          : "cursor-default px-2 py-2"
      )}
    >
      {/* Dot */}
      <div className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/[0.12]" />

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <GitCommit className="h-3 w-3 shrink-0 text-white/15" strokeWidth={1.5} />
          <span className="truncate text-[13px] text-white/50">
            {entry.message}
          </span>
          {hasDescription && (
            <ChevronDown
              className={cn(
                "h-3 w-3 shrink-0 text-white/15 transition-transform",
                expanded && "rotate-180"
              )}
              strokeWidth={1.5}
            />
          )}
          <span className="ml-auto shrink-0 text-[11px] text-white/15">
            {date}
          </span>
        </div>

        {expanded && hasDescription && (
          <div className="mt-2 mb-1 ml-5 border-l border-white/[0.06] pl-3">
            {entry.description.split("\n").map((line, i) => (
              <p key={i} className="text-[12px] text-white/30">
                {line || "\u00A0"}
              </p>
            ))}
          </div>
        )}
      </div>
    </button>
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

async function fetchData(): Promise<CommitEntry[]> {
  const [commits, releases] = await Promise.all([
    fetchAllPages<GitHubCommitRaw>(
      `https://api.github.com/repos/${REPO}/commits`
    ),
    fetchAllPages<GitHubRelease>(
      `https://api.github.com/repos/${REPO}/releases`
    ),
  ]);

  // Map release tag names to release objects
  const releaseMap = new Map<string, GitHubRelease>();
  for (const r of releases) releaseMap.set(r.tag_name, r);

  // We also need to know which commits are tagged — fetch tags
  const tags = await fetchAllPages<{ name: string; commit: { sha: string } }>(
    `https://api.github.com/repos/${REPO}/tags`
  );
  const tagBySha = new Map<string, string>();
  for (const t of tags) tagBySha.set(t.commit.sha, t.name);

  return commits.map((c) => {
    const fullMessage = c.commit.message;
    const firstLine = fullMessage.split("\n")[0];
    const rest = fullMessage.split("\n").slice(1).join("\n").trim();
    const tagName = tagBySha.get(c.sha);
    const release = tagName ? releaseMap.get(tagName) : undefined;

    return {
      sha: c.sha,
      message: firstLine,
      description: rest,
      date: c.commit.committer?.date ?? "",
      author: c.commit.author?.name ?? "",
      release,
    };
  });
}

/* ── Page component ───────────────────────────────────────── */

export function ChangelogPage() {
  const [entries, setEntries] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedShas, setExpandedShas] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData()
      .then((data) => {
        setEntries(data);
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

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 pt-5 pb-1">
        <h1 className="text-sm font-medium text-white/80">What&apos;s New</h1>
        <p className="mt-1 text-[11px] text-white/25">
          Every commit and release to Codex.
        </p>
      </div>

      <div className="flex max-w-[640px] flex-col gap-0 px-4 py-4">
        {loading && <Skeleton />}

        {error && (
          <div className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="mb-3 h-4 w-4 text-white/20" />
            <p className="text-[13px] text-white/30">
              Couldn&apos;t load history
            </p>
            <p className="mt-1 text-[11px] text-white/15">
              Check your connection and try again.
            </p>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <p className="py-16 text-center text-[13px] text-white/30">
            No commits yet
          </p>
        )}

        {!loading &&
          !error &&
          entries.map((entry, idx) =>
            entry.release ? (
              <ReleaseCard
                key={entry.sha}
                release={entry.release}
                date={formatDate(entry.date)}
                isLatest={idx === firstReleaseIdx}
              />
            ) : (
              <CommitRow
                key={entry.sha}
                entry={entry}
                date={formatDate(entry.date)}
                expanded={expandedShas.has(entry.sha)}
                onToggle={() => toggleExpanded(entry.sha)}
              />
            )
          )}
      </div>
    </div>
  );
}
