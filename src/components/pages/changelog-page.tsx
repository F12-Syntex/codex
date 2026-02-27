"use client";

import { useState, useEffect } from "react";
import { AlertCircle, Tag, Megaphone } from "lucide-react";

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

interface GitHubTag {
  name: string;
  commit: { sha: string };
}

interface GitHubCommit {
  sha: string;
  commit: { committer: { date: string } | null; message: string };
}

interface VersionEntry {
  tag: string;
  date: string;
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

/* ── Skeletons ────────────────────────────────────────────── */

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4 pl-1">
          <div className="flex flex-col items-center">
            <div className="h-1.5 w-1.5 rounded-full bg-white/[0.1]" />
            <div className="w-px flex-1 bg-white/[0.06]" />
          </div>
          <div className="flex-1 pb-2">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-3.5 w-16 animate-pulse rounded-lg bg-white/[0.06]" />
              <div className="h-3 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
            </div>
            {i <= 2 && (
              <div className="space-y-1.5">
                <div className="h-3 w-4/5 animate-pulse rounded-lg bg-white/[0.06]" />
                <div className="h-3 w-3/5 animate-pulse rounded-lg bg-white/[0.06]" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Release card (special UI for published releases) ───── */

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
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
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

/* ── Version row (plain tag without a release) ──────────── */

function VersionRow({
  tag,
  date,
  isLast,
}: {
  tag: string;
  date: string;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-4 pl-1">
      <div className="flex flex-col items-center">
        <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/[0.12]" />
        {!isLast && <div className="w-px flex-1 bg-white/[0.04]" />}
      </div>
      <div className="flex flex-1 items-center gap-2 pb-4">
        <Tag className="h-3 w-3 text-white/15" strokeWidth={1.5} />
        <span className="text-[13px] text-white/40">{tag}</span>
        <span className="text-[11px] text-white/15">{date}</span>
      </div>
    </div>
  );
}

/* ── Data fetching ────────────────────────────────────────── */

const REPO = "F12-Syntex/codex";

async function fetchAllVersions(): Promise<VersionEntry[]> {
  const [tagsRes, releasesRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${REPO}/tags?per_page=100`),
    fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`),
  ]);

  if (!tagsRes.ok) throw new Error("Failed to fetch tags");
  if (!releasesRes.ok) throw new Error("Failed to fetch releases");

  const tags: GitHubTag[] = await tagsRes.json();
  const releases: GitHubRelease[] = await releasesRes.json();

  const releaseMap = new Map<string, GitHubRelease>();
  for (const r of releases) releaseMap.set(r.tag_name, r);

  // Fetch commit dates for tags (batch the unique SHAs)
  const uniqueShas = [...new Set(tags.map((t) => t.commit.sha))];
  const commitDateMap = new Map<string, string>();

  // Fetch in batches of 10 to avoid rate limiting
  for (let i = 0; i < uniqueShas.length; i += 10) {
    const batch = uniqueShas.slice(i, i + 10);
    const results = await Promise.all(
      batch.map((sha) =>
        fetch(`https://api.github.com/repos/${REPO}/commits/${sha}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );
    for (const commit of results) {
      if (commit) {
        const c = commit as GitHubCommit;
        commitDateMap.set(c.sha, c.commit.committer?.date ?? "");
      }
    }
  }

  const entries: VersionEntry[] = tags.map((t) => {
    const release = releaseMap.get(t.name);
    const date = release?.published_at ?? commitDateMap.get(t.commit.sha) ?? "";
    return { tag: t.name, date, release };
  });

  // Sort by date descending (most recent first)
  entries.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return entries;
}

/* ── Page component ───────────────────────────────────────── */

export function ChangelogPage() {
  const [entries, setEntries] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchAllVersions()
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const firstReleaseIdx = entries.findIndex((e) => e.release);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 pt-5 pb-1">
        <h1 className="text-sm font-medium text-white/80">What&apos;s New</h1>
        <p className="mt-1 text-[11px] text-white/25">
          All versions and releases of Codex.
        </p>
      </div>

      <div className="flex max-w-[600px] flex-col gap-0 p-6">
        {loading && <Skeleton />}

        {error && (
          <div className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="mb-3 h-4 w-4 text-white/20" />
            <p className="text-[13px] text-white/30">
              Couldn&apos;t load versions
            </p>
            <p className="mt-1 text-[11px] text-white/15">
              Check your connection and try again.
            </p>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <p className="py-16 text-center text-[13px] text-white/30">
            No versions yet
          </p>
        )}

        {!loading &&
          !error &&
          entries.map((entry, idx) =>
            entry.release ? (
              <div key={entry.tag} className="pb-4">
                <ReleaseCard
                  release={entry.release}
                  date={formatDate(entry.date)}
                  isLatest={idx === firstReleaseIdx}
                />
              </div>
            ) : (
              <VersionRow
                key={entry.tag}
                tag={entry.tag}
                date={formatDate(entry.date)}
                isLast={idx === entries.length - 1}
              />
            )
          )}
      </div>
    </div>
  );
}
