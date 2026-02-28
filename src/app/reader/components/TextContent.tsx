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
  const measureRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const columnGap = 48;

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const measurer = measureRef.current;
    if (!outer || !measurer) return;

    const innerW = outer.clientWidth - padding * 2;
    const innerH = outer.clientHeight - padding * 2;
    const pw = Math.min(innerW, maxTextWidth);
    setPageWidth(pw);
    setContentHeight(innerH);

    // Set measurer to same dimensions — its scrollWidth gives us total column extent
    measurer.style.width = `${pw}px`;
    measurer.style.height = `${innerH}px`;

    requestAnimationFrame(() => {
      if (!measurer) return;
      const scrollW = measurer.scrollWidth;
      // Each "page" is exactly pw wide (2 columns + gap within pw)
      const pages = Math.max(1, Math.round(scrollW / pw));
      setTotalPages(pages);
      setCurrentPage((prev) => Math.min(prev, pages - 1));
    });
  }, [padding, maxTextWidth]);

  useEffect(() => { measure(); }, [measure, htmlParagraphs, fontFamily, fontSize, lineHeight, paraSpacing]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => { onPageChange(currentPage, totalPages); }, [currentPage, totalPages, onPageChange]);
  useEffect(() => { setCurrentPage(0); }, [htmlParagraphs]);

  const goTo = useCallback((page: number) => {
    setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
  }, [totalPages]);

  // Click zones
  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    if (ratio < 0.3) goTo(currentPage - 1);
    else if (ratio > 0.7) goTo(currentPage + 1);
  }, [currentPage, goTo]);

  // Keyboard: arrows + page up/down
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goTo(currentPage + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goTo(currentPage - 1); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, goTo]);

  const filteredHtml = filterTitleParagraph(htmlParagraphs, chapterTitle);
  const showTitle = chapterTitle && !/^chapter\s+\d+$/i.test(chapterTitle.trim());

  // Column width: each column is (pageWidth - gap) / 2
  const colWidth = Math.floor((pageWidth - columnGap) / 2);
  const translateX = currentPage * pageWidth;

  const columnStyles: React.CSSProperties = {
    columnWidth: `${colWidth}px`,
    columnGap: `${columnGap}px`,
    columnFill: "auto" as const,
    fontFamily,
    fontSize: `${fontSize}px`,
    lineHeight,
  };

  const paragraphsJSX = filteredHtml.map((html, i) => {
    const isEmpty = html === "<p></p>" || html.trim() === "";
    if (isEmpty) return <div key={i} style={{ height: `${paraSpacing}px` }} />;

    const isImage = html.includes("<img ") && !html.includes("<p");
    // First non-empty, non-image, non-heading paragraph gets drop cap
    const isFirstContent = !isImage && (i === 0 || (i === 1 && (filteredHtml[0]?.trim() === "" || filteredHtml[0] === "<p></p>")));
    const looksLikeHeading = /<h[1-6][^>]*>/i.test(html) || (stripTags(html).length < 80 && /^(chapter|part|story|book|prologue|epilogue|volume)\s/i.test(stripTags(html).trim()));
    const isFirst = isFirstContent && !looksLikeHeading;

    if (isImage) {
      return (
        <div
          key={i}
          className="reader-image"
          style={{ marginBottom: `${paraSpacing}px`, breakInside: "avoid" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    return (
      <div
        key={i}
        className={isFirst ? "drop-cap-paragraph" : ""}
        style={{ marginBottom: `${paraSpacing}px` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });

  const titleJSX = showTitle ? (
    <div
      style={{
        columnSpan: "all" as const,
        textAlign: "center",
        marginBottom: `${paraSpacing * 1.5}px`,
        paddingTop: `${paraSpacing}px`,
      }}
    >
      <h2
        className={theme.text}
        style={{
          fontSize: `${Math.round(fontSize * 1.4)}px`,
          fontWeight: 600,
          fontFamily,
          lineHeight: 1.3,
          letterSpacing: "-0.01em",
        }}
      >
        {chapterTitle}
      </h2>
    </div>
  ) : null;

  return (
    <div
      ref={outerRef}
      className="h-full cursor-default select-text"
      onClick={handleClick}
      style={{ padding: `${padding}px` }}
    >
      {/* Clipper — exactly one page wide, centered, hard clip */}
      <div
        className="mx-auto"
        style={{
          width: `${pageWidth}px`,
          height: `${contentHeight}px`,
          maxWidth: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Columns — no width constraint, extends as far as content needs */}
        <div
          className={theme.text}
          ref={columnsRef}
          style={{
            ...columnStyles,
            height: `${contentHeight}px`,
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translateX(-${translateX}px)`,
            transition: animated ? "transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)" : "none",
          }}
        >
          {titleJSX}
          {paragraphsJSX}
        </div>
      </div>

      {/* Off-screen measurer — identical layout, used for page count */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          ...columnStyles,
          position: "fixed",
          left: "-99999px",
          top: 0,
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        {titleJSX}
        {paragraphsJSX}
      </div>

      <style>{`
        .drop-cap-paragraph > p::first-letter,
        .drop-cap-paragraph::first-letter {
          font-size: ${Math.round(fontSize * 3)}px;
          float: left;
          line-height: 0.78;
          padding-right: 8px;
          padding-top: 5px;
          font-weight: 600;
          font-family: ${fontFamily};
        }
        .reader-image img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
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
  if (stripped(normFirst) === stripped(normTitle)) return html.slice(1);

  return html;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, " ").trim();
}
