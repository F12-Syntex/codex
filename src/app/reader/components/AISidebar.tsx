"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, Type, MessageCircle, Paintbrush, Languages, BookOpen } from "lucide-react";
import type { ThemeClasses } from "../lib/types";

interface AISidebarProps {
  theme: ThemeClasses;
  chapterCount: number;
  onClose: () => void;
}

interface AIToggleState {
  enrichChapters: boolean;
  aiBuddy: boolean;
  immersiveFormatting: boolean;
  autoTranslate: boolean;
  smartSummary: boolean;
}

export function AISidebar({
  theme,
  chapterCount,
  onClose,
}: AISidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [toggles, setToggles] = useState<AIToggleState>({
    enrichChapters: false,
    aiBuddy: false,
    immersiveFormatting: false,
    autoTranslate: false,
    smartSummary: false,
  });

  const setToggle = (key: keyof AIToggleState) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sidebarRef.current && !sidebarRef.current.contains(target)) {
        const header = document.querySelector("[data-reader-header]");
        if (header?.contains(target)) return;
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${value ? "bg-[var(--accent-brand)]" : theme.subtle}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : ""}`}
      />
    </button>
  );

  return (
    <div
      ref={sidebarRef}
      className={`absolute right-0 top-0 z-20 flex h-full w-[340px] flex-col ${theme.panel} border-l ${theme.border} shadow-lg shadow-black/30`}
      style={{ animation: "slideInRight 0.2s ease" }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between border-b px-3 py-2 ${theme.border}`}>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          </div>
          <span className={`text-[13px] font-medium ${theme.text}`}>AI Tools</span>
        </div>
        <button
          onClick={onClose}
          className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Settings list */}
      <div className="flex-1 overflow-y-auto">
        {/* Section: Content */}
        <div className={`px-3 pb-1 pt-3`}>
          <span className={`text-[11px] font-medium uppercase tracking-wider ${theme.muted}`}>Content</span>
        </div>

        <div className="space-y-0.5 px-1.5">
          {/* Enrich Chapters */}
          <SettingRow
            icon={<Type className={`h-3.5 w-3.5 ${toggles.enrichChapters ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="Enrich Chapters"
            description="Add descriptive subtitles to generic chapter names"
            theme={theme}
            active={toggles.enrichChapters}
            toggle={<Toggle value={toggles.enrichChapters} onChange={() => setToggle("enrichChapters")} />}
          />

          {/* Smart Summary */}
          <SettingRow
            icon={<BookOpen className={`h-3.5 w-3.5 ${toggles.smartSummary ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="Smart Summary"
            description="Generate a recap of previous chapters when you resume reading"
            theme={theme}
            active={toggles.smartSummary}
            toggle={<Toggle value={toggles.smartSummary} onChange={() => setToggle("smartSummary")} />}
          />
        </div>

        <div className={`mx-3 my-2 h-px ${theme.subtle}`} />

        {/* Section: Experience */}
        <div className={`px-3 pb-1`}>
          <span className={`text-[11px] font-medium uppercase tracking-wider ${theme.muted}`}>Experience</span>
        </div>

        <div className="space-y-0.5 px-1.5">
          {/* AI Buddy */}
          <SettingRow
            icon={<MessageCircle className={`h-3.5 w-3.5 ${toggles.aiBuddy ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="AI Buddy"
            description="Chat about the book, ask questions, discuss characters"
            theme={theme}
            active={toggles.aiBuddy}
            toggle={<Toggle value={toggles.aiBuddy} onChange={() => setToggle("aiBuddy")} />}
          />

          {/* Immersive Formatting */}
          <SettingRow
            icon={<Paintbrush className={`h-3.5 w-3.5 ${toggles.immersiveFormatting ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="Immersive Formatting"
            description="Enhance typography and layout for a more polished reading feel"
            theme={theme}
            active={toggles.immersiveFormatting}
            toggle={<Toggle value={toggles.immersiveFormatting} onChange={() => setToggle("immersiveFormatting")} />}
          />

          {/* Auto Translate */}
          <SettingRow
            icon={<Languages className={`h-3.5 w-3.5 ${toggles.autoTranslate ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="Auto Translate"
            description="Translate foreign text passages inline as you read"
            theme={theme}
            active={toggles.autoTranslate}
            toggle={<Toggle value={toggles.autoTranslate} onChange={() => setToggle("autoTranslate")} />}
          />
        </div>

        <div className={`mx-3 my-2 h-px ${theme.subtle}`} />

        {/* Info */}
        <div className="px-3 pb-3">
          <div className={`rounded-lg px-3 py-2.5 ${theme.subtle}`}>
            <p className={`text-[11px] leading-relaxed ${theme.muted}`}>
              AI features require an OpenRouter API key. Configure it in the main app settings.
            </p>
          </div>
          <div className={`mt-2 flex items-center gap-1.5 px-1 text-[11px] ${theme.muted}`}>
            <Sparkles className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            <span>{chapterCount} chapters in this book</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Setting Row ──────────────────────────────────── */

function SettingRow({
  icon,
  label,
  description,
  theme,
  active,
  toggle,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  theme: ThemeClasses;
  active: boolean;
  toggle: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${active ? "bg-[var(--accent-brand)]/5" : ""}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-medium ${theme.text}`}>{label}</div>
        <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>{description}</div>
      </div>
      {toggle}
    </div>
  );
}
