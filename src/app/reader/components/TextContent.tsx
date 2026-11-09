"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { User, Swords, MapPin, Flame, Lightbulb, ExternalLink, MessageCircle, Plus, X, Sparkles, ArrowRight } from "lucide-react";
import { TypingDots } from "@/components/ui/typing-dots";
import { CommentInput } from "./CommentInput";
import type { ThemeClasses, ReadingTheme, TTSStatus, TTSHighlightMode } from "../lib/types";
import { SelectionToolbar } from "./SelectionToolbar";
import { AI_FORMATTING_STYLES } from "@/lib/ai-formatting-css";
import type { WikiEntryType } from "@/lib/ai-wiki";
import type { SimChoice } from "@/lib/ai-simulate";
import type { InlineComment } from "@/lib/ai-comments";
import { buildEntityRegex, injectWikiEntities } from "./WikiTooltip";
import { EntityContextMenu } from "./EntityContextMenu";
import { applyReplacements, applyReplacementsPlain, loadReplacements, type WordReplacement } from "@/lib/word-replacements";

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
  commentsEnabled?: boolean;
  inlineComments?: InlineComment[];
  onAddComment?: (paraIndex: number, text: string) => void;
  onDeleteComment?: (paraIndex: number, author: "ai" | "user", text: string) => void;
  onExplain?: (selectedText: string, paraIndex: number) => void;
  onSaveQuote?: (text: string, paraIndex: number) => void;
  // Speed reader overlay
  speedReaderActive?: boolean;
  speedReaderParaIndex?: number;
  speedReaderChunkText?: string;
  speedReaderChunkOffset?: number;
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
  commentsEnabled = false,
  inlineComments = [],
  onAddComment,
  onDeleteComment,
  onExplain,
  onSaveQuote,
  speedReaderActive = false,
  speedReaderParaIndex = -1,
  speedReaderChunkText,
  speedReaderChunkOffset = 0,
}: TextContentProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const clipperRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const simInputRef = useRef<HTMLInputElement>(null);
  const [simInputValue, setSimInputValue] = useState("");

  // Word replacements (loaded once from settings)
  const [wordReplacements, setWordReplacements] = useState<WordReplacement[]>([]);
  useEffect(() => {
    loadReplacements().then(setWordReplacements);
  }, []);

  // Comment state
  const [expandedCommentPara, setExpandedCommentPara] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [addingCommentPara, setAddingCommentPara] = useState<number | null>(null);

  // Build comment lookup by paragraph index
  const commentsByPara = useMemo(() => {
    const map = new Map<number, InlineComment[]>();
    if (!commentsEnabled) return map;
    for (const c of inlineComments) {
      const arr = map.get(c.paraIndex) ?? [];
      arr.push(c);
      map.set(c.paraIndex, arr);
    }
    return map;
  }, [inlineComments, commentsEnabled]);

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
    // Measure: a column never exceeds maxTextWidth or 70ch. A single-column
    // page is one such column; a two-column spread is two plus the gap.
    const colMax = Math.min(maxTextWidth, Math.round(70 * measureCh(fontFamily, fontSize)));
    const singleCol = outerW < 1200 || singleColFrozenRef.current;
    const pw = Math.max(1, Math.min(innerW, singleCol ? colMax : colMax * 2 + columnGap));

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
  }, [padding, maxTextWidth, columnGap, onMeasure, fontFamily, fontSize]);

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
  const filteredHtmlWiki = useMemo(() => {
    if (!wikiEnabled || !entityRegex || wikiEntityIndex.length === 0) return filteredHtmlRaw;
    return filteredHtmlRaw.map((html) => injectWikiEntities(html, wikiEntityIndex, entityRegex));
  }, [filteredHtmlRaw, wikiEnabled, entityRegex, wikiEntityIndex]);

  // Apply word replacements
  const filteredHtml = useMemo(() => {
    if (wordReplacements.length === 0) return filteredHtmlWiki;
    return filteredHtmlWiki.map((html) => applyReplacements(html, wordReplacements));
  }, [filteredHtmlWiki, wordReplacements]);

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

  const buildFirstParagraph = useCallback((html: string) => {
    const text = stripTags(html);
    if (!text || text.length === 0) return html;
    // True drop cap: a float spanning exactly three lines, so line 1 keeps
    // its normal height and both columns share one baseline grid.
    const linePx = fontSize * lineHeight;
    const capSize = Math.round(linePx * 3);
    const capBox = Math.max(1, capSize - 2); // stay inside 3 lines — never indent line 4
    return html.replace(
      /(<p[^>]*>(?:\s*<[^/][^>]*>)*)([A-Za-z\u00C0-\u024F])/,
      `$1<span class="reader-drop-cap" style="float:left;font-size:${capSize}px;line-height:${capBox}px;height:${capBox}px;font-weight:600;margin:0 0.08em 0 0">${"$2"}</span>`,
    );
  }, [fontSize, lineHeight]);

  const paragraphsJSX = useMemo(() => {
    return filteredHtml.map((html, i) => {
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

      const paraComments = commentsByPara.get(originalIdx);
      const hasComments = commentsEnabled && paraComments && paraComments.length > 0;

      return (
        <div
          key={i}
          data-para-idx={originalIdx}
          className="comment-para-wrap"
          style={{
            marginBottom: `${paraSpacing}px`,
            textIndent: !isFirst && i > 0 ? `${fontSize * 1.5}px` : undefined,
            opacity: isRead ? 0.45 : undefined,
            transition: "opacity 0.4s ease",
            position: "relative",
          }}
        >
          <span dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          {/* Comment indicator — absolutely positioned, zero layout impact */}
          {commentsEnabled && hasComments && (
            <span
              className="comment-badge"
              data-comment-para={originalIdx}
              onClick={(e) => {
                e.stopPropagation();
                setExpandedCommentPara(prev => prev === originalIdx ? null : originalIdx);
                setAddingCommentPara(null);
                setCommentInput("");
              }}
              style={{
                position: "absolute", right: "4px", top: "0",
                display: "inline-flex", alignItems: "center", gap: "2px",
                cursor: "pointer", opacity: 0.7, transition: "opacity 0.15s ease",
                zIndex: 5,
              }}
            >
              {paraComments!.some((c) => c.author === "ai") && (
                <CommentAvatar author="ai" />
              )}
              {paraComments!.some((c) => c.author === "user") && (
                <CommentAvatar
                  author="user"
                  className={paraComments!.some((c) => c.author === "ai") ? "-ml-1.5" : undefined}
                />
              )}
            </span>
          )}
          {/* Add comment icon — absolutely positioned, hidden until hover */}
          {commentsEnabled && !hasComments && (
            <span
              className="comment-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                setAddingCommentPara(prev => prev === originalIdx ? null : originalIdx);
                setExpandedCommentPara(null);
                setCommentInput("");
              }}
              style={{
                position: "absolute", right: "4px", top: "0",
                display: "inline-flex", alignItems: "center",
                cursor: "pointer", opacity: 0, transition: "opacity 0.15s ease",
                zIndex: 5,
              }}
            >
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-current/10 shadow-xs">
                <Plus className="size-3" strokeWidth={2.25} />
              </span>
            </span>
          )}
        </div>
      );
    });
  }, [
    filteredHtml,
    firstTextIndex,
    filterOffset,
    fontSize,
    paraSpacing,
    ttsShowReadMark,
    ttsHighWaterMark,
    ttsParagraphIndex,
    commentsEnabled,
    commentsByPara,
    buildFirstParagraph
  ]);

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
          {wordReplacements.length > 0 ? applyReplacementsPlain(chapterTitle, wordReplacements) : chapterTitle}
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
    // Skip text nodes inside dialogue speaker spans — TTS strips these before synthesis,
    // so their words are not counted in the word boundary offsets returned by Edge TTS.
    const ttsFilter: NodeFilter = {
      acceptNode(node: Node) {
        const parent = node.parentElement;
        if (parent && /\bai-fmt-dialogue-\w+\b/.test(parent.className)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    };
    const walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT, ttsFilter);
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

  // ── Speed Reader: auto-navigate + highlight ──

  // Auto-navigate to page containing the speed reader paragraph
  useEffect(() => {
    if (!speedReaderActive || speedReaderParaIndex < 0) return;
    const slider = sliderRef.current;
    if (!slider || stride <= 0) return;

    const paraEl = slider.querySelector(`[data-para-idx="${speedReaderParaIndex}"]`) as HTMLElement | null;
    if (!paraEl) return;

    const paraLeft = paraEl.offsetLeft;
    const targetPage = Math.floor(paraLeft / stride);
    if (targetPage !== currentPage && targetPage >= 0 && targetPage < totalPages) {
      onPageRequest?.(targetPage);
    }
  }, [speedReaderActive, speedReaderParaIndex, stride, currentPage, totalPages, onPageRequest]);

  // Speed reader paragraph highlight rects
  const [srParaRects, setSrParaRects] = useState<DOMRect[]>([]);

  useEffect(() => {
    if (!speedReaderActive || speedReaderParaIndex < 0) {
      setSrParaRects([]);
      return;
    }

    const slider = sliderRef.current;
    const clipper = slider?.parentElement;
    if (!slider || !clipper) { setSrParaRects([]); return; }

    const paraEl = slider.querySelector(`[data-para-idx="${speedReaderParaIndex}"]`);
    if (!paraEl) { setSrParaRects([]); return; }

    try {
      const range = document.createRange();
      range.selectNodeContents(paraEl);
      const clipperRect = clipper.getBoundingClientRect();
      const rects = Array.from(range.getClientRects()).map(r => new DOMRect(
        r.x - clipperRect.x,
        r.y - clipperRect.y,
        r.width,
        r.height,
      ));
      setSrParaRects(rects);
    } catch {
      setSrParaRects([]);
    }
  }, [speedReaderActive, speedReaderParaIndex, currentPage]);

  // Speed reader chunk underline: find the chunk text within the paragraph and underline it
  const [srChunkRects, setSrChunkRects] = useState<DOMRect[]>([]);

  useEffect(() => {
    if (!speedReaderActive || speedReaderParaIndex < 0 || !speedReaderChunkText) {
      setSrChunkRects([]);
      return;
    }

    const slider = sliderRef.current;
    const clipper = slider?.parentElement;
    if (!slider || !clipper) { setSrChunkRects([]); return; }

    const paraEl = slider.querySelector(`[data-para-idx="${speedReaderParaIndex}"]`);
    if (!paraEl) { setSrChunkRects([]); return; }

    // Walk text nodes to find the chunk text
    const walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
    const fullText: { node: Text; start: number }[] = [];
    let accumulated = "";

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const text = textNode.textContent ?? "";
      fullText.push({ node: textNode, start: accumulated.length });
      accumulated += text;
    }

    // Find the chunk text in the accumulated plain text, starting from the character offset
    const searchText = speedReaderChunkText.toLowerCase();
    const lowerAcc = accumulated.toLowerCase();
    const matchIdx = lowerAcc.indexOf(searchText, Math.max(0, speedReaderChunkOffset - 5));
    if (matchIdx === -1) { setSrChunkRects([]); return; }

    const matchEnd = matchIdx + speedReaderChunkText.length;

    // Find the text nodes and offsets for the match range
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    for (let i = 0; i < fullText.length; i++) {
      const { node, start } = fullText[i];
      const nodeEnd = start + (node.textContent?.length ?? 0);

      if (!startNode && matchIdx >= start && matchIdx < nodeEnd) {
        startNode = node;
        startOffset = matchIdx - start;
      }
      if (matchEnd > start && matchEnd <= nodeEnd) {
        endNode = node;
        endOffset = matchEnd - start;
        break;
      }
    }

    if (!startNode || !endNode) { setSrChunkRects([]); return; }

    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
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
      setSrChunkRects(rects);
    } catch {
      setSrChunkRects([]);
    }
  }, [speedReaderActive, speedReaderParaIndex, speedReaderChunkText, speedReaderChunkOffset, currentPage, fontSize, lineHeight]);

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
                gap: "10px",
                opacity: 0.7,
                fontFamily,
                fontSize: `${fontSize}px`,
              }}
            >
              <TypingDots className="text-brand" />
              <span className={theme.muted} style={{ fontSize: `${fontSize * 0.85}px` }}>
                Writing…
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
                className="flex items-center gap-3 text-brand"
                style={{ marginBottom: `${paraSpacing}px` }}
              >
                <span className="h-px flex-1 bg-current/20" />
                <Sparkles className="size-3.5 opacity-70" strokeWidth={1.75} />
                <span className="text-2xs font-semibold tracking-wider uppercase opacity-70">What happens next</span>
                <span className="h-px flex-1 bg-current/20" />
              </div>

              {/* Choice buttons (from AI) */}
              {simulateChoices.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: `${paraSpacing * 0.75}px` }}>
                  {simulateChoices.map((choice, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (onSimulateSubmit) {
                          onSimulateSubmit(choice.description);
                        }
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="group/choice focus-ring pressable flex items-start gap-3 rounded-lg bg-current/[0.04] px-3.5 py-3 text-left shadow-[inset_0_0_0_1px_color-mix(in_srgb,currentColor_10%,transparent)] transition-[background-color,box-shadow] duration-150 hover:bg-brand/10 hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-brand)_55%,transparent)]"
                      style={{ fontFamily }}
                    >
                      <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-2xs font-semibold text-brand transition-colors group-hover/choice:bg-brand group-hover/choice:text-brand-fg">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <div style={{ minWidth: 0 }} className="flex-1">
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
                      <ArrowRight className="mt-0.5 size-4 shrink-0 -translate-x-1 text-brand opacity-0 transition-[opacity,transform] duration-200 group-hover/choice:translate-x-0 group-hover/choice:opacity-100" strokeWidth={1.75} />
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
                    className={`focus-ring pressable flex items-center justify-center gap-2 self-center rounded-full px-4 py-2 transition-colors duration-150 hover:bg-current/[0.06] ${theme.muted}`}
                    style={{
                      fontFamily,
                      fontSize: `${fontSize * 0.8}px`,
                      fontWeight: 500,
                    }}
                  >
                    Continue story
                    <ArrowRight className="size-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              )}

              {/* Custom direction input */}
              <div
                className="flex items-center gap-2 rounded-full bg-current/[0.04] px-4 py-2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,currentColor_10%,transparent)] transition-shadow duration-150 focus-within:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-brand)_60%,transparent),0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_18%,transparent)]"
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

        {/* Speed reader paragraph highlight overlay */}
        {speedReaderActive && srParaRects.map((r, i) => (
          <div
            key={`sr-para-${i}`}
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

        {/* Speed reader chunk underline overlay */}
        {speedReaderActive && srChunkRects.map((r, i) => (
          <div
            key={`sr-chunk-${i}`}
            style={{
              position: "absolute",
              left: `${r.x - 2}px`,
              top: `${r.y + r.height - 3}px`,
              width: `${r.width + 4}px`,
              height: "2.5px",
              borderRadius: "1.5px",
              backgroundColor: "var(--accent-brand)",
              opacity: 0.7,
              pointerEvents: "none",
              transition: "left 0.1s ease, top 0.1s ease, width 0.1s ease",
              zIndex: 1,
            }}
          />
        ))}

        {/* Text selection toolbar */}
        <SelectionToolbar
          theme={theme}
          containerRef={clipperRef}
          onPlayFromParagraph={onPlayFromParagraph}
          onExplain={onExplain}
          onSaveQuote={onSaveQuote}
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

      {/* Comment popover — rendered outside the paginated slider, fixed to viewport */}
      {commentsEnabled && expandedCommentPara !== null && commentsByPara.get(expandedCommentPara) && (() => {
        const paraEl = outerRef.current?.querySelector(`[data-para-idx="${expandedCommentPara}"]`) as HTMLElement | null;
        const comments = commentsByPara.get(expandedCommentPara)!;
        if (!paraEl) return null;
        const rect = paraEl.getBoundingClientRect();
        return (
          <div
            className="glass-thick flex w-[280px] animate-pop-in flex-col overflow-hidden rounded-xl text-label"
            style={{
              position: "fixed", zIndex: 100,
              top: `${Math.min(rect.top, window.innerHeight - 260)}px`,
              left: `${Math.min(rect.right + 12, window.innerWidth - 320)}px`,
              maxHeight: "240px",
              transformOrigin: "0 0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-9 shrink-0 items-center gap-2 px-3">
              <MessageCircle className="size-3.5 text-label-tertiary" strokeWidth={1.75} />
              <span className="flex-1 text-section text-label-tertiary">Margin notes</span>
              <span className="text-2xs tabular-nums text-label-tertiary">{comments.length}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5">
              {comments.map((c, ci) => (
                <div key={ci} className="group/note flex items-start gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-fill-quaternary">
                  <CommentAvatar author={c.author} className="mt-px" />
                  <p className={c.author === "ai"
                    ? "flex-1 font-display text-sm leading-snug text-label"
                    : "flex-1 text-xs leading-relaxed text-label-secondary"}
                  >
                    {c.text}
                  </p>
                  {c.author === "user" && onDeleteComment && (
                    <button
                      type="button"
                      aria-label="Delete note"
                      onClick={() => onDeleteComment(expandedCommentPara, c.author, c.text)}
                      className="focus-ring pressable inline-flex size-5 shrink-0 items-center justify-center rounded-full text-label-tertiary opacity-0 transition-[opacity,background-color,color] group-hover/note:opacity-100 hover:bg-danger/15 hover:text-danger focus-visible:opacity-100"
                    ><X className="size-3" strokeWidth={2.25} /></button>
                  )}
                </div>
              ))}
            </div>
            {/* User input */}
            <div className="shrink-0 border-t border-separator p-1.5">
              <CommentInput
                value={commentInput}
                onChange={setCommentInput}
                onSubmit={() => {
                  if (onAddComment) {
                    onAddComment(expandedCommentPara, commentInput.trim());
                    setCommentInput("");
                  }
                }}
                onCancel={() => { setExpandedCommentPara(null); setCommentInput(""); }}
              />
            </div>
          </div>
        );
      })()}

      {/* Add comment popover — for paragraphs with no existing comments */}
      {commentsEnabled && addingCommentPara !== null && !commentsByPara.get(addingCommentPara) && (() => {
        const paraEl = outerRef.current?.querySelector(`[data-para-idx="${addingCommentPara}"]`) as HTMLElement | null;
        if (!paraEl) return null;
        const rect = paraEl.getBoundingClientRect();
        return (
          <div
            className="glass-thick flex w-[260px] animate-pop-in items-center rounded-xl p-1.5"
            style={{
              position: "fixed", zIndex: 100,
              top: `${Math.min(rect.top, window.innerHeight - 60)}px`,
              left: `${Math.min(rect.right + 12, window.innerWidth - 300)}px`,
              transformOrigin: "0 50%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <CommentInput
              value={commentInput}
              onChange={setCommentInput}
              onSubmit={() => {
                if (onAddComment) {
                  onAddComment(addingCommentPara, commentInput.trim());
                  setCommentInput("");
                  setAddingCommentPara(null);
                }
              }}
              onCancel={() => { setAddingCommentPara(null); setCommentInput(""); }}
            />
          </div>
        );
      })()}

      {/* Click-away overlay to close comment popovers */}
      {commentsEnabled && (expandedCommentPara !== null || addingCommentPara !== null) && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 99 }}
          onClick={() => { setExpandedCommentPara(null); setAddingCommentPara(null); setCommentInput(""); }}
        />
      )}

      <style>{`
        .comment-para-wrap:hover .comment-add-btn {
          opacity: 0.5 !important;
        }
        .comment-para-wrap:hover .comment-add-btn:hover {
          opacity: 0.8 !important;
        }
        .comment-badge:hover {
          opacity: 1 !important;
        }
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
          border-radius: 0.2em;
          text-decoration-line: underline;
          text-decoration-style: dotted;
          text-decoration-thickness: 1.5px;
          text-underline-offset: 0.22em;
          transition: text-decoration-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
        }
        .wiki-entity:hover {
          text-decoration-style: solid;
          background: color-mix(in srgb, var(--wiki-c) 12%, transparent);
          box-shadow: 0 0 0 0.12em color-mix(in srgb, var(--wiki-c) 12%, transparent);
        }
        .wiki-entity-blue, .wiki-entity-amber, .wiki-entity-emerald, .wiki-entity-rose, .wiki-entity-violet {
          color: color-mix(in srgb, var(--wiki-c) 62%, currentColor);
          text-decoration-color: color-mix(in srgb, var(--wiki-c) 40%, transparent);
        }
        .wiki-entity-blue { --wiki-c: var(--system-blue); }
        .wiki-entity-amber { --wiki-c: var(--system-orange); }
        .wiki-entity-emerald { --wiki-c: var(--system-green); }
        .wiki-entity-rose { --wiki-c: var(--system-pink); }
        .wiki-entity-violet { --wiki-c: var(--system-purple); }
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

// ── Comment avatar (AI = accent sparkle, you = success person) ──
function CommentAvatar({ author, className }: { author: string; className?: string }) {
  const ai = author === "ai";
  return (
    <span
      aria-label={ai ? "AI note" : "Your note"}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full shadow-xs ${
        ai ? "bg-brand text-brand-fg" : "bg-success text-brand-fg"
      } ${className ?? ""}`}
    >
      {ai
        ? <Sparkles className="size-3" strokeWidth={2.25} />
        : <User className="size-3" strokeWidth={2.25} />}
    </span>
  );
}

// ── Wiki tooltip type metadata ──────────────────────────
const typeTint = (v: string) => ({ color: v, bg: `color-mix(in srgb, ${v} 16%, transparent)` });
const WIKI_TYPE_META: Record<WikiEntryType, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  character: { icon: <User className="size-3" strokeWidth={2} />, label: "Character", ...typeTint("var(--system-blue)") },
  item: { icon: <Swords className="size-3" strokeWidth={2} />, label: "Item", ...typeTint("var(--system-orange)") },
  location: { icon: <MapPin className="size-3" strokeWidth={2} />, label: "Location", ...typeTint("var(--system-green)") },
  event: { icon: <Flame className="size-3" strokeWidth={2} />, label: "Event", ...typeTint("var(--system-pink)") },
  concept: { icon: <Lightbulb className="size-3" strokeWidth={2} />, label: "Concept", ...typeTint("var(--system-purple)") },
};

/**
 * Hover card for a wiki entity — macOS-style glass card: type badge,
 * serif name, short description, significance meter, open-in-wiki action.
 */
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
    // Grow out of the entity the card is anchored to
    transformOrigin: `${data.arrowX + 5}px ${data.placement === "above" ? "100%" : "0%"}`,
  };

  if (data.placement === "above") {
    style.bottom = `${window.innerHeight - data.y}px`;
  } else {
    style.top = `${data.y}px`;
  }

  return (
    <div
      ref={tooltipRef}
      className="glass-thick grain relative animate-pop-in overflow-hidden rounded-xl text-label"
      style={style}
    >
      {/* Type-tinted wash along the top edge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16"
        style={{ background: `linear-gradient(to bottom, ${meta.bg}, transparent)` }}
      />

      <div className="relative space-y-2.5 p-3.5">
        {/* Type badge + significance */}
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-2xs font-semibold"
            style={{ background: meta.bg, color: meta.color }}
          >
            {meta.icon}
            {meta.label}
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-0.5" aria-label={`Significance ${data.significance} of 4`}>
            {Array.from({ length: 4 }, (_, k) => (
              <span
                key={k}
                className="h-1.5 w-3 rounded-full"
                style={{ background: k < data.significance ? meta.color : "var(--fill-secondary)" }}
              />
            ))}
          </span>
        </div>

        {/* Name */}
        <h3 className="truncate font-display text-lg leading-tight font-semibold text-label">{data.name}</h3>

        {/* Short description */}
        {data.shortDescription && (
          <p className="line-clamp-3 text-xs leading-relaxed text-label-secondary">
            {data.shortDescription}
          </p>
        )}

        {/* Status + Open Wiki */}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="inline-flex h-5 items-center rounded-full bg-fill-tertiary px-2 text-2xs font-medium text-label-secondary capitalize">
            {data.status}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={openWiki}
            className="focus-ring pressable inline-flex h-7 items-center gap-1.5 rounded-full bg-fill-tertiary px-3 text-xs font-medium text-label transition-colors hover:bg-fill-secondary"
          >
            Open in Wiki
            <ExternalLink className="size-3 text-label-secondary" strokeWidth={2} />
          </button>
        </div>
      </div>
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

/** Width of the "0" glyph (CSS `ch`) for a font, in px. Falls back to 0.5em. */
let chCanvas: CanvasRenderingContext2D | null = null;
function measureCh(fontFamily: string, fontSize: number): number {
  try {
    if (!chCanvas && typeof document !== "undefined") chCanvas = document.createElement("canvas").getContext("2d");
    if (chCanvas) {
      chCanvas.font = `${fontSize}px ${fontFamily}`;
      const w = chCanvas.measureText("0").width;
      if (w > 0) return w;
    }
  } catch { /* fall through */ }
  return fontSize * 0.5;
}
