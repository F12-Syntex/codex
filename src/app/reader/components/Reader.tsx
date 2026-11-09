"use client";

/**
 * The reader (Phase 2c cutover). One source of rendered text and one AI path:
 *
 *   useChapterPipeline  → RenderedChapter (source → rewrite → format → sanitize → lexicon →
 *                         entities ≤ frontier → decorations → page/speech projections)
 *   useChapterArtifacts → orchestrator `ensure` for the chapter (+ prefetch), per-kind status
 *   useBookAIPrefs      → per-book feature switches (AI Tools panel)
 *
 * The page, the speed reader and TTS all read the same RenderedChapter, so they can't disagree;
 * word replacements happen once, in the lexicon layer. Every user anchor (comments, quotes,
 * bookmarks, branch points, read marks) is a ParaRef resolved with `resolveAnchor`, so it stays
 * on its paragraph whichever variant is showing. The reader reports its position as you read,
 * which moves the spoiler frontier the wiki, entity cards and assistant are gated by.
 */

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { AlertCircle, Loader2, Quote } from "lucide-react";
import type { Annotation, ParaId, ParaRef, RenderedChapter } from "@shared/pipeline/types";
import type { EntityIndexItem, WikiEntryType } from "@shared/knowledge/types";
import { resolveAnchor } from "@shared/pipeline/build";
import { applyLexicon, applyLexiconText } from "@shared/pipeline/lexicon";
import { buildSpeech } from "@shared/pipeline/speech";
import { getThemeClasses } from "../lib/theme";
import type { CustomFont } from "../lib/types";
import { useReaderSettings } from "../hooks/useReaderSettings";
import { useBookmarks } from "../hooks/useBookmarks";
import { useTTS, isSpeakable, type TTSItem } from "../hooks/useTTS";
import { useTTSMetrics } from "../hooks/useTTSMetrics";
import { useChapterPipeline } from "../hooks/useChapterPipeline";
import { useReaderAnchors } from "../hooks/useReaderAnchors";
import { useSimulateBranch } from "../hooks/useSimulateBranch";
import { ReaderHeader } from "./ReaderHeader";
import { FOOTER_HEIGHT, ReaderFooter } from "./ReaderFooter";
import { TOCSidebar } from "./TOCSidebar";
import { TTSPanel } from "./TTSPanel";
import { TextSettingsPanel } from "./TextSettingsPanel";
import { BookTableOfContents, isTOCChapter } from "./BookTableOfContents";
import { TextContent, type ReaderComment } from "./TextContent";
import { SpeedReaderView } from "./SpeedReaderView";
import { EntityCard } from "./EntityCard";
import { EntityContextMenu } from "./EntityContextMenu";
import { RecapSheet } from "./RecapSheet";
import { AIToolsPanel, BulkDock } from "./ai-tools";
import { AssistantLauncher, DefinePopover } from "@/components/assistant";
import { openAssistant } from "@/lib/assistant/open";
import { createSelectionActions, type SelectionPayload } from "@/lib/assistant/selection";
import { useBookAIPrefs, useChapterArtifacts, useChapterTitles } from "@/lib/ai/chapters";
import { useAISettings } from "@/lib/ai/useAISettings";
import { hasRpc } from "@/lib/ai/rpc";
import { onAIEvent } from "@/lib/ai/events";
import { knowledge } from "@/lib/knowledge/bridge";
import { useEntityIndex, useFrontier } from "@/lib/knowledge/useKnowledge";
import { buildChapterLabels, fmtCh, type ChapterLabels } from "@/lib/chapter-labels";
import { chunkParagraphs } from "@/lib/speed-reader-engine";

/** Side panels float over the page; the text column never reflows when one opens, so the
 *  page count and the line you were reading stay put. The right edge is ONE inspector slot
 *  (§13.11): AI Tools and the Assistant take turns in it, never both. */

type Rect = { top: number; left: number; bottom: number; right: number; width: number; height: number };
const rectOf = (r: { x: number; y: number; width: number; height: number }): Rect => ({
  top: r.y, left: r.x, bottom: r.y + r.height, right: r.x + r.width, width: r.width, height: r.height,
});

interface EntityCardState {
  entityId: string | null;
  name?: string;
  rect: Rect | DOMRect;
  /** Paragraph the entity was clicked in (branch point for "Simulate"). */
  paraIndex?: number;
}

interface ReaderProps {
  filePath: string;
  /** Kept for the URL contract; main resolves the format itself (`book:content`). */
  format: string;
  title: string;
  author: string;
  /** Open at this paragraph instead of the saved position (`book:reveal` with no reader open). */
  initialReveal?: { chapterId: string; paraId: ParaId } | null;
}

const NO_ANNOTATIONS: Annotation[] = [];

