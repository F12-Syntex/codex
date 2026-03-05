"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { User, Swords, MapPin, Flame, Lightbulb, ExternalLink } from "lucide-react";
import type { ThemeClasses, ReadingTheme, TTSStatus, TTSHighlightMode } from "../lib/types";
import { SelectionToolbar } from "./SelectionToolbar";
import { AI_FORMATTING_STYLES } from "@/lib/ai-formatting-css";
import type { WikiEntryType } from "@/lib/ai-wiki";
import type { SimChoice } from "@/lib/ai-simulate";
import { buildEntityRegex, injectWikiEntities } from "./WikiTooltip";
import { EntityContextMenu } from "./EntityContextMenu";

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
  currentPage: number;
  totalPages: number;
  onMeasure: (totalPages: number) => void;
  onFirstParaChange?: (index: number) => void;
  onPageRequest?: (page: number) => void;
  ttsStatus?: TTSStatus;
  ttsParagraphIndex?: number;
  ttsActiveWordIndex?: number;
  ttsHighWaterMark?: number;
  ttsHighlightMode?: TTSHighlightMode;
  ttsShowReadMark?: boolean;
  onPlayFromParagraph?: (paraIndex: number) => void;
  readingTheme?: ReadingTheme;
  aiFormattingEnabled?: boolean;
  wikiEnabled?: boolean;
  wikiEntityIndex?: Array<{ id: string; name: string; type: WikiEntryType; color: string }>;
  currentChapterIndex?: number;
  filePath?: string;
  bookTitle?: string;
  simulateEnabled?: boolean;
  onSimulateEntity?: (entity: { id: string; name: string; type: WikiEntryType; color: string }, paragraphIndex: number) => void;
  onOpenWikiEntity?: (entryId: string) => void;
  simulateMode?: boolean;
  simulateInputVisible?: boolean;
  simulateGenerating?: boolean;
  onSimulateSubmit?: (text: string) => void;
  branchEntityName?: string;
  simulateChoices?: SimChoice[];
}

/*
 * Paginated two-column text renderer.
 *
 * Layout:
 *   outerRef   — full-height container with padding, overflow:hidden
 *   └─ clipper — overflow:hidden, exactly pageWidth × contentHeight, mx-auto
 *      └─ slider — position:absolute, column-width layout, translateX with CSS transition
 */

// Selection highlight colors per reading theme
const SELECTION_COLORS: Record<string, { bg: string; fg: string }> = {
  dark: { bg: "oklch(0.60 0.20 264 / 45%)", fg: "white" },
  light: { bg: "oklch(0.60 0.20 264 / 35%)", fg: "black" },
  sepia: { bg: "oklch(0.60 0.14 55 / 40%)", fg: "#3d2b1f" },
};

// TTS word highlight colors — more prominent than selection
const TTS_HIGHLIGHT_COLORS: Record<string, { bg: string; fg: string }> = {
  dark: { bg: "oklch(0.65 0.18 264 / 40%)", fg: "white" },
  light: { bg: "oklch(0.55 0.18 264 / 30%)", fg: "black" },
  sepia: { bg: "oklch(0.65 0.14 55 / 35%)", fg: "#3d2b1f" },
};

