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
  const measureRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);

  const columnGap = 48;

  // Measure total pages from an off-screen clone
  const measure = useCallback(() => {
    const outer = outerRef.current;
    const measurer = measureRef.current;
    if (!outer || !measurer) return;

    // The visible page width is the inner width after padding
    const innerW = outer.clientWidth - padding * 2;
    const pw = Math.min(innerW, maxTextWidth);
    setPageWidth(pw);

    // The measurer div has the same column settings and fixed height
    // Its scrollWidth tells us total horizontal extent
    const innerH = outer.clientHeight - padding * 2;
    measurer.style.width = `${pw}px`;
    measurer.style.height = `${innerH}px`;

    requestAnimationFrame(() => {
      const scrollW = measurer.scrollWidth;
      const pages = Math.max(1, Math.round(scrollW / pw));
      setTotalPages(pages);
      setCurrentPage((prev) => Math.min(prev, pages - 1));
    });
  }, [padding, maxTextWidth]);

  // Re-measure on content/settings change
  useEffect(() => {
    measure();
  }, [measure, htmlParagraphs, fontFamily, fontSize, lineHeight, paraSpacing]);

  // Re-measure on resize
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    return () => ro.disconnect();
  }, [measure]);

  // Report page changes upward
  useEffect(() => {
    onPageChange(currentPage, totalPages);
  }, [currentPage, totalPages, onPageChange]);

  // Reset page on chapter change
  useEffect(() => {
    setCurrentPage(0);
  }, [htmlParagraphs]);

  const goTo = useCallback((page: number) => {
    setCurrentPage((prev) => {
      const next = Math.max(0, Math.min(page, totalPages - 1));
      return next;
    });
  }, [totalPages]);

  // Click zones: left 30% prev, right 30% next
  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
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

  const filteredHtml = filterTitleParagraph(htmlParagraphs, chapterTitle);
  const showTitle = chapterTitle && !/^chapter\s+\d+$/i.test(chapterTitle.trim());
  const translateX = currentPage * pageWidth;

  // Shared column styles for both visible and measurement divs
  const columnStyles: React.CSSProperties = {
    columnCount: 2,
    columnGap: `${columnGap}px`,
    columnFill: "auto",
    fontFamily,
    fontSize: `${fontSize}px`,
    lineHeight,
  };

  const contentJSX = (
    <>
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
    </>
  );

  return (
    <div
      ref={outerRef}
      className="h-full cursor-default select-text"
      onClick={handleClick}
      style={{ padding: `${padding}px` }}
    >
      {/* Visible columns — clipped to exactly one page */}
      <div
        className="mx-auto overflow-hidden"
        style={{
          width: `${pageWidth}px`,
          height: "100%",
          maxWidth: "100%",
        }}
      >
        <div
          className={theme.text}
          style={{
            ...columnStyles,
            height: "100%",
            width: `${pageWidth}px`,
            transform: `translateX(-${translateX}px)`,
            transition: animated ? "transform 0.3s ease" : "none",
          }}
        >
          {contentJSX}
        </div>
      </div>

      {/* Off-screen measurer — same settings, used to calculate total pages */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          ...columnStyles,
          position: "absolute",
          left: "-99999px",
          top: 0,
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        {contentJSX}
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

function filterTitleParagraph(html: string[], title: string): string[] {
  if (!html.length || !title) return html;
  const first = stripTags(html[0]).trim();
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();

  const normFirst = norm(first);
  const normTitle = norm(title);
  if (!normFirst) return html;

  if (normFirst === normTitle || normTitle.includes(normFirst) || normFirst.includes(normTitle)) {
    return html.slice(1);
  }

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
