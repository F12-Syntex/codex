"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

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
      return <strong key={i} className="font-medium text-white/70">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderReleaseBody(body: string) {
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
        <p key={i} className="mt-2 mb-1 text-[12px] font-medium text-white/70">
          {text}
        </p>
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const text = line.replace(/^\s*[-*]\s+/, "");
      elements.push(
        <div key={i} className="flex gap-1.5 py-0.5">
          <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-white/20" />
          <span className="text-[12px] text-white/50">{applyBold(text)}</span>
        </div>
      );
      continue;
    }

    elements.push(
      <p key={i} className="text-[12px] text-white/50">{applyBold(line)}</p>
    );
  }

  return elements;
}

export function ChangelogPage() {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("https://api.github.com/repos/F12-Syntex/codex/releases?per_page=20")
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

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-white/[0.04] px-6 py-4">
        <h1 className="text-sm font-medium text-white/80">What's New</h1>
      </div>

      <div className="flex flex-col gap-3 p-6">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-4 w-4 animate-spin text-white/30" />
          </div>
        )}

        {error && (
          <p className="py-12 text-center text-[13px] text-white/30">
            Couldn't load releases
          </p>
        )}

        {!loading && !error && releases.length === 0 && (
          <p className="py-12 text-center text-[13px] text-white/30">
            No releases yet
          </p>
        )}

        {!loading &&
          !error &&
          releases.map((release, idx) => (
            <div
              key={release.id}
              className="rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[13px] font-medium text-white/80">
                  {release.tag_name}
                </span>
                {idx === 0 && (
                  <span className="rounded-lg bg-[var(--accent-brand-dim)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-brand)]">
                    Latest
                  </span>
                )}
                <span className="ml-auto text-[11px] text-white/25">
                  {formatDate(release.published_at)}
                </span>
              </div>

              {release.name && release.name !== release.tag_name && (
                <p className="mb-1.5 text-[13px] font-medium text-white/60">
                  {release.name}
                </p>
              )}

              {release.body && (
                <div className="mb-2">{renderReleaseBody(release.body)}</div>
              )}

              <button
                onClick={() => window.open(release.html_url, "_blank")}
                className="flex items-center gap-1 text-[11px] text-white/25 transition-colors hover:text-white/50"
              >
                View on GitHub
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