export function Reader({ filePath, title, author, initialReveal = null }: ReaderProps) {
  const [chapterLabels, setChapterLabels] = useState<ChapterLabels>({});
  const [currentChapter, setCurrentChapter] = useState(0);
  const [customFonts] = useState<CustomFont[]>([]);

  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  /** Chapter whose page count `totalPages` was measured for (-1 = not measured since the change). */
  const [measuredChapter, setMeasuredChapter] = useState(-1);
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 0]);
  const [showTOC, setShowTOC] = useState(false);
  const [showTTS, setShowTTS] = useState(false);
  const [showTextSettings, setShowTextSettings] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [immersiveVisible, setImmersiveVisible] = useState(true);
  const [reveal, setReveal] = useState<{ chapterIndex: number; paraId: ParaId } | null>(null);

  // Popovers over the text
  const [entityCard, setEntityCard] = useState<EntityCardState | null>(null);
  const [entityMenu, setEntityMenu] = useState<{ entity: EntityIndexItem; x: number; y: number; paraIndex: number } | null>(null);
  const [define, setDefine] = useState<SelectionPayload | null>(null);

  // Quote toast
  const [quoteToastVisible, setQuoteToastVisible] = useState(false);
  const quoteToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Speed Reader state
  const [speedReaderActive, setSpeedReaderActive] = useState(false);
  const [srChunkParaIndex, setSrChunkParaIndex] = useState(-1);
  const [srChunkText, setSrChunkText] = useState("");
  const [srChunkOffset, setSrChunkOffset] = useState(0);

  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoPlayChapter, setAutoPlayChapter] = useState<number | null>(null);
  const [showBranchList, setShowBranchList] = useState(false);

  const { settings, updateSetting, isLoaded } = useReaderSettings();
  const theme = getThemeClasses(settings.readingTheme);

  // ── AI: per-book prefs, chapter artifacts (orchestrator ensure), settings ──────────
  const { prefs } = useBookAIPrefs(filePath);
  const { settings: aiSettings } = useAISettings();
  const readAloudOriginal = aiSettings?.readAloud === "original";
  const anchorsState = useReaderAnchors(filePath);
  const { anchors, comments: userComments, readMarks } = anchorsState;

  // Pipeline inputs. Saved quotes are highlighted where they are, in any variant.
  const [pipelineChapterId, setPipelineChapterId] = useState<string | null>(null);
  const quoteAnnotations = useMemo<Annotation[]>(() => {
    const out: Annotation[] = [];
    for (const a of anchors) {
      if (a.kind !== "quote" || a.chapterId !== pipelineChapterId || !a.quote) continue;
      out.push({ kind: "highlight", paraId: a.paraId, quote: a.quote, id: `q${a.refId}`, tone: "quote" });
    }
    return out.length ? out : NO_ANNOTATIONS;
  }, [anchors, pipelineChapterId]);

  const pipeline = useChapterPipeline(filePath, currentChapter, {
    showRewrite: !!prefs && prefs.rewrite !== "off",
    showFormat: !!prefs?.formatting,
    entities: !!prefs?.knowledge,
    withOriginal: readAloudOriginal,
    annotations: quoteAnnotations,
  });
  const { book, lexicon } = pipeline;
  const chapters = useMemo(() => book?.chapters ?? [], [book]);
  const totalChapters = chapters.length;
  const ready = pipeline.chapterIndex === currentChapter && pipeline.status === "ready";
  const chapter: RenderedChapter | null = ready ? pipeline.chapter : null;
  const chapterId = ready ? pipeline.source?.id ?? null : null;
  const isImageBook = book?.isImageBook ?? false;
  const isLoading = !book && pipeline.status !== "error";

  useEffect(() => {
    if (chapterId) setPipelineChapterId(chapterId);
  }, [chapterId]);

  // Queue this chapter's AI work (and prefetch the next) through the orchestrator.
  useChapterArtifacts(filePath, currentChapter, { ensure: true, totalChapters: totalChapters || undefined });

  // Prefs decide which layers `chapters:artifacts` serves: re-read them when prefs change.
  const prefsKey = prefs ? JSON.stringify(prefs) : "";
  const { refresh: refreshPipeline } = pipeline;
  useEffect(() => {
    if (prefsKey) refreshPipeline("artifacts");
  }, [prefsKey, refreshPipeline]);

  const aiTitles = useChapterTitles(filePath);
  const displayTitles = useMemo(() => {
    const out: Record<number, string> = {};
    for (const [i, t] of Object.entries(aiTitles)) out[Number(i)] = applyLexiconText(t, lexicon, "display");
    return out;
  }, [aiTitles, lexicon]);

  const rawChapterTitle = chapters[currentChapter]?.title ?? `Chapter ${currentChapter + 1}`;
  const aiTitle = pipeline.chapterIndex === currentChapter ? pipeline.artifacts?.title : undefined;
  // AI output shown to the user passes through the display lexicon too (§4.5 contracts).
  const chapterTitle = applyLexiconText(aiTitle || rawChapterTitle, lexicon, "display");

  const chapterLabel = useCallback((i: number) => `Ch. ${fmtCh(i, chapterLabels) ?? i + 1}`, [chapterLabels]);

  // ── Spoiler frontier + entities ≤ frontier ───────────────────────────────────────
  const frontier = useFrontier(filePath);
  const frontierLabel = frontier && frontier.chapterIndex >= 0
    ? `Chapter ${fmtCh(frontier.chapterIndex, chapterLabels) ?? frontier.chapterIndex + 1}`
    : undefined;
  const { data: entityIndex } = useEntityIndex(prefs?.knowledge ? filePath : null);
  const entityById = useMemo(() => new Map((entityIndex ?? []).map((e) => [e.id, e])), [entityIndex]);

  // ── "What if" branches (anchored by ParaRef, stored in main) ─────────────────────
  const sim = useSimulateBranch(filePath, chapter, { chapterIndex: currentChapter });
  const branchHere = !!sim.active && sim.truncateAt !== null;
  const branchLockChapter = sim.active ? sim.active.chapterIndex : null;
  const branchSegmentsHtml = useMemo(
    () => (branchHere ? sim.segments.flatMap((s) => s.paragraphs) : []),
    [branchHere, sim.segments],
  );
  const extraParagraphs = useMemo(() => {
    const segs = branchSegmentsHtml.map((h) => applyLexicon(h, lexicon, "display"));
    if (branchHere && sim.streamText) {
      for (const para of sim.streamText.split(/\n{2,}/)) {
        const t = para.trim();
        if (t) segs.push(`<p>${escapeHtml(applyLexiconText(t, lexicon, "display"))}</p>`);
      }
    }
    return segs;
  }, [branchSegmentsHtml, branchHere, sim.streamText, lexicon]);

  // ── TTS over the speech projection ───────────────────────────────────────────────
  const ttsChapter = readAloudOriginal && pipeline.original ? pipeline.original : chapter;
  const ttsItems = useMemo<TTSItem[]>(() => {
    if (!ttsChapter) return [];
    const out: TTSItem[] = [];
    ttsChapter.paras.forEach((p, i) => {
      if (p.hidden || !p.speech) return;
      if (branchHere && sim.truncateAt !== null && i > sim.truncateAt) return;
      out.push({ id: p.id, index: i, text: p.speech.text, tokens: p.speech.tokens, covers: p.covers });
    });
    branchSegmentsHtml.forEach((h, k) => {
      const sp = buildSpeech(h, lexicon);
      if (sp) out.push({ id: `branch:${sim.active?.id}:${k}`, index: ttsChapter.paras.length + k, text: sp.text, tokens: sp.tokens });
    });
    return out;
  }, [ttsChapter, branchHere, sim.truncateAt, sim.active?.id, branchSegmentsHtml, lexicon]);

  const ttsChapterRef = useRef(ttsChapter);
  ttsChapterRef.current = ttsChapter;
  const resolveTTSIndex = useCallback((id: ParaId, items: TTSItem[]) => {
    const ch = ttsChapterRef.current;
    if (!ch) return -1;
    const r = resolveAnchor(ch, id);
    if (r < 0) return -1;
    const host = ch.paras[r].id;
    return items.findIndex((it) => it.id === host);
  }, []);

  const ttsMetrics = useTTSMetrics();
  const handleChapterChangeRef = useRef<(index: number, opts?: { lastPage?: boolean; via?: "page" | "jump" }) => void>(() => {});

  const reportPosition = useCallback((pos: { chapterIndex: number; paraId?: ParaId; atChapterEnd: boolean; via: "page" | "tts" | "speed" | "jump" }) => {
    if (!filePath || !hasRpc()) return;
    knowledge.reportPosition(filePath, pos).catch(() => undefined);
  }, [filePath]);

  const markReadAt = useCallback((paraId: ParaId) => {
    const ch = chapter;
    if (!ch || !chapterId || ch.byId[paraId] === undefined) return;
    const idx = ch.byId[paraId];
    anchorsState.markRead(chapterId, paraId, (prev) => (ch.byId[prev] ?? -1) < idx);
  }, [chapter, chapterId, anchorsState]);

  const tts = useTTS({
    items: ttsItems,
    resolveIndex: resolveTTSIndex,
    voice: settings.ttsVoice,
    rate: settings.ttsRate,
    pitch: settings.ttsPitch,
    volume: settings.ttsVolume,
    autoAdvance: settings.ttsAutoAdvance,
    onParagraphTiming: (timing) => ttsMetrics.record(timing),
    onParagraphDone: (item) => {
      if (item.id.startsWith("branch:")) return;
      markReadAt(item.id);
      reportPosition({ chapterIndex: currentChapter, paraId: item.id, atChapterEnd: false, via: "tts" });
    },
    onChapterEnd: () => {
      reportPosition({ chapterIndex: currentChapter, atChapterEnd: true, via: "tts" });
      if (currentChapter < totalChapters - 1) {
        const next = currentChapter + 1;
        handleChapterChangeRef.current(next);
        setAutoPlayChapter(next);
      }
    },
  });

  const isTTSActive = tts.state.status !== "idle";

  // Auto-play after chapter change from auto-advance (once the new chapter is built)
  useEffect(() => {
    if (autoPlayChapter !== null && autoPlayChapter === currentChapter && ttsItems.length > 0) {
      setAutoPlayChapter(null);
      tts.actions.playFrom(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayChapter, currentChapter, ttsItems.length]);

  /** Page index of the paragraph TTS is reading (merged/dropped → the paragraph showing it). */
  const ttsParagraphIndex = useMemo(() => {
    const id = tts.state.currentParaId;
    if (!id || tts.state.status === "idle") return -1;
    if (id.startsWith("branch:")) return tts.state.currentParagraph;
    return chapter ? resolveAnchor(chapter, id) : -1;
  }, [tts.state.currentParaId, tts.state.status, tts.state.currentParagraph, chapter]);
  // Word highlights index the DISPLAYED variant's words; reading the original → paragraph only.
  const ttsWordIndex = ttsChapter === chapter ? tts.activeWordIndex : -1;

  const readMarkIndex = useMemo(() => {
    if (!chapter || !chapterId) return -1;
    const id = readMarks[chapterId];
    return id ? resolveAnchor(chapter, id) : -1;
  }, [chapter, chapterId, readMarks]);

  const ttsProgress = useMemo(() => {
    const total = ttsItems.length;
    const curIdx = tts.state.currentParaId ? ttsItems.findIndex((it) => it.id === tts.state.currentParaId) : -1;
    if (tts.state.status === "idle" || curIdx < 0) return { current: 0, total, estimatedSeconds: 0 };
    let words = 0;
    let speakable = 0;
    for (let i = curIdx; i < ttsItems.length; i++) {
      if (!isSpeakable(ttsItems[i].text)) continue;
      words += ttsItems[i].tokens.length;
      speakable++;
    }
    return { current: curIdx, total, estimatedSeconds: ttsMetrics.estimate(settings.ttsRate, words, speakable) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsItems, tts.state.currentParaId, tts.state.status, settings.ttsRate]);

  // ── Bookmarks (ParaRef of the page's first paragraph) ────────────────────────────
  const pageRef = useMemo<ParaRef | null>(() => {
    const p = chapter?.paras[visibleRange[0]];
    return p && chapterId ? { filePath, chapterId, paraId: p.id } : null;
  }, [chapter, chapterId, visibleRange, filePath]);
  const isOnPage = useCallback((a: { chapterId: string; paraId: ParaId }) => {
    if (!chapter || a.chapterId !== chapterId) return false;
    const idx = resolveAnchor(chapter, a.paraId);
    return idx >= visibleRange[0] && idx <= visibleRange[1];
  }, [chapter, chapterId, visibleRange]);
  const bookmarkState = useBookmarks({
    filePath,
    chapterIndex: currentChapter,
    chapterTitle,
    pageRef,
    pageParaIndex: visibleRange[0],
    isOnPage,
    anchors,
    setAnchor: anchorsState.setAnchor,
    deleteAnchor: anchorsState.deleteAnchor,
  });

  // ── Chapter labels (non-story pages unnumbered), stored once per book ───────────
  useEffect(() => {
    if (!book || !filePath) return;
    const toc = book.toc ?? [];
    if (toc.length === 0) return;
    const key = `chapter-labels-v2:${filePath}`;
    window.electronAPI?.getSetting(key).then((existing) => {
      if (existing) {
        try { setChapterLabels(JSON.parse(existing)); } catch { /* ignore */ }
        return;
      }
      const labels = buildChapterLabels(toc);
      if (Object.keys(labels).length > 0) {
        window.electronAPI?.setSetting(key, JSON.stringify(labels));
        setChapterLabels(labels);
      }
    });
  }, [book, filePath]);

  // ── Navigation ───────────────────────────────────────────────────────────────────
  const pendingLastPageRef = useRef(false);
  /** How the reader got to the current position: TOC/bookmark/citation jumps don't move the frontier. */
  const navViaRef = useRef<"page" | "jump">("page");
  const maxPageRef = useRef<{ chapter: number; page: number }>({ chapter: -1, page: 0 });

  const handleChapterChange = useCallback((index: number, opts: { lastPage?: boolean; via?: "page" | "jump"; force?: boolean } = {}) => {
    // While a "what if" branch is shown, the story can't continue past the branch chapter.
    if (!opts.force && branchLockChapter !== null && index > branchLockChapter) return;
    tts.actions.stop();
    navViaRef.current = opts.via ?? "page";
    pendingLastPageRef.current = !!opts.lastPage;
    setCurrentPage(0);
    setTotalPages(1);
    setCurrentChapter(index);
    setShowTOC(false);
  }, [tts.actions, branchLockChapter]);
  handleChapterChangeRef.current = handleChapterChange;

  const navigateToRef = useCallback((ref: { chapterId: string; paraId: ParaId }, fallbackChapter?: number, force = false) => {
    const idx = chapters.findIndex((c) => c.id === ref.chapterId);
    const target = idx >= 0 ? idx : fallbackChapter;
    if (target === undefined || target < 0) return;
    if (target !== currentChapter) handleChapterChange(target, { via: "jump", force });
    else navViaRef.current = "jump";
    setReveal({ chapterIndex: target, paraId: ref.paraId });
  }, [chapters, currentChapter, handleChapterChange]);

  // `book:reveal` from another window (citation chips in Buddy / Wiki): main focused this window.
  useEffect(() => onAIEvent("reveal", (e) => {
    if (e.filePath === filePath) navigateToRef(e.ref);
  }), [filePath, navigateToRef]);

  const revealParaIndex = reveal && reveal.chapterIndex === currentChapter && chapter
    ? resolveAnchor(chapter, reveal.paraId)
    : null;
  const clearReveal = useCallback(() => setReveal(null), []);

  // Restore saved reading position after the book loads (a restore is not "reading").
  const progressKey = `readProgress:${filePath}`;
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!book || !filePath || restoredRef.current) return;
    restoredRef.current = true;
    if (initialReveal) {
      // Opened by `book:reveal`: land on the cited paragraph, not the saved position.
      navigateToRef(initialReveal);
      return;
    }
    window.electronAPI?.getSetting(progressKey).then((raw) => {
      if (!raw) return;
      try {
        const { chapter: ch, page } = JSON.parse(raw);
        navViaRef.current = "jump";
        setCurrentChapter(Math.max(0, Math.min(ch ?? 0, book.chapters.length - 1)));
        if (page && page > 0) {
          pendingLastPageRef.current = false;
          setCurrentPage(page);
        }
      } catch { /* ignore corrupt data */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, filePath]);

  // Save reading position on chapter/page change
  const saveProgressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!filePath || !book) return;
    if (saveProgressRef.current) clearTimeout(saveProgressRef.current);
    saveProgressRef.current = setTimeout(() => {
      window.electronAPI?.setSetting(
        progressKey,
        JSON.stringify({ chapter: currentChapter, page: currentPage, totalChapters }),
      );
    }, 500);
    return () => { if (saveProgressRef.current) clearTimeout(saveProgressRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, currentPage, filePath, book]);

  // Record page view for reading activity tracking
  const recordPageRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!filePath || !book) return;
    if (recordPageRef.current) clearTimeout(recordPageRef.current);
    recordPageRef.current = setTimeout(() => {
      window.electronAPI?.recordPageView(filePath, title, currentChapter, chapterTitle, currentPage, totalPages, totalChapters);
    }, 1000);
    return () => { if (recordPageRef.current) clearTimeout(recordPageRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, currentPage, filePath, book]);

  // Spoiler safety: report the position as you read (reading_state → frontier). A chapter is
  // finished on its last page, or when 90% of a long chapter's pages were viewed.
  useEffect(() => {
    if (!chapter || !chapterId || speedReaderActive) return;
    const t = setTimeout(() => {
      const mp = maxPageRef.current;
      if (mp.chapter !== currentChapter) maxPageRef.current = { chapter: currentChapter, page: currentPage };
      else if (currentPage > mp.page) mp.page = currentPage;
      const seen = maxPageRef.current.page + 1;
      // Only trust the page count once this chapter was measured: `totalPages` resets to 1 on a
      // chapter change, and a hidden window (rAF suspended) never re-measures, so TTS
      // auto-advance would otherwise report a just-started chapter as finished (QA-P2-10).
      // (The book's own TOC page is not paginated: it is never measured.)
      const measured = measuredChapter === currentChapter || isTOCChapter(rawChapterTitle);
      const atChapterEnd = measured && totalPages > 0 && (currentPage >= totalPages - 1 || (totalPages >= 10 && seen / totalPages >= 0.9));
      const last = chapter.paras[visibleRange[1]];
      reportPosition({ chapterIndex: currentChapter, paraId: last?.id, atChapterEnd, via: navViaRef.current });
    }, 600);
    return () => clearTimeout(t);
  }, [chapter, chapterId, currentChapter, currentPage, totalPages, measuredChapter, rawChapterTitle, visibleRange, speedReaderActive, reportPosition]);

  useEffect(() => window.electronAPI?.onMaximized(setMaximized), []);

  // Immersive mode
  useEffect(() => {
    if (!settings.immersiveMode) { setImmersiveVisible(true); return; }
    const handler = (e: MouseEvent) => {
      if (window.innerHeight - e.clientY < 80) {
        setImmersiveVisible(true);
        if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);
        immersiveTimerRef.current = setTimeout(() => setImmersiveVisible(false), 2500);
      }
    };
    window.addEventListener("mousemove", handler);
    return () => { window.removeEventListener("mousemove", handler); if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current); };
  }, [settings.immersiveMode]);

  // Called by TextContent when it measures the real page count (of the chapter it shows).
  const shownChapterRef = useRef(-1);
  shownChapterRef.current = chapter ? currentChapter : -1;
  const handleMeasure = useCallback((measured: number) => {
    setTotalPages(measured);
    setMeasuredChapter(shownChapterRef.current);
    if (pendingLastPageRef.current && measured > 1) {
      pendingLastPageRef.current = false;
      setCurrentPage(measured - 1);
    } else {
      setCurrentPage((prev) => Math.min(prev, measured - 1));
    }
  }, []);

  const goNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      navViaRef.current = "page";
      setCurrentPage(currentPage + 1);
    } else if (branchLockChapter === null || currentChapter < branchLockChapter) {
      if (currentChapter < totalChapters - 1) handleChapterChange(currentChapter + 1);
    }
  }, [currentPage, totalPages, currentChapter, totalChapters, handleChapterChange, branchLockChapter]);

  const goPrevPage = useCallback(() => {
    if (currentPage > 0) {
      navViaRef.current = "page";
      setCurrentPage(currentPage - 1);
    } else if (currentChapter > 0) {
      handleChapterChange(currentChapter - 1, { lastPage: true });
    }
  }, [currentPage, currentChapter, handleChapterChange]);

  const seekPage = useCallback((p: number) => {
    navViaRef.current = "jump";
    setCurrentPage(p);
  }, []);

  const toggleTOC = useCallback(() => { setShowTTS(false); setShowTextSettings(false); setShowAI(false); setShowTOC(v => !v); }, []);
  const toggleTTS = useCallback(() => { setShowTOC(false); setShowTextSettings(false); setShowAI(false); setShowTTS(v => !v); }, []);
  const toggleTextSettings = useCallback(() => { setShowTOC(false); setShowTTS(false); setShowAI(false); setShowTextSettings(v => !v); }, []);
  const toggleAI = useCallback(() => { setShowTOC(false); setShowTTS(false); setShowTextSettings(false); setShowAI(v => !v); }, []);

  const handleAssistantOpenChange = useCallback((open: boolean) => {
    setAssistantOpen(open);
    // One panel at a time: the Assistant shares the right slot with AI Tools and Text settings.
    if (open) { setShowAI(false); setShowTextSettings(false); }
  }, []);

  // ── Speed reader (same RenderedChapter: lexicon + entities applied) ──────────────
  const speedReaderChunks = useMemo(() => {
    if (!speedReaderActive || !chapter) return [];
    const html = chapter.paras.map((p, i) =>
      p.hidden || (branchHere && sim.truncateAt !== null && i > sim.truncateAt) ? "" : p.html,
    );
    return chunkParagraphs([...html, ...extraParagraphs]);
  }, [speedReaderActive, chapter, branchHere, sim.truncateAt, extraParagraphs]);

  const handleSpeedReaderToggle = useCallback(() => {
    setSpeedReaderActive(prev => {
      if (prev) { setSrChunkParaIndex(-1); setSrChunkText(""); setSrChunkOffset(0); }
      return !prev;
    });
  }, []);

  const exitSpeedReader = useCallback(() => {
    setSpeedReaderActive(false);
    setSrChunkParaIndex(-1);
    setSrChunkText("");
    setSrChunkOffset(0);
  }, []);

  const handleSpeedReaderChunkChange = useCallback((paraIndex: number, chunkText: string, charOffset: number) => {
    setSrChunkParaIndex(paraIndex);
    setSrChunkText(chunkText);
    setSrChunkOffset(charOffset);
  }, []);

  const handleSpeedReaderChapterEnd = useCallback(() => {
    reportPosition({ chapterIndex: currentChapter, atChapterEnd: true, via: "speed" });
    if (currentChapter < totalChapters - 1) handleChapterChange(currentChapter + 1);
  }, [currentChapter, totalChapters, handleChapterChange, reportPosition]);

  const handleSpeedReaderReadProgress = useCallback((paraIndex: number) => {
    const p = chapter?.paras[paraIndex];
    if (!p) return;
    markReadAt(p.id);
    reportPosition({ chapterIndex: currentChapter, paraId: p.id, atChapterEnd: false, via: "speed" });
  }, [chapter, markReadAt, reportPosition, currentChapter]);

  // Theme scope is <html> (conventions §1): mirror the paper's appearance so
  // portals (modals, menus, tooltips) match the reader chrome.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const light = settings.readingTheme !== "dark";
    if (light) root.setAttribute("data-appearance", "light");
    else root.removeAttribute("data-appearance");
    root.style.colorScheme = light ? "light" : "dark";
    return () => {
      root.removeAttribute("data-appearance");
      root.style.removeProperty("color-scheme");
    };
  }, [settings.readingTheme]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen?.(); setIsFullscreen(true); }
    else { document.exitFullscreen?.(); setIsFullscreen(false); }
  }, []);

  // ── Comments: AI (artifact) + yours (annotations), resolved through merges/drops ──
  const commentsByPara = useMemo(() => {
    const map = new Map<number, ReaderComment[]>();
    if (!chapter || !chapterId) return map;
    const add = (paraId: ParaId, c: ReaderComment) => {
      const i = resolveAnchor(chapter, paraId);
      if (i < 0) return;
      const list = map.get(i);
      if (list) list.push(c);
      else map.set(i, [c]);
    };
    (pipeline.artifacts?.comments ?? []).forEach((c, k) =>
      add(c.paraId, { key: `a${k}`, author: "ai", text: applyLexiconText(c.text, lexicon, "display") }));
    for (const c of userComments) {
      if (c.chapterId === chapterId) add(c.paraId, { key: `u${c.id}`, author: "user", text: c.text, id: c.id });
    }
    return map;
  }, [chapter, chapterId, pipeline.artifacts, userComments, lexicon]);
  const commentsUI = !!prefs?.comments || userComments.some((c) => c.chapterId === chapterId);

  const handleAddComment = useCallback((paraIndex: number, text: string) => {
    const p = chapter?.paras[paraIndex];
    if (!p || !chapterId) return;
    void anchorsState.addComment({ filePath, chapterId, paraId: p.id }, text, p.text.slice(0, 200));
  }, [chapter, chapterId, filePath, anchorsState]);

  const handleDeleteComment = useCallback((c: ReaderComment) => {
    if (c.author === "user" && c.id !== undefined) void anchorsState.deleteComment(c.id);
  }, [anchorsState]);

  // ── Selection actions (Ask · Explain · Define · Who's this? · Quote · Save word) ──
  const quoteIdsRef = useRef(new Map<string, number>());
  const handleSaveQuote = useCallback(async (s: SelectionPayload) => {
    const api = window.electronAPI;
    if (!api || !chapter) return;
    const idx = chapter.byId[s.ref.paraId] ?? 0;
    const saved = await api.quotesAdd(filePath, currentChapter, idx, s.text, chapterTitle, title).catch(() => null);
    if (!saved) return;
    quoteIdsRef.current.set(s.text, saved.id);
    void anchorsState.setAnchor({ kind: "quote", refId: String(saved.id), filePath, chapterId: s.ref.chapterId, paraId: s.ref.paraId, quote: s.text });
    if (quoteToastTimer.current) clearTimeout(quoteToastTimer.current);
    setQuoteToastVisible(true);
    quoteToastTimer.current = setTimeout(() => setQuoteToastVisible(false), 2000);
  }, [chapter, filePath, currentChapter, chapterTitle, title, anchorsState]);

  const findEntityByName = useCallback((name: string): string | null => {
    const n = name.trim().toLowerCase();
    for (const e of entityIndex ?? []) {
      if (e.name.toLowerCase() === n || e.aliases.some((a) => a.toLowerCase() === n)) return e.id;
    }
    return null;
  }, [entityIndex]);

  const selectionActions = useMemo(() => createSelectionActions({
    filePath,
    bookTitle: title,
    showDefine: (s) => setDefine(s),
    showWhoIs: (s) => setEntityCard({ entityId: findEntityByName(s.text), name: s.text.trim(), rect: rectOf(s.rect) }),
    saveQuote: handleSaveQuote,
    onQuoteClassified: (s, r) => {
      const id = quoteIdsRef.current.get(s.text);
      if (id === undefined) return;
      void window.electronAPI?.quotesUpdate(id, { speaker: r.speakerName ?? r.speaker, kind: r.kind, aiEnhanced: true });
    },
  }), [filePath, title, findEntityByName, handleSaveQuote]);

  // ── Entities ──────────────────────────────────────────────────────────────────────
  const refAt = useCallback((paraIndex: number | undefined): ParaRef | null => {
    if (!chapter || !chapterId) return null;
    const p = chapter.paras[paraIndex ?? visibleRange[0]] ?? chapter.paras[chapter.visible[0] ?? 0];
    return p ? { filePath, chapterId, paraId: p.id } : null;
  }, [chapter, chapterId, filePath, visibleRange]);

  const startSimulate = useCallback((entity: { id: string; name: string }, paraIndex?: number) => {
    const ref = refAt(paraIndex);
    if (!ref) return;
    tts.actions.stop();
    void sim.start(ref, entity);
  }, [refAt, sim, tts.actions]);

  const openWiki = useCallback((entryId?: string) => {
    window.electronAPI?.openWiki({ filePath, title, ...(entryId ? { entryId } : {}) });
  }, [filePath, title]);

  const handleEntityClick = useCallback((id: string, rect: DOMRect, paraIndex: number) => {
    setEntityMenu(null);
    setEntityCard((cur) => (cur?.entityId === id ? null : { entityId: id, rect, paraIndex }));
  }, []);

  const handleEntityContextMenu = useCallback((id: string, x: number, y: number, paraIndex: number) => {
    const entity = entityById.get(id);
    if (!entity) return;
    setEntityCard(null);
    setEntityMenu({ entity, x, y, paraIndex });
  }, [entityById]);

  // Popovers anchored to the page close when the page or chapter changes.
  useEffect(() => {
    setEntityMenu(null);
    setEntityCard(null);
    setDefine(null);
  }, [currentPage, currentChapter]);

  /** The assistant asked to show an entity: a card beside the assistant panel. */
  const showEntityFromAssistant = useCallback((id: string) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    setEntityCard({ entityId: id, rect: { top: h / 2 - 120, bottom: h / 2 - 100, left: w - 444 - 300, right: w - 444 - 16, width: 284, height: 20 } });
  }, []);

  // Escape: the window handler only acts on keys nobody consumed (surfaces that consume Escape
  // call preventDefault in the capture phase). Esc NEVER closes the window — Ctrl+W does.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      // Ctrl/Cmd+W closes the reader, like every desktop app (Esc never does).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        window.electronAPI?.close();
        return;
      }
      if (e.key === "Escape") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
          (e.target as HTMLElement).blur();
          return;
        }
        if (speedReaderActive) exitSpeedReader();
        else if (sim.active) sim.exit();
        else if (showAI) setShowAI(false);
        else if (showTextSettings) setShowTextSettings(false);
        else if (showTOC) setShowTOC(false);
        else if (showTTS) setShowTTS(false);
        else if (isTTSActive) tts.actions.stop();
        else if (isFullscreen) { document.exitFullscreen?.(); setIsFullscreen(false); }
        return;
      }
      if (e.key === " " && !isImageBook) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        if (tts.state.status === "playing") tts.actions.pause();
        else tts.actions.play();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [speedReaderActive, exitSpeedReader, showTextSettings, showTOC, showTTS, showAI, sim, isFullscreen, isTTSActive, isImageBook, tts.state.status, tts.actions]);

  // Arrow key page navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goNextPage();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrevPage();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNextPage, goPrevPage]);

  // Scroll wheel / trackpad page navigation
  const scrollAccum = useRef(0);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readerContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = readerContentRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      let node = e.target as HTMLElement | null;
      while (node && node !== el) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return;
        node = node.parentElement;
      }
      e.preventDefault();
      scrollAccum.current += e.deltaY;
      const threshold = 80;
      if (scrollAccum.current > threshold) {
        goNextPage();
        scrollAccum.current = 0;
      } else if (scrollAccum.current < -threshold) {
        goPrevPage();
        scrollAccum.current = 0;
      }
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => { scrollAccum.current = 0; }, 200);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, [goNextPage, goPrevPage]);

  const handleVisibleRange = useCallback((first: number, last: number) => {
    setVisibleRange((cur) => (cur[0] === first && cur[1] === last ? cur : [first, last]));
  }, []);

  if (!isLoaded) return null;

  const anyPanelOpen = (showTOC && totalChapters > 1) || (showTTS && !isImageBook) || showAI || assistantOpen;

  const simulateMode = branchHere;
  const branchEntityName = sim.active?.entityName;

  return (
    <div
      className={`relative flex h-screen flex-col ${theme.bg} transition-colors duration-500 ease-apple`}
      data-appearance={settings.readingTheme === "dark" ? undefined : "light"}
      // Light papers (White, Sepia) take the light appearance, which also brings its
      // paper-weight elevation (--elev-*), so panels never cast a grey slab.
      style={{
        "--reader-paper": settings.readingTheme === "dark" ? "var(--canvas)" : theme.bgRaw,
      } as React.CSSProperties}
    >
      {/* Header — floating pills on the paper, no bar */}
      <header className="relative shrink-0">
        <ReaderHeader
          title={title} author={author} theme={theme}
          chapterTitle={book ? chapterTitle : undefined}
          readingTheme={settings.readingTheme} maximized={maximized}
          isFullscreen={isFullscreen} hasMultipleChapters={totalChapters > 1}
          isImageBook={isImageBook} isBookmarked={!!bookmarkState.currentBookmark}
          isTTSActive={isTTSActive} showTOC={showTOC} showTTS={showTTS}
          showTextSettings={showTextSettings} showAI={showAI}
          onThemeChange={(t) => updateSetting("readingTheme", t)}
          onTOCToggle={toggleTOC} onTTSToggle={toggleTTS}
          onTextSettingsToggle={toggleTextSettings}
          onBookmarkToggle={() => void bookmarkState.toggleBookmark()}
          onFullscreenToggle={toggleFullscreen}
          onAIToggle={toggleAI}
          speedReaderActive={speedReaderActive}
          onSpeedReaderToggle={handleSpeedReaderToggle}
          playbackInFooter={!settings.immersiveMode}
          onOpenQuotes={() => window.electronAPI?.openQuotes({ filePath, title })}
        />

        <AnimatePresence>
        {showTextSettings && !isImageBook && (
          <TextSettingsPanel
            key="text-settings"
            theme={theme} fontFamily={settings.fontFamily} fontSize={settings.fontSize}
            readingTheme={settings.readingTheme}
            onThemeChange={(t) => updateSetting("readingTheme", t)}
            lineHeight={settings.lineHeight} paraSpacing={settings.paraSpacing}
            textPadding={settings.textPadding} maxTextWidth={settings.maxTextWidth}
            animatedPageTurn={settings.animatedPageTurn} immersiveMode={settings.immersiveMode}
            customFonts={customFonts}
            onFontFamilyChange={(f) => updateSetting("fontFamily", f)}
            onFontSizeChange={(s) => updateSetting("fontSize", s)}
            onLineHeightChange={(lh) => updateSetting("lineHeight", lh)}
            onParaSpacingChange={(ps) => updateSetting("paraSpacing", ps)}
            onTextPaddingChange={(tp) => updateSetting("textPadding", tp)}
            onMaxTextWidthChange={(mw) => updateSetting("maxTextWidth", mw)}
            onAnimatedPageTurnChange={(a) => updateSetting("animatedPageTurn", a)}
            onImmersiveModeChange={(im) => updateSetting("immersiveMode", im)}
            onClose={() => setShowTextSettings(false)}
          />
        )}
        </AnimatePresence>
      </header>

      {/* Side panels live on the reader root, outside the overflow-hidden content wrappers, so
          their glass shadows are never clipped (a hard grey slab on White and Sepia). They sit
          between the header and the footer row: top 52 + 8, bottom 60 + 8. */}
      <AnimatePresence>
      {showTOC && totalChapters > 1 && (
        <TOCSidebar
          key="toc"
          chapters={chapters} currentChapter={currentChapter}
          bookmarks={bookmarkState.bookmarks} theme={theme}
          chapterLabels={chapterLabels}
          titles={displayTitles}
          currentPage={currentPage}
          totalPages={totalPages}
          onSelectChapter={(i) => handleChapterChange(i, { via: "jump" })}
          onJumpToBookmark={(bm) => {
            const a = bookmarkState.anchorOf.get(String(bm.id));
            if (a) navigateToRef(a, bm.chapterIndex);
            else handleChapterChange(bm.chapterIndex, { via: "jump" });
          }}
          onDeleteBookmark={bookmarkState.removeBookmark}
          onClose={() => setShowTOC(false)}
        />
      )}
      </AnimatePresence>

      <AnimatePresence>
      {showAI && (
        <AIToolsPanel
          key="ai-tools"
          filePath={filePath}
          chapterIndex={currentChapter}
          totalChapters={totalChapters || undefined}
          chapterLabel={chapterLabel}
          onClose={() => setShowAI(false)}
          onOpenWiki={() => openWiki()}
          onOpenStyleDictionary={() => window.electronAPI?.openStyleDictionary({ filePath, title })}
        />
      )}
      </AnimatePresence>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div ref={readerContentRef} className="relative flex-1 overflow-hidden">
          <div className="h-full">
          {isLoading || (!chapter && pipeline.status !== "error") ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className={`size-5 animate-spin ${theme.muted}`} strokeWidth={1.5} />
            </div>
          ) : pipeline.status === "error" || !chapter ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <AlertCircle className={`size-5 ${theme.muted}`} strokeWidth={1.5} />
              <p className={`text-sm ${theme.muted}`}>This book couldn’t be opened.</p>
              {pipeline.error && <p className={`max-w-md text-xs ${theme.muted}`}>{pipeline.error}</p>}
            </div>
          ) : isTOCChapter(rawChapterTitle) ? (
            <div className="h-full overflow-y-auto" style={{ padding: `${settings.textPadding}px` }}>
              <BookTableOfContents
                toc={book?.toc ?? []}
                currentChapter={currentChapter}
                theme={theme}
                titles={displayTitles}
                onSelectChapter={(i) => handleChapterChange(i, { via: "jump" })}
              />
            </div>
          ) : (
            <TextContent
              chapterTitle={chapterTitle}
              paras={chapter.paras}
              chapterId={chapterId}
              truncateAfter={branchHere ? sim.truncateAt : null}
              extraParagraphs={extraParagraphs}
              theme={theme}
              readingTheme={settings.readingTheme}
              fontFamily={settings.fontFamily}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              paraSpacing={settings.paraSpacing}
              padding={settings.textPadding}
              maxTextWidth={settings.maxTextWidth}
              animated={settings.animatedPageTurn}
              currentPage={currentPage}
              totalPages={totalPages}
              onMeasure={handleMeasure}
              onVisibleRangeChange={handleVisibleRange}
              onPageRequest={setCurrentPage}
              revealParaIndex={revealParaIndex}
              onRevealed={clearReveal}
              ttsStatus={tts.state.status}
              ttsParagraphIndex={ttsParagraphIndex}
              ttsActiveWordIndex={ttsWordIndex}
              ttsHighWaterMark={readMarkIndex}
              ttsHighlightMode={settings.ttsHighlightMode}
              ttsShowReadMark={settings.ttsShowReadMark}
              onPlayFromParagraph={(idx) => tts.actions.playFrom(idx)}
              filePath={filePath}
              chapterIndex={currentChapter}
              onEntityClick={prefs?.knowledge ? handleEntityClick : undefined}
              onEntityContextMenu={prefs?.knowledge ? handleEntityContextMenu : undefined}
              simulateMode={simulateMode}
              simulateInputVisible={simulateMode && !sim.pending}
              simulateGenerating={simulateMode && sim.pending}
              onSimulateSubmit={(text) => void sim.submit(text)}
              branchEntityName={branchEntityName}
              simulateChoices={simulateMode ? sim.choices : []}
              commentsEnabled={commentsUI}
              commentsByPara={commentsByPara}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              selectionActions={selectionActions}
              speedReaderActive={speedReaderActive}
              speedReaderParaIndex={srChunkParaIndex}
              speedReaderChunkText={srChunkText}
              speedReaderChunkOffset={srChunkOffset}
            />
          )}
          </div>


          {/* Top fade */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-0"
            style={{ height: `${settings.textPadding}px`, background: `linear-gradient(to bottom, ${theme.bgRaw}, transparent)` }}
          />
          {/* Bottom fade */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0"
            style={{ height: `${settings.textPadding}px`, background: `linear-gradient(to top, ${theme.bgRaw}, transparent)` }}
          />
        </div>

        {/* Bulk progress (orchestrator status). One bottom row on the footer's centre line:
            progress · page controls · Ask. Floating pills hide while a panel is open (§13.11);
            AI Tools shows the run itself ("Bulk run in progress…"). */}
        {!anyPanelOpen && (
          <BulkDock
            filePath={filePath}
            chapterLabel={chapterLabel}
            // Never reaches the centred footer pill (~526px): half of it + this inset + a 12px gap.
            className="absolute bottom-2.5 left-4 z-40 max-w-[min(26rem,calc(50vw-292px))]"
          />
        )}

        {!isImageBook && book && (
          <AssistantLauncher
            filePath={filePath}
            bookTitle={title}
            frontierLabel={frontierLabel}
            material="glass-thick"
            onOpenChange={handleAssistantOpenChange}
            onDetach={() => window.electronAPI?.openBuddy({ filePath, title, currentChapter, totalChapters })}
            onOpenEntity={showEntityFromAssistant}
            onReveal={(ref) => navigateToRef(ref)}
            hidePill={speedReaderActive}
            yieldSlot={showAI || showTextSettings}
            slotClassName="right-3"
          />
        )}

        {/* Quote saved toast */}
        <div
          className="pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-spring"
          style={{ opacity: quoteToastVisible ? 1 : 0, transform: `translateX(-50%) translateY(${quoteToastVisible ? "0" : "6px"})` }}
        >
          <div className="glass-thick flex h-9 items-center gap-2 rounded-full px-4 text-xs font-medium text-label">
            <Quote className="size-3.5 text-brand" strokeWidth={2} />
            Quote saved
          </div>
        </div>

        {/* Speed reader spans the page and the footer zone; its pill sits on the footer's line. */}
        {speedReaderActive && (
          <SpeedReaderView
            theme={theme}
            chunks={speedReaderChunks}
            chapterTitle={chapterTitle}
            onExit={exitSpeedReader}
            onChapterEnd={handleSpeedReaderChapterEnd}
            onParagraphChange={() => {}}
            onReadProgress={handleSpeedReaderReadProgress}
            onChunkChange={handleSpeedReaderChunkChange}
          />
        )}

        {speedReaderActive && <div aria-hidden className="shrink-0" style={{ height: FOOTER_HEIGHT }} />}
        {!speedReaderActive && <ReaderFooter
          currentPage={currentPage} totalPages={totalPages}
          chapterIndex={currentChapter} chapterCount={totalChapters}
          chapterTitle={chapterTitle} theme={theme} immersiveMode={settings.immersiveMode}
          immersiveVisible={immersiveVisible}
          canGoPrev={!sim.active && (currentPage > 0 || currentChapter > 0)}
          canGoNext={!sim.active && (currentPage < totalPages - 1 || currentChapter < totalChapters - 1)}
          onPrev={goPrevPage}
          onNext={goNextPage}
          onSeekPage={sim.active ? undefined : seekPage}
          showPlayback={!isImageBook && !settings.immersiveMode}
          showTTS={showTTS}
          onTTSToggle={toggleTTS}
          speedReaderActive={speedReaderActive}
          onSpeedReaderToggle={handleSpeedReaderToggle}
          ttsStatus={tts.state.status}
          estimatedSeconds={ttsProgress.estimatedSeconds}
          branchMode={!!sim.active}
          branchEntityName={branchEntityName}
          onExitBranch={sim.exit}
          savedBranches={sim.branches}
          showBranchList={showBranchList}
          onToggleBranchList={() => setShowBranchList((v) => !v)}
          onLoadBranch={(b) => {
            setShowBranchList(false);
            void sim.load(b.id);
            navigateToRef(b.ref, b.chapterIndex, true);
          }}
          onDeleteBranch={(id) => void sim.remove(id)}
          activeBranchId={sim.active?.id}
          chapterLabels={chapterLabels}
        />}
      </div>

      {/* TTS Panel — rises above the footer pill */}
      <AnimatePresence>
      {showTTS && !isImageBook && (
        <TTSPanel
          key="tts"
          theme={theme}
          state={tts.state}
          voices={tts.voices}
          selectedVoice={settings.ttsVoice}
          rate={settings.ttsRate}
          volume={settings.ttsVolume}
          autoAdvance={settings.ttsAutoAdvance}
          highlightMode={settings.ttsHighlightMode}
          showReadMark={settings.ttsShowReadMark}
          currentParagraph={ttsProgress.current}
          totalParagraphs={ttsProgress.total}
          estimatedSeconds={ttsProgress.estimatedSeconds}
          onPlayFromStart={() => tts.actions.playFrom(0)}
          onPlayFromCurrent={() => {
            // Resume after the read mark if it's on this page or later, else from the page.
            const from = readMarkIndex >= visibleRange[0] ? readMarkIndex + 1 : visibleRange[0];
            tts.actions.playFrom(from);
          }}
          onPause={() => tts.actions.pause()}
          onResume={() => tts.actions.play()}
          onStop={() => tts.actions.stop()}
          onSkipPrev={() => tts.actions.skipPrev()}
          onSkipNext={() => tts.actions.skipNext()}
          onVoiceChange={(v) => updateSetting("ttsVoice", v)}
          onRateChange={(r) => updateSetting("ttsRate", r)}
          onVolumeChange={(v) => updateSetting("ttsVolume", v)}
          onAutoAdvanceChange={(a) => updateSetting("ttsAutoAdvance", a)}
          onHighlightModeChange={(m) => updateSetting("ttsHighlightMode", m)}
          onShowReadMarkChange={(s) => updateSetting("ttsShowReadMark", s)}
          onClose={() => setShowTTS(false)}
        />
      )}
      </AnimatePresence>

      {/* Spoiler-safe entity card (click on a highlighted name, "Who's this?") */}
      {entityCard && (
        <EntityCard
          filePath={filePath}
          entityId={entityCard.entityId}
          name={entityCard.name}
          anchorRect={entityCard.rect}
          bookTitle={title}
          chapterLabel={chapterLabel}
          onAsk={(e) => {
            setEntityCard(null);
            if (e.id) openAssistant({ entityId: e.id }, { filePath });
            else openAssistant(undefined, { filePath, mode: "lookup", prompt: `Who is ${e.name}?`, autoSend: true });
          }}
          onSimulate={(e) => {
            const at = entityCard.paraIndex;
            setEntityCard(null);
            startSimulate(e, at);
          }}
          onOpenWiki={(id) => openWiki(id)}
          onOpenEntity={(id) => setEntityCard((cur) => (cur ? { ...cur, entityId: id, name: undefined } : cur))}
          onClose={() => setEntityCard(null)}
        />
      )}

      {/* Right-click on a highlighted name */}
      {entityMenu && (
        <EntityContextMenu
          entity={{ id: entityMenu.entity.id, name: applyLexiconText(entityMenu.entity.name, lexicon, "display"), type: entityMenu.entity.type as WikiEntryType, color: entityMenu.entity.color }}
          x={entityMenu.x}
          y={entityMenu.y}
          onSimulate={() => startSimulate({ id: entityMenu.entity.id, name: entityMenu.entity.name }, entityMenu.paraIndex)}
          onOpenWiki={() => openWiki(entityMenu.entity.id)}
          onAsk={() => openAssistant({ entityId: entityMenu.entity.id }, { filePath })}
          onClose={() => setEntityMenu(null)}
        />
      )}

      {/* In-place Define / Translate */}
      {define && (
        <DefinePopover
          term={define.text}
          sentence={define.sentence}
          anchorRect={define.rect}
          filePath={filePath}
          bookTitle={title}
          ref={define.ref}
          onClose={() => setDefine(null)}
          onWhoIs={(name) => {
            const rect = rectOf(define.rect);
            setDefine(null);
            setEntityCard({ entityId: findEntityByName(name), name, rect });
          }}
        />
      )}

      {/* "Previously on…" when reopening after a while (per-book pref) */}
      {prefs?.recapOnReopen && (
        <RecapSheet
          filePath={filePath}
          bookTitle={title}
          onEntityClick={(id, rect) => setEntityCard({ entityId: id, rect })}
        />
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
