"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { ThemeClasses, ReadingTheme } from "../lib/types";

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
  initialPage?: number | null;
  onInitialPageConsumed?: () => void;
  onPageChange: (current: number, total: number) => void;
}

/*
 * Paginated two-column text renderer.
 *
 * Layout:
 *   outerRef   — full-height container with padding, overflow:hidden
 *   ├─ viewport — full-width wrapper (animates translateX for page turns)
 *   │  └─ clipper — overflow:hidden, exactly pageWidth × contentHeight, mx-auto
 *   │     └─ slider — position:absolute, column-width layout, instant translateX
 *   └─ (inline styles)
 *
 * Page turn: viewport slides left/right across the full window width,
 * while the slider jumps to the new page instantly.
 */

// Selection highlight colors per reading theme
const SELECTION_COLORS: Record<string, { bg: string; fg: string }> = {
  dark: { bg: "oklch(0.60 0.20 264 / 45%)", fg: "white" },
  light: { bg: "oklch(0.60 0.20 264 / 35%)", fg: "black" },
  sepia: { bg: "oklch(0.60 0.14 55 / 40%)", fg: "#3d2b1f" },
};

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
  initialPage,
  onInitialPageConsumed,
  onPageChange,
}: TextContentProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const columnGap = 48;
  const colWidth = Math.max(1, Math.floor((pageWidth - columnGap) / 2));
  const stride = pageWidth + columnGap;

  // ── Layout measurement ──────────────────────────────

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const slider = sliderRef.current;
    if (!outer || !slider) return;

    const innerW = outer.clientWidth - padding * 2;
    const innerH = outer.clientHeight - padding * 2;
    const pw = Math.min(innerW, maxTextWidth);

    setPageWidth(pw);
    setContentHeight(innerH);

    requestAnimationFrame(() => {
      if (!slider) return;
      const scrollW = slider.scrollWidth;
      const s = pw + columnGap;
      const pages = Math.max(1, Math.ceil(scrollW / s));
      setTotalPages(pages);
      setCurrentPage((prev) => Math.min(prev, pages - 1));
    });
  }, [padding, maxTextWidth, columnGap]);

  useEffect(() => {
    measure();
  }, [measure, htmlParagraphs, fontFamily, fontSize, lineHeight, paraSpacing]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    onPageChange(currentPage, totalPages);
  }, [currentPage, totalPages, onPageChange]);

  // Reset to page 0 on chapter change
  useEffect(() => {
    setCurrentPage(0);
  }, [htmlParagraphs]);

  // Restore initial page from saved reading position
  useEffect(() => {
    if (initialPage != null && initialPage > 0 && totalPages > 1) {
      const target = Math.min(initialPage, totalPages - 1);
      setCurrentPage(target);
      onInitialPageConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage, totalPages]);

  // ── Navigation ──────────────────────────────────────

  const animatingRef = useRef(false);

  const goTo = useCallback(
    (page: number) => {
      const clamped = Math.max(0, Math.min(page, totalPages - 1));
      setCurrentPage((prev) => {
        if (clamped === prev) return prev;

        const viewport = viewportRef.current;
        if (animated && viewport && !animatingRef.current) {
          animatingRef.current = true;
          const dir = clamped > prev ? 1 : -1;
          const outerW = outerRef.current?.clientWidth ?? 800;
          const offset = outerW * 0.4;

          // Instantly kick viewport in opposite direction
          viewport.style.transition = "none";
          viewport.style.transform = `translateX(${dir * offset}px)`;

          // Force reflow then animate back to center
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          viewport.offsetHeight;
          viewport.style.transition = "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)";
          viewport.style.transform = "translateX(0)";

          const onEnd = () => {
            viewport.removeEventListener("transitionend", onEnd);
            viewport.style.transition = "none";
            viewport.style.transform = "";
            animatingRef.current = false;
          };
          viewport.addEventListener("transitionend", onEnd, { once: true });
          setTimeout(onEnd, 400);
        }

        return clamped;
      });
    },
    [totalPages, animated],
  );

  // Removed: click-to-navigate regions. Page turns are keyboard/scroll/arrow-button only.

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
      scrollAccum.current += e.deltaY;
      const threshold = 80;

      if (scrollAccum.current > threshold) {
        goTo(currentPage + 1);
        scrollAccum.current = 0;
      } else if (scrollAccum.current < -threshold) {
        goTo(currentPage - 1);
        scrollAccum.current = 0;
      }

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

  const translateX = currentPage * stride;

  const readingTheme: ReadingTheme = theme.bgRaw === "#f4ecd8"
    ? "sepia"
    : theme.bgRaw === "#fafafa"
      ? "light"
      : "dark";
  const sel = SELECTION_COLORS[readingTheme] ?? SELECTION_COLORS.dark;

  return (
    <div
      ref={outerRef}
      className="reader-content h-full select-text"
      style={{
        padding: `${padding}px`,
        overflow: "hidden",
      }}
    >
      {/* Viewport: full-width wrapper that animates for page turns */}
      <div ref={viewportRef} style={{ width: "100%", height: "100%" }}>
        {/* Clipper: shows exactly one page (2 columns) */}
        <div
          className="mx-auto"
          style={{
            width: `${pageWidth}px`,
            height: `${contentHeight}px`,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Slider: absolutely positioned, no width — browser auto-sizes for all columns */}
          <div
            ref={sliderRef}
            className={theme.text}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: `${contentHeight}px`,
              columnWidth: `${colWidth}px`,
              columnGap: `${columnGap}px`,
              columnFill: "auto" as const,
              fontFamily,
              fontSize: `${fontSize}px`,
              lineHeight,
              transform: `translateX(-${translateX}px)`,
            }}
          >
            {titleJSX}
            {paragraphsJSX}
          </div>
        </div>
      </div>

      <style>{`
        .reader-image img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }
        .reader-content ::selection {
          background-color: ${sel.bg};
          color: ${sel.fg};
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
