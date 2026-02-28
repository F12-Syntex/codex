"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
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
  const contentRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const columnGap = 48;

  // ── Layout measurement ──────────────────────────────
  // The content div has overflow:hidden, fixed width/height, and CSS columns.
  // scrollWidth reveals the full horizontal extent of all columns.
  // We paginate by setting scrollLeft programmatically.

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const content = contentRef.current;
    if (!outer || !content) return;

    const innerW = outer.clientWidth - padding * 2;
    const innerH = outer.clientHeight - padding * 2;
    const pw = Math.min(innerW, maxTextWidth);

    setPageWidth(pw);
    setContentHeight(innerH);

    // Apply dimensions directly so the browser lays out columns immediately
    content.style.width = `${pw}px`;
    content.style.height = `${innerH}px`;

    // Wait one frame for the browser to complete column layout
    requestAnimationFrame(() => {
      if (!content) return;
      const scrollW = content.scrollWidth;
      const pages = Math.max(1, Math.ceil(scrollW / Math.max(pw, 1)));
      setTotalPages(pages);
      setCurrentPage((prev) => Math.min(prev, pages - 1));
    });
  }, [padding, maxTextWidth]);

  // Re-measure when content or typography settings change
  useEffect(() => {
    measure();
  }, [measure, htmlParagraphs, fontFamily, fontSize, lineHeight, paraSpacing]);

  // Re-measure on container resize
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    return () => ro.disconnect();
  }, [measure]);

  // ── Pagination via scrollLeft ───────────────────────
  useEffect(() => {
    const content = contentRef.current;
    if (!content || pageWidth === 0) return;

    const target = currentPage * pageWidth;
    if (animated) {
      content.scrollTo({ left: target, behavior: "smooth" });
    } else {
      content.scrollLeft = target;
    }
  }, [currentPage, pageWidth, animated]);

  // Report page changes to parent
  useEffect(() => {
    onPageChange(currentPage, totalPages);
  }, [currentPage, totalPages, onPageChange]);

  // Reset to page 0 when chapter content changes
  useEffect(() => {
    setCurrentPage(0);
    const content = contentRef.current;
    if (content) content.scrollLeft = 0;
  }, [htmlParagraphs]);

  // ── Navigation ──────────────────────────────────────
  const goTo = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
    },
    [totalPages],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = outerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = (e.clientX - rect.left) / rect.width;
      if (ratio < 0.3) goTo(currentPage - 1);
      else if (ratio > 0.7) goTo(currentPage + 1);
    },
    [currentPage, goTo],
  );

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

  // Scroll wheel / trackpad navigation
  const scrollAccum = useRef(0);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();

      // Accumulate scroll delta (handles both mouse wheel and trackpad)
      scrollAccum.current += e.deltaY;
      const threshold = 80;

      if (scrollAccum.current > threshold) {
        goTo(currentPage + 1);
        scrollAccum.current = 0;
      } else if (scrollAccum.current < -threshold) {
        goTo(currentPage - 1);
        scrollAccum.current = 0;
      }

      // Reset accumulator after inactivity
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        scrollAccum.current = 0;
      }, 200);
    };

    outer.addEventListener("wheel", handler, { passive: false });
    return () => {
      outer.removeEventListener("wheel", handler);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, [currentPage, goTo]);

  // ── Content processing ──────────────────────────────
  const filteredHtml = useMemo(
    () => filterTitleParagraph(htmlParagraphs, chapterTitle),
    [htmlParagraphs, chapterTitle],
  );
  const showTitle =
    chapterTitle && !/^chapter\s+\d+$/i.test(chapterTitle.trim());

  // We no longer compute colWidth — column-count: 2 lets the browser
  // size columns automatically within the available pageWidth.

  // Find index of first real text paragraph
  const firstTextIndex = useMemo(() => {
    for (let i = 0; i < filteredHtml.length; i++) {
      const h = filteredHtml[i];
      if (h === "<p></p>" || h.trim() === "") continue;
      if (h.includes("<img ") && !h.includes("<p")) continue;
      if (/<h[1-6][^>]*>/i.test(h)) continue;
      const text = stripTags(h).trim();
      if (
        text.length < 80 &&
        /^(chapter|part|story|book|prologue|epilogue|volume)\s/i.test(text)
      )
        continue;
      return i;
    }
    return -1;
  }, [filteredHtml]);

  const buildFirstParagraph = (html: string) => {
    const text = stripTags(html);
    if (!text || text.length === 0) return html;
    const bigSize = Math.round(fontSize * 1.8);
    return html.replace(
      /(<p[^>]*>(?:\s*<[^/][^>]*>)*)([A-Za-z\u00C0-\u024F])/,
      `$1<span style="font-size:${bigSize}px;font-weight:600;line-height:1">${"$2"}</span>`,
    );
  };

  const paragraphsJSX = filteredHtml.map((html, i) => {
    const isEmpty = html === "<p></p>" || html.trim() === "";
    if (isEmpty) return <div key={i} style={{ height: `${paraSpacing}px` }} />;

    const isImage = html.includes("<img ") && !html.includes("<p");
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

    const isFirst = i === firstTextIndex;
    const renderedHtml = isFirst ? buildFirstParagraph(html) : html;

    return (
      <div
        key={i}
        style={{
          marginBottom: `${paraSpacing}px`,
          textIndent: !isFirst && i > 0 ? `${fontSize * 1.5}px` : undefined,
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    );
  });

  // Parse chapter title into parts
  const titleParts = useMemo(() => {
    if (!chapterTitle) return null;
    const match = chapterTitle.match(
      /^((?:Chapter|Part|Story|Volume|Book)\s+\d+\s*[:\-–—.]\s*)([\s\S]+)$/i,
    );
    if (match) return { prefix: match[1].trim(), subtitle: match[2].trim() };
    const match2 = chapterTitle.match(
      /^((?:Chapter|Part|Story|Volume|Book)\s+\d+)\s*$/i,
    );
    if (match2) return { prefix: match2[1].trim(), subtitle: "" };
    return null;
  }, [chapterTitle]);

  const titleJSX = showTitle ? (
    <div
      style={{
        columnSpan: "all" as const,
        textAlign: "center",
        marginBottom: `${paraSpacing * 2}px`,
        paddingTop: `${Math.round(paraSpacing * 1.5)}px`,
        paddingBottom: `${paraSpacing}px`,
      }}
    >
      {titleParts ? (
        <>
          <div
            className={theme.muted}
            style={{
              fontSize: `${fontSize}px`,
              fontWeight: 500,
              fontFamily,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: `${Math.round(paraSpacing * 0.5)}px`,
            }}
          >
            {titleParts.prefix.replace(/[:\-–—.]\s*$/, "")}
          </div>
          {titleParts.subtitle && (
            <h2
              className={theme.text}
              style={{
                fontSize: `${Math.round(fontSize * 1.5)}px`,
                fontWeight: 600,
                fontFamily,
                lineHeight: 1.25,
                letterSpacing: "-0.01em",
              }}
            >
              {titleParts.subtitle}
            </h2>
          )}
        </>
      ) : (
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
      )}
      <div
        style={{
          width: "40px",
          height: "2px",
          backgroundColor: "var(--accent-brand)",
          opacity: 0.4,
          margin: `${paraSpacing}px auto 0`,
          borderRadius: "1px",
        }}
      />
    </div>
  ) : null;

  // ── Render ──────────────────────────────────────────
  return (
    <div
      ref={outerRef}
      className="h-full cursor-default select-text"
      onClick={handleClick}
      style={{ padding: `${padding}px` }}
    >
      <div
        ref={contentRef}
        className={`mx-auto ${theme.text}`}
        style={{
          width: `${pageWidth}px`,
          height: `${contentHeight}px`,
          overflow: "hidden",
          columnCount: 2,
          columnGap: `${columnGap}px`,
          columnFill: "auto" as const,
          fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight,
        }}
      >
        {titleJSX}
        {paragraphsJSX}
      </div>

      <style>{`
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

  if (
    normFirst === normTitle ||
    normTitle.includes(normFirst) ||
    normFirst.includes(normTitle)
  ) {
    return html.slice(1);
  }

  const stripped = (s: string) =>
    s
      .replace(
        /^(chapter|part|story)\s+(\d+|[ivxlcdm]+)\s*[:\-–—]?\s*/i,
        "",
      )
      .trim();
  if (stripped(normFirst) === stripped(normTitle)) return html.slice(1);

  return html;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, " ").trim();
}
