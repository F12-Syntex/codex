"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { ThemeClasses } from "../lib/types";

interface TextContentProps {
  chapterTitle: string;
  htmlParagraphs: string[];
  theme: ThemeClasses;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paraSpacing: number;
  padding: number;
  maxTextWidth: number;
  animated: boolean;
  onPageChange: (current: number, total: number) => void;
}

export function TextContent({
  chapterTitle,
  htmlParagraphs,
  theme,
  fontFamily,
  fontSize,
  lineHeight,
  paraSpacing,
  padding,
  maxTextWidth,
  animated,
  onPageChange,
}: TextContentProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure pages whenever content or settings change
  const measure = useCallback(() => {
    const outer = outerRef.current;
    const cols = columnsRef.current;
    if (!outer || !cols) return;

    const w = outer.clientWidth;
    setContainerWidth(w);

    // Total scrollable width / visible width = total pages
    // Need a frame for the browser to lay out columns
    requestAnimationFrame(() => {
      const scrollW = cols.scrollWidth;
      const pages = Math.max(1, Math.ceil(scrollW / w));
      setTotalPages(pages);
      // Clamp current page
      setCurrentPage((prev) => Math.min(prev, pages - 1));
    });
  }, []);

  // Re-measure on mount, content change, and settings change
  useEffect(() => {
    measure();
  }, [measure, htmlParagraphs, fontFamily, fontSize, lineHeight, paraSpacing, padding, maxTextWidth]);

  // Re-measure on resize
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    return () => ro.disconnect();
  }, [measure]);

  // Report page changes
  useEffect(() => {
    onPageChange(currentPage, totalPages);
  }, [currentPage, totalPages, onPageChange]);

  // Reset page on content change
  useEffect(() => {
    setCurrentPage(0);
  }, [htmlParagraphs]);

  const goTo = useCallback((page: number) => {
    setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
  }, [totalPages]);

  // Click zones: left 30% = prev, right 30% = next
  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    if (ratio < 0.3) goTo(currentPage - 1);
    else if (ratio > 0.7) goTo(currentPage + 1);
  }, [currentPage, goTo]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goTo(currentPage + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goTo(currentPage - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, goTo]);

  // Filter out first paragraph if it duplicates the chapter title
  const filteredHtml = filterTitleParagraph(htmlParagraphs, chapterTitle);
  const showTitle = chapterTitle && !/^chapter\s+\d+$/i.test(chapterTitle.trim());

  const columnGap = 48;
  const translateX = currentPage * containerWidth;

  return (
    <div
      ref={outerRef}
      className="h-full overflow-hidden cursor-default"
      onClick={handleClick}
      style={{ padding: `${padding}px` }}
    >
      <div
        ref={columnsRef}
        className={theme.text}
        style={{
          columnWidth: "320px",
          columnCount: 2,
          columnGap: `${columnGap}px`,
          columnFill: "auto",
          height: "100%",
          fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight,
          transform: `translateX(-${translateX}px)`,
          transition: animated ? "transform 0.3s ease" : "none",
        }}
      >
        {/* Chapter title */}
        {showTitle && (
          <div
            style={{
              columnSpan: "all" as const,
              textAlign: "center",
              marginBottom: `${paraSpacing * 2}px`,
              paddingBottom: `${paraSpacing}px`,
            }}
          >
            <h2
              className={theme.text}
              style={{
                fontSize: `${fontSize * 1.3}px`,
                fontWeight: 600,
                fontFamily,
                lineHeight: 1.3,
              }}
            >
              {chapterTitle}
            </h2>
          </div>
        )}

        {/* Paragraphs */}
        {filteredHtml.map((html, i) => {
          const isEmpty = html === "<p></p>" || html.trim() === "";
          if (isEmpty) {
            return <div key={i} style={{ height: `${paraSpacing}px` }} />;
          }

          const isFirst = i === 0 || (i === 1 && filteredHtml[0]?.trim() === "");

          return (
            <div
              key={i}
              className={isFirst ? "drop-cap-paragraph" : ""}
              style={{ marginBottom: `${paraSpacing}px` }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        })}
      </div>

      {/* Drop cap styles */}
      <style>{`
        .drop-cap-paragraph > p::first-letter,
        .drop-cap-paragraph::first-letter {
          font-size: ${fontSize * 3.2}px;
          float: left;
          line-height: 0.8;
          padding-right: 8px;
          padding-top: 4px;
          font-weight: 600;
          font-family: ${fontFamily};
        }
      `}</style>
    </div>
  );
}

/**
 * Remove the first paragraph if it's just a repeat of the chapter title.
 */
function filterTitleParagraph(html: string[], title: string): string[] {
  if (!html.length || !title) return html;
  const first = stripTags(html[0]).trim();
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();

  const normFirst = norm(first);
  const normTitle = norm(title);

  if (!normFirst) return html;

  // Exact match or one contains the other
  if (normFirst === normTitle || normTitle.includes(normFirst) || normFirst.includes(normTitle)) {
    return html.slice(1);
  }

  // Strip "Chapter N:" prefix and compare
  const stripped = (s: string) =>
    s.replace(/^(chapter|part)\s+(\d+|[ivxlcdm]+)\s*[:\-–—]?\s*/i, "").trim();
  if (stripped(normFirst) === stripped(normTitle)) {
    return html.slice(1);
  }

  return html;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, " ").trim();
}