// TTS paragraph highlight colors — subtle background
const TTS_PARA_COLORS: Record<string, string> = {
  dark: "oklch(0.65 0.15 264 / 12%)",
  light: "oklch(0.55 0.15 264 / 10%)",
  sepia: "oklch(0.65 0.12 55 / 12%)",
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
  currentPage,
  totalPages,
  onMeasure,
  onFirstParaChange,
  onPageRequest,
  ttsStatus,
  ttsParagraphIndex = -1,
  ttsActiveWordIndex = -1,
  ttsHighWaterMark = -1,
  ttsHighlightMode = "both",
  ttsShowReadMark = true,
  onPlayFromParagraph,
  readingTheme: readingThemeProp,
  aiFormattingEnabled = false,
  wikiEnabled = false,
  wikiEntityIndex = [],
  currentChapterIndex = 0,
  filePath,
  bookTitle,
  simulateEnabled = false,
  onSimulateEntity,
  onOpenWikiEntity,
  simulateMode = false,
  simulateInputVisible = false,
  simulateGenerating = false,
  onSimulateSubmit,
  branchEntityName,
  simulateChoices = [],
}: TextContentProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const clipperRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const simInputRef = useRef<HTMLInputElement>(null);
  const [simInputValue, setSimInputValue] = useState("");

  // Auto-focus simulate input when it becomes visible
  useEffect(() => {
    if (simulateInputVisible && simInputRef.current) {
      // Need timeout because slider may still be transitioning
      setTimeout(() => simInputRef.current?.focus(), 300);
    }
  }, [simulateInputVisible, htmlParagraphs.length]);

  // Wiki tooltip state
  const [tooltipData, setTooltipData] = useState<{
    id: string;
    name: string;
    type: WikiEntryType;
    shortDescription: string;
    status: string;
    significance: number;
    color: string;
    x: number;
    y: number;
    arrowX: number;
    placement: "above" | "below";
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenuData, setContextMenuData] = useState<{
    entity: { id: string; name: string; type: WikiEntryType; color: string };
    x: number;
    y: number;
    paragraphIndex: number;
  } | null>(null);

  const [pageWidth, setPageWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentFitsSingleCol, setContentFitsSingleCol] = useState(false);
  const singleColFrozenRef = useRef(false);
  const [slideClass, setSlideClass] = useState<string | null>(null);

  // Build entity regex from index
  const entityRegex = useMemo(() => {
    if (!wikiEnabled || wikiEntityIndex.length === 0) return null;
    return buildEntityRegex(wikiEntityIndex);
  }, [wikiEnabled, wikiEntityIndex]);

  const columnGap = 48;
  const forceSingleCol = containerWidth > 0 && containerWidth < 1200;
  const useSingleCol = forceSingleCol || contentFitsSingleCol;
  // In single-col mode clamp column to at least 800px so CSS columns won't split
  const colWidth = useSingleCol
    ? Math.max(pageWidth, 800)
    : Math.max(1, Math.floor((pageWidth - columnGap) / 2));
  const stride = pageWidth + columnGap;

  // ── Layout measurement ──────────────────────────────

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const slider = sliderRef.current;
    if (!outer || !slider) return;

    const outerW = outer.clientWidth;
    const innerW = outerW - padding * 2;
    const innerH = outer.clientHeight - padding * 2;
    const pw = Math.min(innerW, maxTextWidth);

    setContainerWidth(outerW);
    setPageWidth(pw);
    setContentHeight(innerH);

    requestAnimationFrame(() => {
      if (!slider) return;
      const scrollW = slider.scrollWidth;
      const s = pw + columnGap;
      const pages = Math.max(1, Math.ceil(scrollW / s));
      onMeasure(pages);

      // Detect if all content fits in a single column (only evaluate once per chapter)
      if (!singleColFrozenRef.current) {
        const twoColW = Math.max(1, Math.floor((pw - columnGap) / 2));
        const fits = pages === 1 && scrollW <= twoColW + 20;
        if (fits) {
          singleColFrozenRef.current = true;
          setContentFitsSingleCol(true);
        }
      }
    });
  }, [padding, maxTextWidth, columnGap, onMeasure]);

  useEffect(() => {
    measure();
  }, [measure, htmlParagraphs, fontFamily, fontSize, lineHeight, paraSpacing]);

  // Re-measure when column mode changes so page count is recalculated with correct CSS
  useEffect(() => {
    measure();
  }, [useSingleCol, measure]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    return () => ro.disconnect();
  }, [measure]);

  // Report first visible paragraph whenever currentPage changes
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider || stride <= 0 || !onFirstParaChange) return;
    const pageStart = currentPage * stride;
    const pageEnd = pageStart + pageWidth;
    const paraEls = slider.querySelectorAll("[data-para-idx]");
    for (const el of paraEls) {
      const htmlEl = el as HTMLElement;
      const left = htmlEl.offsetLeft;
      const right = left + htmlEl.offsetWidth;
      if (right > pageStart && left < pageEnd) {
        onFirstParaChange(parseInt(htmlEl.getAttribute("data-para-idx") ?? "0", 10));
        return;
      }
    }
    onFirstParaChange(0);
  }, [currentPage, stride, pageWidth, onFirstParaChange]);

  // Reset single-col detection on chapter change
  useEffect(() => {
    singleColFrozenRef.current = false;
    setContentFitsSingleCol(false);
  }, [htmlParagraphs]);

  // ── Content processing ──────────────────────────────

  const filteredHtmlRaw = useMemo(
    () => filterTitleParagraph(htmlParagraphs, chapterTitle),
    [htmlParagraphs, chapterTitle],
  );

  // Inject wiki entity highlights
  const filteredHtml = useMemo(() => {
    if (!wikiEnabled || !entityRegex || wikiEntityIndex.length === 0) return filteredHtmlRaw;
    return filteredHtmlRaw.map((html) => injectWikiEntities(html, wikiEntityIndex, entityRegex));
  }, [filteredHtmlRaw, wikiEnabled, entityRegex, wikiEntityIndex]);

  // How many paragraphs were removed from the front (0 or 1)
  const filterOffset = htmlParagraphs.length - filteredHtml.length;

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

    // Store original htmlParagraphs index for TTS word lookup
    const originalIdx = i + filterOffset;
    // Subtle opacity dim for paragraphs TTS has already read (live or persisted)
    const isRead = ttsShowReadMark && ttsHighWaterMark >= 0 && (
      ttsParagraphIndex >= 0
        ? (originalIdx < ttsParagraphIndex && originalIdx <= ttsHighWaterMark)
        : originalIdx <= ttsHighWaterMark
    );

    return (
      <div
        key={i}
        data-para-idx={originalIdx}
        style={{
          marginBottom: `${paraSpacing}px`,
          textIndent: !isFirst && i > 0 ? `${fontSize * 1.5}px` : undefined,
          opacity: isRead ? 0.45 : undefined,
          transition: "opacity 0.4s ease",
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

  // ── Wiki entity click handling → tooltip ─────────────────
  useEffect(() => {
    const clipper = clipperRef.current;
    if (!clipper || !wikiEnabled || !filePath) return;

    const handleClick = async (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-wiki-id]") as HTMLElement | null;
      if (!target) return;
      e.stopPropagation();
      const id = target.getAttribute("data-wiki-id");
      if (!id) return;

      // Toggle: clicking same entity dismisses tooltip
      if (tooltipData?.id === id) {
        setTooltipData(null);
        return;
      }

      // Fetch entry from DB (lightweight — just the row)
      const row = await window.electronAPI?.wikiGetEntry(filePath, id);
      if (!row) return;

      // Get element position for tooltip placement
      const rect = target.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tooltipW = 280;
      const tooltipH = 160; // estimate
      const pad = 12;

      // Center tooltip horizontally on entity
      let x = rect.left + rect.width / 2 - tooltipW / 2;
      x = Math.max(pad, Math.min(x, vw - tooltipW - pad));

      // Arrow points at center of entity
      const arrowX = Math.max(16, Math.min(rect.left + rect.width / 2 - x, tooltipW - 16));

      // Prefer above, fallback below
      const spaceAbove = rect.top;
      const spaceBelow = vh - rect.bottom;
      let placement: "above" | "below" = "above";
      let y: number;

      if (spaceAbove >= tooltipH + pad) {
        placement = "above";
        y = rect.top - 8; // tooltip bottom edge (will use bottom positioning)
      } else if (spaceBelow >= tooltipH + pad) {
        placement = "below";
        y = rect.bottom + 8;
      } else {
        // Not enough space either way — use whichever has more
        placement = spaceAbove >= spaceBelow ? "above" : "below";
        y = placement === "above" ? rect.top - 8 : rect.bottom + 8;
      }

      // Find entity color from index
      const entityInfo = wikiEntityIndex.find(e => e.id === id);

      setTooltipData({
        id,
        name: row.name,
        type: row.type as WikiEntryType,
        shortDescription: row.short_description ?? "",
        status: row.status ?? "active",
        significance: row.significance ?? 1,
        color: entityInfo?.color ?? "blue",
        x,
        y,
        arrowX,
        placement,
      });
    };

    clipper.addEventListener("click", handleClick);
    return () => clipper.removeEventListener("click", handleClick);
  }, [wikiEnabled, filePath, tooltipData?.id, wikiEntityIndex]);

  // ── Wiki entity right-click → context menu ────────────────
  useEffect(() => {
    const clipper = clipperRef.current;
    if (!clipper || !wikiEnabled || !simulateEnabled || !filePath) return;

    const handleContextMenu = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-wiki-id]") as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const id = target.getAttribute("data-wiki-id");
      if (!id) return;

      const entityInfo = wikiEntityIndex.find(ent => ent.id === id);
      if (!entityInfo) return;

      // Find paragraph index from the closest [data-para-idx] ancestor
      const paraEl = (e.target as HTMLElement).closest("[data-para-idx]") as HTMLElement | null;
      const paragraphIndex = paraEl ? parseInt(paraEl.getAttribute("data-para-idx") ?? "0", 10) : 0;

      // Dismiss tooltip if open
      setTooltipData(null);

      setContextMenuData({
        entity: entityInfo,
        x: e.clientX,
        y: e.clientY,
        paragraphIndex,
      });
    };

    clipper.addEventListener("contextmenu", handleContextMenu);
    return () => clipper.removeEventListener("contextmenu", handleContextMenu);
  }, [wikiEnabled, simulateEnabled, filePath, wikiEntityIndex]);

  // Dismiss tooltip on click outside
  useEffect(() => {
    if (!tooltipData) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't dismiss if clicking on a wiki entity (handled above) or tooltip itself
      if (target.closest("[data-wiki-id]")) return;
      if (tooltipRef.current?.contains(target)) return;
      setTooltipData(null);
    };
    // Delay so the same click that opened it doesn't close it
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [tooltipData]);

  // Dismiss tooltip and context menu on page change or chapter change
  useEffect(() => {
    setTooltipData(null);
    setContextMenuData(null);
  }, [currentPage, currentChapterIndex]);

  // Dismiss tooltip on Escape
  useEffect(() => {
    if (!tooltipData) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setTooltipData(null); e.stopPropagation(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [tooltipData]);

  // ── TTS auto-navigate: scroll to the page containing the active paragraph ──

  useEffect(() => {
    const ttsPlaying = ttsStatus === "playing" || ttsStatus === "synthesizing";
    if (!ttsPlaying || ttsParagraphIndex < 0) return;

    const slider = sliderRef.current;
    if (!slider || stride <= 0) return;

    const paraEl = slider.querySelector(`[data-para-idx="${ttsParagraphIndex}"]`) as HTMLElement | null;
    if (!paraEl) return;

    // The paragraph's left offset relative to the slider tells us which page it's on
    const paraLeft = paraEl.offsetLeft;
    const targetPage = Math.floor(paraLeft / stride);
    if (targetPage !== currentPage && targetPage >= 0 && targetPage < totalPages) {
      onPageRequest?.(targetPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsParagraphIndex, ttsStatus, stride, totalPages]);

  // ── TTS highlight overlays ──

  const showWordHighlight = ttsHighlightMode === "word";
  const showParaHighlight = ttsHighlightMode === "paragraph" || ttsHighlightMode === "both";
  const showWordBold = ttsHighlightMode === "both";

  const [wordRects, setWordRects] = useState<DOMRect[]>([]);
  const [paraRects, setParaRects] = useState<DOMRect[]>([]);

  // Find the target word's text node and position
  const findWordInParagraph = useCallback((paraEl: Element, wordIndex: number) => {
    const walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
    let wordCount = 0;
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const text = textNode.textContent ?? "";
      const wordRegex = /\S+/g;
      let match: RegExpExecArray | null;
      while ((match = wordRegex.exec(text)) !== null) {
        if (wordCount === wordIndex) {
          return { node: textNode, start: match.index, end: match.index + match[0].length };
        }
        wordCount++;
      }
    }
    return null;
  }, []);

  // Word highlight rects (for "word" mode)
  useEffect(() => {
    if (!showWordHighlight) { setWordRects([]); return; }

    const ttsPlaying = ttsStatus === "playing" || ttsStatus === "synthesizing";
    if (!ttsPlaying || ttsActiveWordIndex < 0 || ttsParagraphIndex < 0) {
      setWordRects([]);
      return;
    }

    const slider = sliderRef.current;
    const clipper = slider?.parentElement;
    if (!slider || !clipper) { setWordRects([]); return; }

    const paraEl = slider.querySelector(`[data-para-idx="${ttsParagraphIndex}"]`);
    if (!paraEl) { setWordRects([]); return; }

    const found = findWordInParagraph(paraEl, ttsActiveWordIndex);
    if (!found) { setWordRects([]); return; }

    try {
      const range = new Range();
      range.setStart(found.node, found.start);
      range.setEnd(found.node, found.end);
      const clipperRect = clipper.getBoundingClientRect();
      // Use computed line-height for consistent rect height
      const computedLH = parseFloat(getComputedStyle(paraEl).lineHeight) || (fontSize * lineHeight);
      const rects = Array.from(range.getClientRects()).map(r => {
        const heightDiff = computedLH - r.height;
        return new DOMRect(
          r.x - clipperRect.x,
          r.y - clipperRect.y - heightDiff / 2,
          r.width,
          computedLH,
        );
      });
      setWordRects(rects);
    } catch {
      setWordRects([]);
    }
  }, [showWordHighlight, ttsStatus, ttsParagraphIndex, ttsActiveWordIndex, findWordInParagraph, fontSize, lineHeight]);

  // Paragraph highlight rects (for "paragraph" and "both" modes)
  // Uses Range over all text nodes to get accurate column-aware rects
  useEffect(() => {
    if (!showParaHighlight) { setParaRects([]); return; }

    const ttsPlaying = ttsStatus === "playing" || ttsStatus === "synthesizing";
    if (!ttsPlaying || ttsParagraphIndex < 0) {
      setParaRects([]);
      return;
    }

    const slider = sliderRef.current;
    const clipper = slider?.parentElement;
    if (!slider || !clipper) { setParaRects([]); return; }

    const paraEl = slider.querySelector(`[data-para-idx="${ttsParagraphIndex}"]`);
    if (!paraEl) { setParaRects([]); return; }

    try {
      // Create a range spanning all content in the paragraph
      const range = new Range();
      range.selectNodeContents(paraEl);
      const clipperRect = clipper.getBoundingClientRect();
      // getClientRects returns one rect per line/column fragment
      const clientRects = Array.from(range.getClientRects());
      if (clientRects.length === 0) { setParaRects([]); return; }

      // Group rects by column — rects in the same column have overlapping horizontal ranges
      const translated = clientRects.map(r => new DOMRect(
        r.x - clipperRect.x, r.y - clipperRect.y, r.width, r.height,
      ));
      const groups: DOMRect[][] = [];
      for (const rect of translated) {
        let added = false;
        for (const group of groups) {
          const ref = group[0];
          // Same column if horizontal centers are within half a column width
          const refCx = ref.x + ref.width / 2;
          const cx = rect.x + rect.width / 2;
          if (Math.abs(refCx - cx) < colWidth * 0.6) {
            group.push(rect);
            added = true;
            break;
          }
        }
        if (!added) groups.push([rect]);
      }

      // Merge each group into a single bounding rect
      const pad = 6;
      const merged = groups.map(group => {
        const minX = Math.min(...group.map(r => r.x));
        const minY = Math.min(...group.map(r => r.y));
        const maxX = Math.max(...group.map(r => r.x + r.width));
        const maxY = Math.max(...group.map(r => r.y + r.height));
        // Apply padding then clamp to clipper bounds
        const x = Math.max(0, minX - pad);
        const y = Math.max(0, minY - pad / 2);
        const right = Math.min(pageWidth, maxX + pad);
        const bottom = Math.min(contentHeight, maxY + pad / 2);
        return new DOMRect(x, y, right - x, bottom - y);
      });

      setParaRects(merged);
    } catch {
      setParaRects([]);
    }
  }, [showParaHighlight, ttsStatus, ttsParagraphIndex, ttsActiveWordIndex, colWidth, pageWidth, contentHeight]);

  // Word underline rects for "both" mode (overlay approach — no DOM mutation)
  const [bothWordRects, setBothWordRects] = useState<DOMRect[]>([]);

  useEffect(() => {
    if (!showWordBold) { setBothWordRects([]); return; }

    const ttsPlaying = ttsStatus === "playing" || ttsStatus === "synthesizing";
    if (!ttsPlaying || ttsActiveWordIndex < 0 || ttsParagraphIndex < 0) {
      setBothWordRects([]);
      return;
    }

    const slider = sliderRef.current;
    const clipper = slider?.parentElement;
    if (!slider || !clipper) { setBothWordRects([]); return; }

    const paraEl = slider.querySelector(`[data-para-idx="${ttsParagraphIndex}"]`);
    if (!paraEl) { setBothWordRects([]); return; }

    const found = findWordInParagraph(paraEl, ttsActiveWordIndex);
    if (!found) { setBothWordRects([]); return; }

    try {
      const range = new Range();
      range.setStart(found.node, found.start);
      range.setEnd(found.node, found.end);
      const clipperRect = clipper.getBoundingClientRect();
      const computedLH = parseFloat(getComputedStyle(paraEl).lineHeight) || (fontSize * lineHeight);
      const rects = Array.from(range.getClientRects()).map(r => {
        const heightDiff = computedLH - r.height;
        return new DOMRect(
          r.x - clipperRect.x,
          r.y - clipperRect.y - heightDiff / 2,
          r.width,
          computedLH,
        );
      });
      setBothWordRects(rects);
    } catch {
      setBothWordRects([]);
    }
  }, [showWordBold, ttsStatus, ttsParagraphIndex, ttsActiveWordIndex, findWordInParagraph, fontSize, lineHeight]);

  // ── Render ──────────────────────────────────────────

  const translateX = currentPage * stride;

  const readingTheme: ReadingTheme = theme.bgRaw === "#f4ecd8"
    ? "sepia"
    : theme.bgRaw === "#fafafa"
      ? "light"
      : "dark";
  const sel = SELECTION_COLORS[readingTheme] ?? SELECTION_COLORS.dark;
  const ttsCol = TTS_HIGHLIGHT_COLORS[readingTheme] ?? TTS_HIGHLIGHT_COLORS.dark;
  const ttsParaCol = TTS_PARA_COLORS[readingTheme] ?? TTS_PARA_COLORS.dark;

  return (
    <div
      ref={outerRef}
      className="reader-content h-full select-text"
      style={{
        padding: `${padding}px`,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Clipper: shows exactly one page (1 or 2 columns depending on viewport/content) */}
      <div
        ref={clipperRef}
        className={`mx-auto${slideClass ? ` ${slideClass}` : ""}`}
        data-reading-theme={readingThemeProp ?? readingTheme}
        style={{
          width: `${pageWidth}px`,
          height: `${contentHeight}px`,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {aiFormattingEnabled && <style>{AI_FORMATTING_STYLES}</style>}
        {/* Slider: absolutely positioned, CSS transition handles page animation */}
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
            transition: animated
              ? "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)"
              : "none",
          }}
        >
          {titleJSX}
          {paragraphsJSX}

          {/* Simulate: loading indicator */}
          {simulateMode && simulateGenerating && (
            <div
              style={{
                padding: `${paraSpacing}px 0`,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                opacity: 0.5,
                fontFamily,
                fontSize: `${fontSize}px`,
              }}
            >
              <div className="sim-loading-dots" style={{ display: "flex", gap: "4px" }}>
                <span className="sim-dot" />
                <span className="sim-dot" />
                <span className="sim-dot" />
              </div>
              <span className={theme.muted} style={{ fontSize: `${fontSize * 0.85}px` }}>
                Writing...
              </span>
            </div>
          )}

          {/* Simulate: choices + input */}
          {simulateMode && simulateInputVisible && (
            <div
              style={{
                padding: `${paraSpacing * 1.5}px 0`,
                breakInside: "avoid",
              }}
            >
              {/* Divider */}
              <div
                style={{
                  height: "1px",
                  background: "rgba(255,255,255,0.06)",
                  marginBottom: `${paraSpacing}px`,
                }}
              />

              {/* Choice buttons (from AI) */}
              {simulateChoices.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: `${paraSpacing * 0.75}px` }}>
                  {simulateChoices.map((choice, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (onSimulateSubmit) {
                          onSimulateSubmit(choice.description);
                        }
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "10px",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        background: "var(--bg-inset)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily,
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent-brand)";
                        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                        e.currentTarget.style.background = "var(--bg-inset)";
                      }}
                    >
                      <span
                        style={{
                          fontSize: `${fontSize * 0.75}px`,
                          fontWeight: 600,
                          color: "var(--accent-brand)",
                          opacity: 0.8,
                          flexShrink: 0,
                          lineHeight: 1,
                          marginTop: "2px",
                        }}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          className={theme.text}
                          style={{
                            fontSize: `${fontSize * 0.85}px`,
                            fontWeight: 500,
                            lineHeight: 1.3,
                          }}
                        >
                          {choice.label}
                        </div>
                        <div
                          className={theme.muted}
                          style={{
                            fontSize: `${fontSize * 0.75}px`,
                            lineHeight: 1.4,
                            marginTop: "2px",
                          }}
                        >
                          {choice.description}
                        </div>
                      </div>
                    </button>
                  ))}

                  {/* Continue Story button */}
                  <button
                    onClick={() => {
                      if (onSimulateSubmit) {
                        onSimulateSubmit("Continue the story naturally from where you left off.");
                      }
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "transparent",
                      border: "1px dashed rgba(255,255,255,0.08)",
                      cursor: "pointer",
                      textAlign: "center",
                      fontFamily,
                      fontSize: `${fontSize * 0.8}px`,
                      fontWeight: 500,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    className={theme.muted}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    Continue story...
                  </button>
                </div>
              )}

              {/* Custom direction input */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "var(--bg-inset)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <input
                  ref={simInputRef}
                  type="text"
                  value={simInputValue}
                  onChange={(e) => setSimInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && simInputValue.trim() && onSimulateSubmit) {
                      onSimulateSubmit(simInputValue.trim());
                      setSimInputValue("");
                    }
                    // Prevent space from triggering TTS
                    e.stopPropagation();
                  }}
                  placeholder={branchEntityName ? `Or type your own direction for ${branchEntityName}...` : "Or type your own direction..."}
                  className={theme.text}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    fontFamily,
                    fontSize: `${fontSize * 0.85}px`,
                    lineHeight: 1.5,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* TTS paragraph highlight overlay ("paragraph" and "both" modes) */}
        {showParaHighlight && paraRects.map((r, i) => (
          <div
            key={`para-${i}`}
            style={{
              position: "absolute",
              left: `${r.x}px`,
              top: `${r.y}px`,
              width: `${r.width}px`,
              height: `${r.height}px`,
              borderRadius: "6px",
              backgroundColor: ttsParaCol,
              pointerEvents: "none",
              transition: "top 0.15s ease, height 0.15s ease",
              zIndex: 0,
            }}
          />
        ))}

        {/* TTS active word highlight overlay ("word" mode only) */}
        {showWordHighlight && wordRects.map((r, i) => (
          <div
            key={`word-${i}`}
            style={{
              position: "absolute",
              left: `${r.x - 2}px`,
              top: `${r.y}px`,
              width: `${r.width + 4}px`,
              height: `${r.height}px`,
              borderRadius: "4px",
              backgroundColor: ttsCol.bg,
              pointerEvents: "none",
              transition: "left 0.05s ease, top 0.05s ease, width 0.05s ease",
              zIndex: 1,
            }}
          />
        ))}

        {/* TTS current word underline ("both" mode only) */}
        {showWordBold && bothWordRects.map((r, i) => (
          <div
            key={`both-${i}`}
            style={{
              position: "absolute",
              left: `${r.x - 2}px`,
              top: `${r.y + r.height - 2}px`,
              width: `${r.width + 4}px`,
              height: "2px",
              borderRadius: "1px",
              backgroundColor: ttsCol.fg === "white" ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.35)",
              pointerEvents: "none",
              transition: "left 0.05s ease, top 0.05s ease, width 0.05s ease",
              zIndex: 1,
            }}
          />
        ))}

        {/* Text selection toolbar */}
        <SelectionToolbar
          theme={theme}
          containerRef={clipperRef}
          onPlayFromParagraph={onPlayFromParagraph}
        />

      </div>

      {/* Wiki entity tooltip */}
      {tooltipData && (
        <WikiTooltipPopup
          data={tooltipData}
          tooltipRef={tooltipRef}
          filePath={filePath}
          bookTitle={bookTitle}
          onClose={() => setTooltipData(null)}
        />
      )}

      {/* Wiki entity context menu */}
      {contextMenuData && (
        <EntityContextMenu
          entity={contextMenuData.entity}
          x={contextMenuData.x}
          y={contextMenuData.y}
          onSimulate={() => onSimulateEntity?.(contextMenuData.entity, contextMenuData.paragraphIndex)}
          onOpenWiki={() => {
            if (filePath && bookTitle) {
              if (onOpenWikiEntity) {
                onOpenWikiEntity(contextMenuData.entity.id);
              } else {
                window.electronAPI?.openWiki({ filePath, title: bookTitle, entryId: contextMenuData.entity.id });
              }
            }
          }}
          onClose={() => setContextMenuData(null)}
        />
      )}

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
        .wiki-entity {
          cursor: pointer;
          border-bottom: 1px dotted;
          padding-bottom: 1px;
          transition: border-color 0.15s ease, background-color 0.15s ease;
        }
        .wiki-entity-blue { color: rgba(147, 197, 253, 0.9); border-color: rgba(96, 165, 250, 0.3); }
        .wiki-entity-blue:hover { background: rgba(96, 165, 250, 0.08); border-color: rgba(96, 165, 250, 0.6); }
        .wiki-entity-amber { color: rgba(252, 211, 77, 0.9); border-color: rgba(251, 191, 36, 0.3); }
        .wiki-entity-amber:hover { background: rgba(251, 191, 36, 0.08); border-color: rgba(251, 191, 36, 0.6); }
        .wiki-entity-emerald { color: rgba(110, 231, 183, 0.9); border-color: rgba(52, 211, 153, 0.3); }
        .wiki-entity-emerald:hover { background: rgba(52, 211, 153, 0.08); border-color: rgba(52, 211, 153, 0.6); }
        .wiki-entity-rose { color: rgba(253, 164, 175, 0.9); border-color: rgba(251, 113, 133, 0.3); }
        .wiki-entity-rose:hover { background: rgba(251, 113, 133, 0.08); border-color: rgba(251, 113, 133, 0.6); }
        .wiki-entity-violet { color: rgba(196, 181, 253, 0.9); border-color: rgba(167, 139, 250, 0.3); }
        .wiki-entity-violet:hover { background: rgba(167, 139, 250, 0.08); border-color: rgba(167, 139, 250, 0.6); }
        .wiki-tooltip-enter {
          animation: wikiTooltipIn 0.15s ease-out;
        }
        @keyframes wikiTooltipIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .sim-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent-brand);
          animation: simDotPulse 1.2s ease-in-out infinite;
        }
        .sim-dot:nth-child(2) { animation-delay: 0.2s; }
        .sim-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes simDotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Wiki tooltip type metadata ──────────────────────────
