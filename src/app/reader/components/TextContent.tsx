"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { User, MessageCircle, Plus, X, Sparkles, ArrowRight } from "lucide-react";
import type { RenderedPara } from "@shared/pipeline/types";
import type { BranchChoice } from "@shared/assistant/types";
import { BLOCK_ELEMENTS } from "@shared/pipeline/html";
import { wordRangesInNodes } from "@shared/pipeline/speech";
import { TypingDots } from "@/components/ui/typing-dots";
import type { SelectionActions } from "@/lib/assistant/selection";
import { AI_FORMATTING_STYLES } from "@/lib/ai-formatting-css";
import { CommentInput } from "./CommentInput";
import type { ThemeClasses, ReadingTheme, TTSStatus, TTSHighlightMode } from "../lib/types";
import { SelectionToolbar } from "./SelectionToolbar";

/** A margin note on a paragraph: AI (artifact, read-only) or the user's (annotation). */
export interface ReaderComment {
  key: string;
  author: "ai" | "user";
  text: string;
  /** Annotation id (user comments). */
  id?: number;
}

interface TextContentProps {
  chapterTitle: string;
  /** The rendered chapter's paragraphs (`RenderedChapter.paras`, same order as the source).
   *  Hidden (dropped/merged) paragraphs are skipped. `data-para-idx` = index into this array. */
  paras: RenderedPara[];
  chapterId: string | null;
  /** Show only paragraphs up to this index (a "what if" branch point), then `extraParagraphs`. */
  truncateAfter?: number | null;
  /** Safe html (sanitized in main, lexicon applied) appended after the paragraphs. */
  extraParagraphs?: string[];
  /** Live preview of a branch continuation being written. */
  streamText?: string;
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
  /** First and last paragraph index visible on the current page. */
  onVisibleRangeChange?: (first: number, last: number) => void;
  onPageRequest?: (page: number) => void;
  /** Turn to the page showing this paragraph index, then call `onRevealed`. */
  revealParaIndex?: number | null;
  onRevealed?: () => void;
  ttsStatus?: TTSStatus;
  /** Paragraph index being read aloud (-1 = none). */
  ttsParagraphIndex?: number;
  /** DOM word index (speech token → `domWord`) in that paragraph. */
  ttsActiveWordIndex?: number;
  /** Paragraphs up to this index are marked read (-1 = none). */
  ttsHighWaterMark?: number;
  ttsHighlightMode?: TTSHighlightMode;
  ttsShowReadMark?: boolean;
  onPlayFromParagraph?: (paraIndex: number) => void;
  readingTheme?: ReadingTheme;
  filePath: string;
  chapterIndex: number;
  /** Entity highlights are in the html (pipeline layer 5/6); these handle clicks on them. */
  onEntityClick?: (entityId: string, rect: DOMRect, paraIndex: number) => void;
  onEntityContextMenu?: (entityId: string, x: number, y: number, paraIndex: number) => void;
  simulateMode?: boolean;
  simulateInputVisible?: boolean;
  simulateGenerating?: boolean;
  onSimulateSubmit?: (text: string) => void;
  branchEntityName?: string;
  simulateChoices?: BranchChoice[];
  /** Show margin-note badges and the "add note" affordance. */
  commentsEnabled?: boolean;
  /** Comments by paragraph index (already resolved through merges/drops). */
  commentsByPara?: Map<number, ReaderComment[]>;
  onAddComment?: (paraIndex: number, text: string) => void;
  onDeleteComment?: (comment: ReaderComment) => void;
  selectionActions: SelectionActions;
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
 *   └─ clipper — clipped to exactly pageWidth × contentHeight (plus the badge gutter on the right), mx-auto
 *      └─ slider — position:absolute, column-width layout, translateX with CSS transition
 */

/** Comment badges sit this far into the column gap / page margin (badge 10px off the column + up to 34px). */
const BADGE_GUTTER = 44;

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

const EMPTY_COMMENTS = new Map<number, ReaderComment[]>();

/**
 * DOM range of word `wordIndex` in a paragraph, counted exactly like the speech projection:
 * text nodes in page order, `[data-tts-skip]` subtrees excluded, `<br>`/block boundaries are
 * whitespace (`wordRangesInNodes`, AI_AUDIT S2-9).
 */
function wordRangeIn(paraEl: Element, wordIndex: number): Range | null {
  const root = paraEl.querySelector("[data-para-content]") ?? paraEl;
  const nodes: (Text | null)[] = [];
  const texts: string[] = [];
  const sep = () => { nodes.push(null); texts.push("\n"); };
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      nodes.push(n as Text);
      texts.push(n.textContent ?? "");
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    if (el.hasAttribute("data-tts-skip")) return;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") { sep(); return; }
    const block = BLOCK_ELEMENTS.has(tag);
    if (block) sep();
    for (const c of Array.from(el.childNodes)) walk(c);
    if (block) sep();
  };
  for (const c of Array.from(root.childNodes)) walk(c);
  const ranges = wordRangesInNodes(texts, wordIndex);
  if (ranges.length === 0) return null;
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  const a = nodes[first.node];
  const b = nodes[last.node];
  if (!a || !b) return null;
  const r = new Range();
  r.setStart(a, first.start);
  r.setEnd(b, last.end);
  return r;
}

