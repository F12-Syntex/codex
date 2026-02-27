"use client";

import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

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

function renderReleaseBody(body: string, isHero: boolean) {
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

function HeroSkeleton() {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-4 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-12 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="ml-auto h-3 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="h-3 w-4/5 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="h-3 w-3/5 animate-pulse rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex gap-4 pl-1">
      <div className="flex flex-col items-center">
        <div className="h-1.5 w-1.5 rounded-full bg-white/[0.1]" />
        <div className="w-px flex-1 bg-white/[0.06]" />
      </div>
      <div className="flex-1 pb-6">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3.5 w-16 animate-pulse rounded-lg bg-white/[0.06]" />
          <div className="h-3 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-4/5 animate-pulse rounded-lg bg-white/[0.06]" />
          <div className="h-3 w-3/5 animate-pulse rounded-lg bg-white/[0.06]" />
        </div>
      </div>
    </div>
  );
}

export function ChangelogPage() {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(
      "https://api.github.com/repos/F12-Syntex/codex/releases?per_page=20"
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        setReleases(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const latest = releases[0];
  const older = releases.slice(1);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Page header */}
      <div className="px-6 pt-5 pb-1">
        <h1 className="text-sm font-medium text-white/80">What&apos;s New</h1>
        <p className="mt-1 text-[11px] text-white/25">
          Latest updates and improvements to Codex.
        </p>
      </div>

      <div className="flex flex-col gap-0 p-6">
        {/* Loading state */}
        {loading && (
          <div className="flex flex-col gap-6">
            <HeroSkeleton />
            <TimelineSkeleton />
            <TimelineSkeleton />
            <TimelineSkeleton />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="mb-3 h-4 w-4 text-white/20" />
            <p className="text-[13px] text-white/30">
              Couldn&apos;t load releases
            </p>
            <p className="mt-1 text-[11px] text-white/15">
              Check your connection and try again.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && releases.length === 0 && (
          <p className="py-16 text-center text-[13px] text-white/30">
            No releases yet
          </p>
        )}

        {/* Hero card — latest release */}
        {!loading && !error && latest && (
          <div className="mb-6 rounded-lg border border-white/[0.06] bg-white/[0.03]">
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[13px] font-medium text-white/80">
                  {latest.tag_name}
                </span>
                <span className="rounded-lg bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/40">
                  Latest
                </span>
                <span className="ml-auto text-[11px] text-white/25">
                  {formatDate(latest.published_at)}
                </span>
              </div>

              {latest.name && latest.name !== latest.tag_name && (
                <p className="mb-2 text-[13px] font-medium text-white/60">
                  {latest.name}
                </p>
              )}

              {latest.body && (
                <div>{renderReleaseBody(latest.body, true)}</div>
              )}
            </div>
          </div>
        )}

        {/* Timeline — older releases */}
        {!loading && !error && older.length > 0 && (
          <div className="flex flex-col">
            {older.map((release, idx) => (
              <div key={release.id} className="flex gap-4 pl-1">
                {/* Timeline rail */}
                <div className="flex flex-col items-center">
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/[0.15]" />
                  {idx < older.length - 1 && (
                    <div className="w-px flex-1 bg-white/[0.06]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-6">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[13px] font-medium text-white/70">
                      {release.tag_name}
                    </span>
                    <span className="text-[11px] text-white/20">
                      {formatDate(release.published_at)}
                    </span>
                  </div>

                  {release.name && release.name !== release.tag_name && (
                    <p className="mb-1 text-[12px] text-white/40">
                      {release.name}
                    </p>
                  )}

                  {release.body && (
                    <div>{renderReleaseBody(release.body, false)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