const WIKI_TYPE_META: Record<WikiEntryType, { icon: React.ReactNode; label: string; color: string; bg: string; border: string }> = {
  character: { icon: <User className="h-3 w-3" strokeWidth={1.5} />, label: "Character", color: "rgb(147, 197, 253)", bg: "rgba(96, 165, 250, 0.15)", border: "rgba(96, 165, 250, 0.4)" },
  item: { icon: <Swords className="h-3 w-3" strokeWidth={1.5} />, label: "Item", color: "rgb(252, 211, 77)", bg: "rgba(251, 191, 36, 0.15)", border: "rgba(251, 191, 36, 0.4)" },
  location: { icon: <MapPin className="h-3 w-3" strokeWidth={1.5} />, label: "Location", color: "rgb(110, 231, 183)", bg: "rgba(52, 211, 153, 0.15)", border: "rgba(52, 211, 153, 0.4)" },
  event: { icon: <Flame className="h-3 w-3" strokeWidth={1.5} />, label: "Event", color: "rgb(253, 164, 175)", bg: "rgba(251, 113, 133, 0.15)", border: "rgba(251, 113, 133, 0.4)" },
  concept: { icon: <Lightbulb className="h-3 w-3" strokeWidth={1.5} />, label: "Concept", color: "rgb(196, 181, 253)", bg: "rgba(167, 139, 250, 0.15)", border: "rgba(167, 139, 250, 0.4)" },
};

