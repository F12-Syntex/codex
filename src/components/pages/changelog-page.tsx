"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Megaphone, ChevronDown, GitCommit } from "lucide-react";
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
    <div className="flex flex-col gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
        >
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-12 animate-pulse rounded-lg bg-white/[0.06]" />
            <div
              className="h-3 animate-pulse rounded-lg bg-white/[0.06]"
              style={{ width: `${40 + (i * 17) % 30}%` }}
            />
            <div className="ml-auto h-3 w-14 animate-pulse rounded-lg bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Version card (unified for all commits) ───────────────── */

function VersionCard({
  entry,
  date,
  isLatest,
  expanded,
  onToggle,
}: {
  entry: CommitEntry;
  date: string;
  isLatest: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isRelease = !!entry.release;
  const hasDetails = entry.description.length > 0 || !!entry.release?.body;

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        isRelease
          ? "border-white/[0.08] bg-white/[0.04]"
          : "border-white/[0.04] bg-white/[0.02]",
        hasDetails && "cursor-pointer"
      )}
      onClick={hasDetails ? onToggle : undefined}
    >
      <div className="flex items-center gap-2 p-3">
        {/* Icon */}
        {isRelease ? (
          <Megaphone className="h-3.5 w-3.5 shrink-0 text-white/30" strokeWidth={1.5} />
        ) : (
          <GitCommit className="h-3.5 w-3.5 shrink-0 text-white/15" strokeWidth={1.5} />
        )}

        {/* Version badge */}
        {entry.version && (
          <span
            className={cn(
              "shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-medium",
              isRelease
                ? "bg-white/[0.08] text-white/70"
                : "bg-white/[0.04] text-white/40"
            )}
          >
            v{entry.version}
          </span>
        )}

        {/* Release badge */}
        {isRelease && (
          <span className="shrink-0 rounded-lg bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/40">
            Release
          </span>
        )}
        {isLatest && (
          <span className="shrink-0 rounded-lg bg-white/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-white/50">
            Latest
          </span>
        )}

        {/* Commit title */}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            isRelease ? "text-white/50" : "text-white/35"
          )}
        >
          {entry.title}
        </span>

        {/* Right side: chevron + date */}
        <div className="flex shrink-0 items-center gap-1.5">
          {hasDetails && (
            <ChevronDown
              className={cn(
                "h-3 w-3 text-white/15 transition-transform",
                expanded && "rotate-180"
              )}
              strokeWidth={1.5}
            />
          )}
          <span className="text-[11px] text-white/15">{date}</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="border-t border-white/[0.04] px-3 pt-2 pb-3">
          {/* Release name */}
          {entry.release?.name && entry.release.name !== entry.release.tag_name && (
            <p className="mb-2 text-[13px] font-medium text-white/60">
              {entry.release.name}
            </p>
          )}

          {entry.release?.body ? (
            renderBody(entry.release.body)
          ) : (
            entry.description.split("\n").map((line, i) => (
              <p key={i} className="text-[12px] text-white/30">
                {line || "\u00A0"}
              </p>
            ))
          )}
        </div>
      )}
    </div>
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

  return commits.map((c) => {
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

      <div className="flex max-w-[640px] flex-col gap-1.5 px-4 py-4">
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
          entries.map((entry, idx) => (
            <VersionCard
              key={entry.sha}
              entry={entry}
              date={formatDate(entry.date)}
              isLatest={idx === firstReleaseIdx}
              expanded={expandedShas.has(entry.sha)}
              onToggle={() => toggleExpanded(entry.sha)}
            />
          ))}
      </div>
    </div>
  );
}
