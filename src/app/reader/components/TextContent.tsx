"use client";

import type { ThemeClasses } from "../lib/types";

interface TextContentProps {
  paragraphs: string[];
  theme: ThemeClasses;
  chapterTitle: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paraSpacing: number;
  textPadding: number;
  maxTextWidth: number;
  animatedPageTurn: boolean;
  footerHeight: number;
}

export function TextContent({
  paragraphs,
  theme,
  chapterTitle,
  fontFamily,
  fontSize,
  lineHeight,
  paraSpacing,
  textPadding,
  maxTextWidth,
  animatedPageTurn,
  footerHeight,
}: TextContentProps) {
  return (
    <div
      className={`flex-1 ${theme.text}`}
      style={{
        height: `calc(100% - ${footerHeight}px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className={`rounded-lg p-6 ${theme.surface}`} style={{ maxWidth: 480 }}>
        <h2 className="text-[14px] font-semibold mb-4">Current Settings</h2>
        <div className="space-y-2 text-[12px]" style={{ fontFamily: "system-ui" }}>
          <div className="flex justify-between gap-8">
            <span className={theme.muted}>Chapter</span>
            <span className="text-right">{chapterTitle}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className={theme.muted}>Paragraphs</span>
            <span>{paragraphs.length}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className={theme.muted}>Font</span>
            <span style={{ fontFamily }}>{fontFamily.split(",")[0].replace(/'/g, "")}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className={theme.muted}>Font size</span>
            <span>{fontSize}px</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className={theme.muted}>Line height</span>
            <span>{lineHeight}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className={theme.muted}>Para spacing</span>
            <span>{paraSpacing}px</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className={theme.muted}>Text padding</span>
            <span>{textPadding}px</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className={theme.muted}>Max text width</span>
            <span>{maxTextWidth}px</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className={theme.muted}>Animated pages</span>
            <span>{animatedPageTurn ? "Yes" : "No"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