function WikiTooltipPopup({
  data,
  tooltipRef,
  filePath,
  bookTitle,
  onClose,
}: {
  data: {
    id: string;
    name: string;
    type: WikiEntryType;
    shortDescription: string;
    status: string;
    significance: number;
    color: string;
    x: number;
    y: number;
    arrowX: number;
    placement: "above" | "below";
  };
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  filePath?: string;
  bookTitle?: string;
  onClose: () => void;
}) {
  const meta = WIKI_TYPE_META[data.type] ?? WIKI_TYPE_META.concept;

  const openWiki = () => {
    if (filePath && bookTitle) {
      window.electronAPI?.openWiki({ filePath, title: bookTitle, entryId: data.id });
    }
    onClose();
  };

  const style: React.CSSProperties = {
    position: "fixed",
    zIndex: 50,
    width: "280px",
    left: `${data.x}px`,
    borderLeft: `3px solid ${meta.border}`,
  };

  if (data.placement === "above") {
    style.bottom = `${window.innerHeight - data.y}px`;
  } else {
    style.top = `${data.y}px`;
  }

  return (
    <div
      ref={tooltipRef}
      className="rounded-lg shadow-lg shadow-black/40 wiki-tooltip-enter"
      style={style}
    >
      <div
        className="rounded-lg p-3 space-y-2"
        style={{
          background: "var(--bg-overlay)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        {/* Type badge + name */}
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1 shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-medium"
            style={{ background: meta.bg, color: meta.color }}
          >
            {meta.icon}
            {meta.label}
          </span>
          <span className="text-sm font-semibold text-white/90 truncate">{data.name}</span>
        </div>

        {/* Short description */}
        {data.shortDescription && (
          <p className="text-xs leading-relaxed text-white/50 line-clamp-3">
            {data.shortDescription}
          </p>
        )}

        {/* Status + significance */}
        <div className="flex items-center gap-2">
          <span
            className="rounded-lg px-1.5 py-0.5 text-xs font-medium capitalize"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
          >
            {data.status}
          </span>
          <span className="text-xs text-white/25">·</span>
          <span className="text-xs text-white/30">
            {"★".repeat(data.significance)}{"☆".repeat(Math.max(0, 4 - data.significance))}
          </span>
        </div>

        {/* Open Wiki button */}
        <button
          onClick={openWiki}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors hover:bg-white/[0.08]"
          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }}
        >
          <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
          Open Wiki
        </button>
      </div>

      {/* Arrow */}
      <div
        style={{
          position: "absolute",
          left: `${data.arrowX}px`,
          [data.placement === "above" ? "bottom" : "top"]: "-5px",
          width: "10px",
          height: "10px",
          background: "var(--bg-overlay)",
          transform: "rotate(45deg)",
          borderRadius: "2px",
        }}
      />
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