export function TextContent({
  chapterTitle,
  paras,
  chapterId,
  truncateAfter = null,
  extraParagraphs = [],
  streamText = "",
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
  onVisibleRangeChange,
  onPageRequest,
  revealParaIndex = null,
  onRevealed,
  ttsStatus,
  ttsParagraphIndex = -1,
  ttsActiveWordIndex = -1,
  ttsHighWaterMark = -1,
  ttsHighlightMode = "both",
  ttsShowReadMark = true,
  onPlayFromParagraph,
  readingTheme: readingThemeProp,
  filePath,
  chapterIndex,
  onEntityClick,
  onEntityContextMenu,
  simulateMode = false,
  simulateInputVisible = false,
  simulateGenerating = false,
  onSimulateSubmit,
  branchEntityName,
  simulateChoices = [],
  commentsEnabled = false,
  commentsByPara = EMPTY_COMMENTS,
  onAddComment,
  onDeleteComment,
  selectionActions,
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

  // Comment state
  const [expandedCommentPara, setExpandedCommentPara] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [addingCommentPara, setAddingCommentPara] = useState<number | null>(null);

  // What the page shows: visible paragraphs (up to a branch point), by index.
  const shown = useMemo(() => {
    const out: { i: number; p: RenderedPara }[] = [];
    paras.forEach((p, i) => {
      if (p.hidden) return;
      if (truncateAfter !== null && i > truncateAfter) return;
      out.push({ i, p });
    });
    // The parser often repeats the chapter title as the first paragraph: the heading shows it.
    if (out.length > 0 && isTitleParagraph(out[0].p.html, chapterTitle)) out.shift();
    return out;
  }, [paras, truncateAfter, chapterTitle]);

  const hasAiFormatting = useMemo(
    () => shown.some(({ p }) => p.html.includes("ai-fmt-")) || extraParagraphs.some((h) => h.includes("ai-fmt-")),
    [shown, extraParagraphs],
  );

  // Auto-focus simulate input when it becomes visible
  useEffect(() => {
    if (simulateInputVisible && simInputRef.current) {
      setTimeout(() => simInputRef.current?.focus(), 300);
    }
  }, [simulateInputVisible, extraParagraphs.length]);

  const [pageWidth, setPageWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentFitsSingleCol, setContentFitsSingleCol] = useState(false);
  const singleColFrozenRef = useRef(false);
  const [slideClass] = useState<string | null>(null);

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
  }, [measure, shown, extraParagraphs, streamText, fontFamily, fontSize, lineHeight, paraSpacing]);

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

  // Report the paragraphs visible on the current page (bookmarks, frontier, "read from here").
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider || stride <= 0 || !onVisibleRangeChange) return;
    const pageStart = currentPage * stride;
    const pageEnd = pageStart + pageWidth;
    let first = -1;
    let last = -1;
    for (const el of slider.querySelectorAll<HTMLElement>("[data-para-idx]")) {
      const left = el.offsetLeft;
      const right = left + el.offsetWidth;
      if (right > pageStart && left < pageEnd) {
        const idx = parseInt(el.getAttribute("data-para-idx") ?? "0", 10);
        if (first < 0) first = idx;
        last = idx;
      } else if (first >= 0) {
        break;
      }
    }
    onVisibleRangeChange(Math.max(0, first), Math.max(0, last));
  }, [currentPage, stride, pageWidth, onVisibleRangeChange, shown, totalPages]);

  // Reveal a paragraph (bookmark, citation, branch): turn to its page once laid out.
  useEffect(() => {
    if (revealParaIndex === null || revealParaIndex < 0 || stride <= 0) return;
    const slider = sliderRef.current;
    const el = slider?.querySelector<HTMLElement>(`[data-para-idx="${revealParaIndex}"]`);
    if (!el) return;
    const page = Math.floor(el.offsetLeft / stride);
    if (page >= 0 && page < totalPages) {
      onPageRequest?.(page);
      onRevealed?.();
    }
  }, [revealParaIndex, stride, totalPages, onPageRequest, onRevealed]);

  // Reset single-col detection on chapter change
  useEffect(() => {
    singleColFrozenRef.current = false;
    setContentFitsSingleCol(false);
  }, [chapterId]);

  // ── Content processing ──────────────────────────────

  const showTitle =
    chapterTitle && !/^chapter\s+\d+$/i.test(chapterTitle.trim());

  const firstTextIndex = useMemo(() => {
    for (const { i, p } of shown) {
      const h = p.html;
      if (h === "<p></p>" || h.trim() === "" || p.kind === "image") continue;
      if (h.includes("<img ") && !h.includes("<p")) continue;
      if (/<h[1-6][^>]*>/i.test(h)) continue;
      const text = p.text.trim();
      if (text.length < 80 && /^(chapter|part|story|book|prologue|epilogue|volume)\s/i.test(text)) continue;
      return i;
    }
    return -1;
  }, [shown]);

  const buildFirstParagraph = useCallback((html: string) => {
    const text = stripTags(html);
    if (!text || text.length === 0) return html;
    // True drop cap: a float spanning exactly three lines, so line 1 keeps
    // its normal height and both columns share one baseline grid.
    const linePx = fontSize * lineHeight;
    const capSize = Math.round(linePx * 3);
    const capBox = Math.max(1, capSize - 2); // stay inside 3 lines — never indent line 4
    return html.replace(
      /(<p[^>]*>(?:\s*<[^/][^>]*>)*)([A-Za-zÀ-ɏ])/,
      `$1<span class="reader-drop-cap" style="float:left;font-size:${capSize}px;line-height:${capBox}px;height:${capBox}px;font-weight:600;margin:0 0.08em 0 0">${"$2"}</span>`,
    );
  }, [fontSize, lineHeight]);

  const paragraphsJSX = useMemo(() => {
    const isRead = (idx: number) => ttsShowReadMark && ttsHighWaterMark >= 0 && (
      ttsParagraphIndex >= 0
        ? (idx < ttsParagraphIndex && idx <= ttsHighWaterMark)
        : idx <= ttsHighWaterMark
    );
    // Speed reader keeps the whole page in view and guides the eye with contrast: the paragraph
    // being read is full ink, what's ahead is legible context, what's done steps back.
    const srOpacity = (idx: number): number | undefined => {
      if (!speedReaderActive || speedReaderParaIndex < 0) return undefined;
      if (idx === speedReaderParaIndex) return 1;
      return idx < speedReaderParaIndex ? 0.28 : 0.5;
    };
    const opacityOf = (idx: number) => srOpacity(idx) ?? (isRead(idx) ? 0.45 : undefined);
    const body = shown.map(({ i, p }, k) => {
      const html = p.html;
      const isEmpty = html === "<p></p>" || html.trim() === "";
      if (isEmpty) return <div key={p.id} data-para-idx={i} data-para-id={p.id} style={{ height: `${paraSpacing}px` }} />;

      if (p.kind === "image" || (html.includes("<img ") && !html.includes("<p"))) {
        return (
          <div
            key={p.id}
            data-para-idx={i}
            data-para-id={p.id}
            className="reader-image"
            style={{ marginBottom: `${paraSpacing}px`, breakInside: "avoid" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }

      const isFirst = i === firstTextIndex;
      const renderedHtml = isFirst ? buildFirstParagraph(html) : html;
      const paraComments = commentsByPara.get(i);
      const hasComments = commentsEnabled && !!paraComments && paraComments.length > 0;

      return (
        <div
          key={p.id}
          data-para-idx={i}
          data-para-id={p.id}
          className="comment-para-wrap"
          style={{
            marginBottom: `${paraSpacing}px`,
            textIndent: !isFirst && k > 0 ? `${fontSize * 1.5}px` : undefined,
            opacity: opacityOf(i),
            transition: "opacity 0.45s cubic-bezier(0.32, 0.72, 0, 1)",
            position: "relative",
          }}
        >
          <span data-para-content dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          {/* Comment indicator — absolutely positioned, zero layout impact */}
          {hasComments && (
            <span
              className="comment-badge"
              data-comment-para={i}
              onClick={(e) => {
                e.stopPropagation();
                setExpandedCommentPara(prev => prev === i ? null : i);
                setAddingCommentPara(null);
                setCommentInput("");
              }}
              style={{
                position: "absolute", left: "calc(100% + 10px)", right: "auto", top: "2px",
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
          {commentsEnabled && !hasComments && onAddComment && (
            <span
              className="comment-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                setAddingCommentPara(prev => prev === i ? null : i);
                setExpandedCommentPara(null);
                setCommentInput("");
              }}
              style={{
                position: "absolute", left: "calc(100% + 10px)", right: "auto", top: "2px",
                display: "inline-flex", alignItems: "center",
                cursor: "pointer", opacity: 0, transition: "opacity 0.15s ease",
                zIndex: 5,
              }}
            >
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-current/10 shadow-xs">
                <Plus className="size-3.5" strokeWidth={2} />
              </span>
            </span>
          )}
        </div>
      );
    });
    // A "what if" branch: the generated continuation follows the branch point.
    const extra = extraParagraphs.map((html, k) => {
      const idx = paras.length + k;
      return (
        <div
          key={`branch-${k}`}
          data-para-idx={idx}
          className="reader-branch-para"
          style={{
            marginBottom: `${paraSpacing}px`,
            textIndent: `${fontSize * 1.5}px`,
            opacity: opacityOf(idx),
            transition: "opacity 0.45s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <span data-para-content dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      );
    });
    return [...body, ...extra];
  }, [
    speedReaderActive,
    speedReaderParaIndex,
    shown,
    paras.length,
    extraParagraphs,
    firstTextIndex,
    fontSize,
    paraSpacing,
    ttsShowReadMark,
    ttsHighWaterMark,
    ttsParagraphIndex,
    commentsEnabled,
    commentsByPara,
    onAddComment,
    buildFirstParagraph,
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

  // ── Entity highlights (pipeline-decorated `[data-wiki-id]`) → EntityCard / context menu ──
  useEffect(() => {
    const clipper = clipperRef.current;
    if (!clipper || (!onEntityClick && !onEntityContextMenu)) return;
    const entityAt = (e: MouseEvent) => (e.target as HTMLElement).closest<HTMLElement>("[data-wiki-id]");
    const handleClick = (e: MouseEvent) => {
      const target = entityAt(e);
      const id = target?.getAttribute("data-wiki-id");
      if (!target || !id || !onEntityClick) return;
      // A click that ends a text selection is a selection, not a lookup.
      if (!(window.getSelection()?.isCollapsed ?? true)) return;
      e.stopPropagation();
      const paraEl = target.closest<HTMLElement>("[data-para-idx]");
      onEntityClick(id, target.getBoundingClientRect(), paraEl ? parseInt(paraEl.getAttribute("data-para-idx") ?? "0", 10) : 0);
    };
    const handleContextMenu = (e: MouseEvent) => {
      const target = entityAt(e);
      const id = target?.getAttribute("data-wiki-id");
      if (!target || !id || !onEntityContextMenu) return;
      e.preventDefault();
      e.stopPropagation();
      const paraEl = target.closest<HTMLElement>("[data-para-idx]");
      onEntityContextMenu(id, e.clientX, e.clientY, paraEl ? parseInt(paraEl.getAttribute("data-para-idx") ?? "0", 10) : 0);
    };
    clipper.addEventListener("click", handleClick);
    clipper.addEventListener("contextmenu", handleContextMenu);
    return () => {
      clipper.removeEventListener("click", handleClick);
      clipper.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [onEntityClick, onEntityContextMenu]);

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

    try {
      const range = wordRangeIn(paraEl, ttsActiveWordIndex);
      if (!range) { setWordRects([]); return; }
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
  }, [showWordHighlight, ttsStatus, ttsParagraphIndex, ttsActiveWordIndex, fontSize, lineHeight, shown]);

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

    try {
      const range = wordRangeIn(paraEl, ttsActiveWordIndex);
      if (!range) { setBothWordRects([]); return; }
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
  }, [showWordBold, ttsStatus, ttsParagraphIndex, ttsActiveWordIndex, fontSize, lineHeight, shown]);

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
          // Clip to the page, but let the right column's comment badges sit in the margin beside
          // it (they live in the gutter, never on glyphs). The next page starts a 48px gap away.
          clipPath: `inset(0 -${BADGE_GUTTER}px 0 0)`,
          position: "relative",
        }}
      >
        {hasAiFormatting && <style>{AI_FORMATTING_STYLES}</style>}
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
                <span className="text-xs font-medium opacity-70">What happens next</span>
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

        {/* Speed reader pacer — a soft highlighter band that glides phrase to phrase. One band
            per line box; keyed by line so a phrase that moves within a line slides, and one that
            wraps to the next line travels down to it. */}
        {speedReaderActive && srChunkRects.map((r, i) => (
          <div
            key={`sr-chunk-${i}`}
            aria-hidden
            style={{
              position: "absolute",
              left: `${r.x - 3}px`,
              top: `${r.y}px`,
              width: `${r.width + 6}px`,
              height: `${r.height}px`,
              borderRadius: "5px",
              backgroundColor: "color-mix(in srgb, var(--accent-brand) 20%, transparent)",
              boxShadow: "inset 0 -2px 0 0 color-mix(in srgb, var(--accent-brand) 65%, transparent)",
              pointerEvents: "none",
              transition: "left 0.18s cubic-bezier(0.32, 0.72, 0, 1), top 0.18s cubic-bezier(0.32, 0.72, 0, 1), width 0.18s cubic-bezier(0.32, 0.72, 0, 1)",
              zIndex: 0,
            }}
          />
        ))}

        {/* Text selection toolbar */}
        <SelectionToolbar
          theme={theme}
          containerRef={clipperRef}
          filePath={filePath}
          chapterId={chapterId}
          chapterIndex={chapterIndex}
          actions={selectionActions}
          onPlayFromParagraph={onPlayFromParagraph}
        />

      </div>

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
              <span className="text-2xs tabular-nums text-label-secondary">{comments.length}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5">
              {comments.map((c) => (
                <div key={c.key} className="group/note flex items-start gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-fill-quaternary">
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
                      onClick={() => onDeleteComment(c)}
                      className="focus-ring pressable inline-flex size-5 shrink-0 items-center justify-center rounded-full text-label-tertiary opacity-0 transition-[opacity,background-color,color] group-hover/note:opacity-100 hover:bg-danger/15 hover:text-danger focus-visible:opacity-100"
                    ><X className="size-3.5" strokeWidth={2} /></button>
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
        /* Saved quotes (pipeline "highlight" annotations): a quiet accent underline wash. */
        .codex-hl-quote {
          background: color-mix(in srgb, var(--accent-brand) 10%, transparent);
          color: inherit;
          border-radius: 0.15em;
          box-shadow: inset 0 -0.12em 0 color-mix(in srgb, var(--accent-brand) 35%, transparent);
        }
        .codex-hl-vocab {
          background: transparent;
          color: inherit;
          text-decoration: underline dotted color-mix(in srgb, var(--accent-brand) 50%, transparent);
          text-underline-offset: 0.22em;
        }
        .codex-search { background: color-mix(in srgb, var(--system-yellow, var(--accent-brand)) 30%, transparent); color: inherit; }
        /* "What if" continuation: set off from the book's own text by a hairline in the margin. */
        .reader-branch-para { box-shadow: inset 2px 0 0 color-mix(in srgb, var(--accent-brand) 35%, transparent); padding-inline-start: 0.75em; }
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
        ? <Sparkles className="size-3.5" strokeWidth={2} />
        : <User className="size-3.5" strokeWidth={2} />}
    </span>
  );
}

/** The parser often repeats the chapter title as the first paragraph. */
function isTitleParagraph(html: string, title: string): boolean {
  if (!title) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  const normFirst = norm(stripTags(html));
  const normTitle = norm(title);
  if (!normFirst) return false;
  if (normFirst === normTitle || normTitle.includes(normFirst) || normFirst.includes(normTitle)) return true;
  const stripped = (s: string) => s.replace(/^(chapter|part|story)\s+(\d+|[ivxlcdm]+)\s*[:\-–—]?\s*/i, "").trim();
  return stripped(normFirst) === stripped(normTitle);
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
