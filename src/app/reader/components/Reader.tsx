"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Loader2, MessageCircle, Quote } from "lucide-react";
import { getThemeClasses } from "../lib/theme";
import type { BookContent, CustomFont } from "../lib/types";
import { useReaderSettings } from "../hooks/useReaderSettings";
import { useBookmarks } from "../hooks/useBookmarks";
import { useTTS, isSpeakable } from "../hooks/useTTS";
import { useTTSMetrics } from "../hooks/useTTSMetrics";
import { ReaderHeader } from "./ReaderHeader";
import { ReaderFooter, FOOTER_HEIGHT } from "./ReaderFooter";
import { TOCSidebar } from "./TOCSidebar";
import { TTSPanel } from "./TTSPanel";
import { TextSettingsPanel } from "./TextSettingsPanel";
import { BookTableOfContents, isTOCChapter } from "./BookTableOfContents";
import { TextContent } from "./TextContent";
import { AISidebar } from "./AISidebar";
import { BulkProgressDock, useBulkRun } from "./BulkProgressDock";
import { isStructuralChapter } from "@/lib/ai-prompts";
import { aiText } from "@/lib/ai-client";
import type { WikiEntryType } from "@/lib/ai-wiki";
import { generateWikiForChapterBatch } from "@/lib/ai-wiki";
import { generateSimContinuation, extractVoiceLines, type SimChoice } from "@/lib/ai-simulate";
import { formatChapterContent } from "@/lib/ai-formatting";
import type { InlineComment } from "@/lib/ai-comments";
import { enrichQuote } from "@/lib/ai-quotes";
import { useEnrichment } from "../hooks/useEnrichment";
import { useFormatting } from "../hooks/useFormatting";
import { useCondense } from "../hooks/useCondense";
import { useWiki } from "../hooks/useWiki";
import { useComments } from "../hooks/useComments";
import { useAutoProcess } from "../hooks/useAutoProcess";
import { buildChapterLabels, type ChapterLabels } from "@/lib/chapter-labels";
import { AIBuddyPanel } from "./AIBuddyPanel";
import { ExplainPanel, type ExplainMessage } from "./ExplainPanel";
import { SpeedReaderView } from "./SpeedReaderView";
import { chunkParagraphs } from "@/lib/speed-reader-engine";
import { buildEntityRegex, injectWikiEntities } from "./WikiTooltip";
import { applyReplacements, loadReplacements, type WordReplacement } from "@/lib/word-replacements";

const EMPTY_ARRAY: any[] = [];

/** Decode all HTML entities using the DOM. Safe after tags are already stripped. */
const _entityEl = typeof document !== "undefined" ? document.createElement("textarea") : null;
function decodeHtmlEntities(text: string): string {
  if (!_entityEl) return text;
  _entityEl.innerHTML = text;
  return _entityEl.value;
}

/** Strip HTML for TTS: unwrap dialogue speaker spans (keep name text), then strip remaining tags. */
function stripHtmlForTTS(html: string[]): string[] {
  return html.map(h => {
    // When a dialogue-speaker span is immediately followed by a quote, drop the span
    // (the visual badge already shows the speaker — no need to say the name).
    // When NOT followed by a quote (name appears mid-narration), keep the text.
    const QUOTE_CHARS = "\u201C\u201D\u2018\u2019\u0022\u0027";
    let text = h
      .replace(
        new RegExp(
          `<span\\b[^>]*\\bclass="ai-fmt-dialogue-[^"]*"[^>]*>[^<]*<\\/span>\\s*,?\\s*(?=[${QUOTE_CHARS}])`,
          "g",
        ),
        "",
      )
      .replace(/<span\b[^>]*\bclass="ai-fmt-dialogue-[^"]*"[^>]*>([^<]*)<\/span>/g, "$1");
    // Strip all HTML tags, then decode any remaining HTML entities
    text = decodeHtmlEntities(text.replace(/<[^>]+>/g, "")).trim();
    return text;
  });
}

/** Skip chapters with embedded images (base64) or extremely large content to avoid context overflow */
function isChapterTooLarge(chapter: { paragraphs: string[]; htmlParagraphs: string[] }): boolean {
  const totalLen = chapter.htmlParagraphs.reduce((sum, p) => sum + p.length, 0);
  // Skip if total HTML is over 500K chars (~roughly 500K tokens) or contains base64 images
  if (totalLen > 500_000) return true;
  return chapter.htmlParagraphs.some(p => p.includes("data:image/") || p.includes("base64,"));
}

interface ReaderProps {
  filePath: string;
  format: string;
  title: string;
  author: string;
}

export function Reader({ filePath, format, title, author }: ReaderProps) {
  const [bookContent, setBookContent] = useState<BookContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chapterLabels, setChapterLabels] = useState<ChapterLabels>({});
  const [currentChapter, setCurrentChapter] = useState(0);
  const [customFonts] = useState<CustomFont[]>([]);

  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showTOC, setShowTOC] = useState(false);
  const [showTTS, setShowTTS] = useState(false);
  const [showTextSettings, setShowTextSettings] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [immersiveVisible, setImmersiveVisible] = useState(true);

  // Quote toast
  const [quoteToastVisible, setQuoteToastVisible] = useState(false);
  const quoteToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI Buddy state
  const [buddyEnabled, setBuddyEnabled] = useState(false);
  const [showBuddy, setShowBuddy] = useState(false);

  // AI Explain state
  const [explainState, setExplainState] = useState<{
    text: string;
    messages: ExplainMessage[];
    loading: boolean;
    systemPrompt: string;
  } | null>(null);

  // Simulate state (branching narrative)
  const [simulateEnabled, setSimulateEnabled] = useState(false);
  const [activeBranch, setActiveBranch] = useState<{
    id: string;
    chapterIndex: number;
    truncateAfterPara: number;
    entityId: string;
    entityName: string;
  } | null>(null);
  const [activeBranchSegments, setActiveBranchSegments] = useState<
    { userInput: string; htmlParagraphs: string[] }[]
  >([]);
  const [simulateChoices, setSimulateChoices] = useState<SimChoice[]>([]);
  const [simulateGenerating, setSimulateGenerating] = useState(false);
  const [showBranchList, setShowBranchList] = useState(false);
  const [savedBranches, setSavedBranches] = useState<SimBranchRow[]>([]);

  // Speed Reader state
  const [speedReaderActive, setSpeedReaderActive] = useState(false);
  const [srChunkParaIndex, setSrChunkParaIndex] = useState(-1);
  const [srChunkText, setSrChunkText] = useState("");
  const [srChunkOffset, setSrChunkOffset] = useState(0);

  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ttsHighWaterMark, setTtsHighWaterMark] = useState(-1);
  const [autoPlayChapter, setAutoPlayChapter] = useState<number | null>(null);
  const [persistedReadMarks, setPersistedReadMarks] = useState<Record<number, number>>({});

  const { settings, updateSetting, isLoaded } = useReaderSettings();
  const theme = getThemeClasses(settings.readingTheme);

  // Word replacements for TTS (loaded once from settings)
  const [wordReplacements, setWordReplacements] = useState<WordReplacement[]>([]);
  useEffect(() => { loadReplacements().then(setWordReplacements); }, []);

  const chapters = bookContent?.chapters ?? EMPTY_ARRAY;
  const chapter = chapters[currentChapter];
  const paragraphs = chapter?.paragraphs ?? EMPTY_ARRAY;
  const isImageBook = bookContent?.isImageBook ?? false;
  const rawChapterTitle = chapter?.title ?? `Chapter ${currentChapter + 1}`;

  const bookLoaded = !!bookContent;

  // ── AI Feature Hooks ──────────────────────────────────
  const enrichHook = useEnrichment(chapters, title, filePath, currentChapter, bookLoaded);
  const { enrichedNames, enrichEnabled, enrichingChapter, enrichAllProgress,
          enrichChapter, enrichAll, toggleEnrichEnabled, clearEnrichedNames, cancelEnrichAll } = enrichHook;

  const condenseHook = useCondense(chapters, title, filePath, currentChapter, bookLoaded);
  const { condenseEnabled, condensedChapters, condensingChapter, condenseAllProgress,
          condenseChapter, condenseAllChapters, toggleCondenseEnabled, clearCondense, cancelCondenseAll } = condenseHook;

  const formatHook = useFormatting(chapters, title, filePath, condensedChapters, condenseEnabled, bookLoaded);
  const { formattingEnabled, formattedChapters, formattingChapter, formatAllProgress,
          styleDictionary, fmtCondensedChapters,
          formatChapter, formatAllChapters, formatCondensedChapter,
          toggleFormattingEnabled, clearFormatting, cancelFormatAll } = formatHook;

  const wikiHook = useWiki(chapters, title, filePath, currentChapter, buddyEnabled, (v) => {
    setBuddyEnabled(v);
    if (!v) setShowBuddy(false);
  }, simulateEnabled, (v) => {
    setSimulateEnabled(v);
    if (!v) { setActiveBranch(null); setActiveBranchSegments([]); }
  });
  const { wikiEnabled, wikiProcessingChapter, wikiAllProgress,
          wikiEntityIndex, wikiProcessedChapters, wikiEntryCount,
          processWikiChapter, retryWikiChapter, toggleWikiEnabled, cancelWikiAll, refreshWikiState,
          setWikiEnabled, setWikiProcessedChapters, setWikiEntryCount,
          setWikiEntityIndex, setWikiAllProgress, setWikiProcessingChapter,
          wikiAbortRef } = wikiHook;

  const commentsHook = useComments(chapters, title, filePath, currentChapter);
  const { commentsEnabled, chapterComments, commentingChapter,
          generateCommentsForChapter, toggleCommentsEnabled, addUserComment, deleteUserComment, clearComments } = commentsHook;

  useAutoProcess({
    chapters, bookContent, filePath, currentChapter,
    enrichEnabled, enrichedNames, condenseEnabled, condensedChapters,
    formattingEnabled, formattedChapters, fmtCondensedChapters,
    wikiEnabled, wikiProcessedChapters, commentsEnabled, chapterComments,
    enrichChapter, condenseChapter, formatChapter, formatCondensedChapter,
    processWikiChapter, generateCommentsForChapter,
  });

  const chapterTitle = enrichEnabled && enrichedNames[currentChapter] ? enrichedNames[currentChapter] : rawChapterTitle;

  // TTS — use condensed/formatted text when available, stripped to plain text
  const isBranchChapterForTTS = activeBranch && currentChapter === activeBranch.chapterIndex;
  const ttsParagraphs = useMemo(() => {
    // Branch chapters: use original/formatted original
    if (isBranchChapterForTTS && activeBranch) {
      const base = formattingEnabled && formattedChapters[activeBranch.chapterIndex]
        ? formattedChapters[activeBranch.chapterIndex]
        : chapters[activeBranch.chapterIndex]?.htmlParagraphs ?? EMPTY_ARRAY;
      const truncated = base.slice(0, activeBranch.truncateAfterPara + 1);
      const generated = (activeBranchSegments ?? EMPTY_ARRAY).flatMap(s => s.htmlParagraphs);
      const html = [...truncated, ...generated];
      return stripHtmlForTTS(html);
    }

    // Condensed + formatted
    if (condenseEnabled && condensedChapters[currentChapter]) {
      if (formattingEnabled && fmtCondensedChapters[currentChapter]) {
        return stripHtmlForTTS(fmtCondensedChapters[currentChapter]);
      }
      // Condensed is plain text — return directly
      return condensedChapters[currentChapter];
    }

    // Formatted original
    if (formattingEnabled && formattedChapters[currentChapter]) {
      return stripHtmlForTTS(formattedChapters[currentChapter]);
    }

    return paragraphs; // original plain text
  }, [isBranchChapterForTTS, activeBranch, activeBranchSegments, formattingEnabled, formattedChapters,
      fmtCondensedChapters, condenseEnabled, condensedChapters, currentChapter, chapters, paragraphs]);

  // Apply word replacements to TTS text so the speech matches the display
  const ttsReplacedParagraphs = useMemo(() => {
    if (wordReplacements.length === 0) return ttsParagraphs;
    return ttsParagraphs.map(p => applyReplacements(p, wordReplacements));
  }, [ttsParagraphs, wordReplacements]);

  const ttsMetrics = useTTSMetrics();

  const tts = useTTS({
    paragraphs: ttsReplacedParagraphs,
    voice: settings.ttsVoice,
    rate: settings.ttsRate,
    pitch: settings.ttsPitch,
    volume: settings.ttsVolume,
    autoAdvance: settings.ttsAutoAdvance,
    onParagraphChange: () => {},
    onParagraphTiming: (timing) => ttsMetrics.record(timing),
    onChapterEnd: () => {
      if (currentChapter < chapters.length - 1) {
        const next = currentChapter + 1;
        handleChapterChange(next);
        setAutoPlayChapter(next);
      }
    },
  });

  const isTTSActive = tts.state.status !== "idle";

  // Track highest paragraph TTS has reached (for read mark)
  useEffect(() => {
    if (tts.state.status === "idle") { setTtsHighWaterMark(-1); return; }
    setTtsHighWaterMark(prev => Math.max(prev, tts.state.currentParagraph));
  }, [tts.state.currentParagraph, tts.state.status]);

  // Auto-play after chapter change from auto-advance
  useEffect(() => {
    if (autoPlayChapter !== null && autoPlayChapter === currentChapter) {
      setAutoPlayChapter(null);
      tts.actions.playFrom(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayChapter, currentChapter]);

  // Persisted read marks — load
  const readMarksKey = `ttsReadMarks:${filePath}`;
  useEffect(() => {
    if (!filePath) return;
    window.electronAPI?.getSetting(readMarksKey).then(raw => {
      if (!raw) return;
      try { setPersistedReadMarks(JSON.parse(raw)); } catch { /* ignore */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // Persisted read marks — save when high water mark advances
  useEffect(() => {
    if (!filePath || ttsHighWaterMark < 0) return;
    setPersistedReadMarks(prev => {
      const existing = prev[currentChapter] ?? -1;
      if (ttsHighWaterMark <= existing) return prev;
      const next = { ...prev, [currentChapter]: ttsHighWaterMark };
      window.electronAPI?.setSetting(readMarksKey, JSON.stringify(next));
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsHighWaterMark, currentChapter, filePath]);

  // Effective high water mark: live during TTS, persisted when idle
  const effectiveHighWaterMark = tts.state.status !== "idle"
    ? ttsHighWaterMark
    : (persistedReadMarks[currentChapter] ?? -1);

  // TTS progress info — use ttsParagraphs so ETA reflects condensed/formatted text
  const ttsProgress = useMemo(() => {
    const total = ttsParagraphs.length;
    const current = tts.state.currentParagraph;
    if (tts.state.status === "idle") return { current: 0, total, wordsRemaining: 0, paragraphsRemaining: 0, estimatedSeconds: 0 };
    let words = 0;
    let speakableCount = 0;
    for (let i = current; i < ttsParagraphs.length; i++) {
      if (isSpeakable(ttsParagraphs[i])) {
        words += (ttsParagraphs[i].match(/\S+/g) ?? EMPTY_ARRAY).length;
        speakableCount++;
      }
    }
    const estimatedSeconds = ttsMetrics.estimate(settings.ttsRate, words, speakableCount);
    return { current, total, wordsRemaining: words, paragraphsRemaining: speakableCount, estimatedSeconds };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsParagraphs, tts.state.currentParagraph, tts.state.status, settings.ttsRate]);

  const bookmarkState = useBookmarks({
    filePath,
    chapterIndex: currentChapter,
    paragraphIndex: 0,
    chapterTitle,
  });

  // Load book content
  useEffect(() => {
    console.log(`[Reader] Loading book — filePath="${filePath}", format="${format}"`);
    if (!filePath) { console.warn("[Reader] No filePath provided, skipping load"); setIsLoading(false); return; }
    setIsLoading(true);
    window.electronAPI
      ?.getBookContent(filePath, format)
      .then((content) => {
        console.log(`[Reader] Book loaded — ${content?.chapters?.length ?? 0} chapters, isImageBook=${content?.isImageBook}`);
        if (content?.chapters?.[0]?.title === "Error") {
          console.error(`[Reader] Parser error: ${content.chapters[0].paragraphs[0]}`);
        }
        setBookContent(content);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        console.error("[Reader] Failed to load book content:", err);
        setBookContent({
          chapters: [{ title: "Error", paragraphs: ["Failed to load book content."], htmlParagraphs: ["<p>Failed to load book content.</p>"] }],
          isImageBook: false,
          toc: [],
        });
        setIsLoading(false);
      });
  }, [filePath, format]);

  // Chapter labeling — skip known non-story pages by title, store once per book
  useEffect(() => {
    if (!bookContent || !filePath) return;
    const toc = bookContent.toc ?? EMPTY_ARRAY;
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
  }, [bookContent, filePath]);

  // (Settings loading for enrichment, formatting, condense, wiki, comments
  //  is now handled inside each hook's own useEffect)

  // Load buddy + simulate toggle states from settings
  useEffect(() => {
    if (!bookContent || !filePath) return;
    window.electronAPI?.getSetting(`buddyEnabled:${filePath}`).then((raw) => {
      if (raw != null) {
        try { setBuddyEnabled(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
    window.electronAPI?.getSetting(`simulateEnabled:${filePath}`).then((raw) => {
      if (raw != null) {
        try { setSimulateEnabled(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookContent, filePath]);


  const toggleBuddyEnabled = useCallback(() => {
    const next = !buddyEnabled;
    setBuddyEnabled(next);
    if (!next) setShowBuddy(false);
    window.electronAPI?.setSetting(`buddyEnabled:${filePath}`, JSON.stringify(next));
  }, [buddyEnabled, filePath]);

  const toggleSimulateEnabled = useCallback(() => {
    const next = !simulateEnabled;
    setSimulateEnabled(next);
    if (!next) {
      setActiveBranch(null);
      setActiveBranchSegments([]);
    }
    window.electronAPI?.setSetting(`simulateEnabled:${filePath}`, JSON.stringify(next));
  }, [simulateEnabled, filePath]);

  // Load saved branches when simulate is enabled
  useEffect(() => {
    if (!simulateEnabled || !filePath) return;
    window.electronAPI?.simGetBranches(filePath).then(branches => {
      setSavedBranches(branches);
    });
  }, [simulateEnabled, filePath]);

  // ── AI Explain handler ────────────────────────────

  const handleExplain = useCallback(async (selectedText: string, _paraIndex: number) => {
    if (!filePath) return;

    const api = window.electronAPI;
    if (!api) return;

    // Build wiki context
    const allEntries = await api.wikiGetEntries(filePath);
    let wikiContext = "";
    if (allEntries.length > 0) {
      const entityLines = allEntries
        .filter((e) => e.significance >= 2)
        .slice(0, 30)
        .map((e) => `- [${e.type}] ${e.name}: ${e.short_description}`);
      if (entityLines.length > 0) {
        wikiContext = `\n\nKnown entities from this book:\n${entityLines.join("\n")}`;
      }
    }

    const summaries = await api.wikiGetChapterSummaries(filePath, 0, currentChapter);
    let summaryContext = "";
    if (summaries.length > 0) {
      const summaryLines = summaries.slice(-5).map(
        (s) => `- Ch. ${s.chapter_index}: ${s.summary}`
      );
      summaryContext = `\n\nRecent chapter summaries:\n${summaryLines.join("\n")}`;
    }

    const chapterText = chapters[currentChapter]?.htmlParagraphs
      ?.map((h) => h.replace(/<[^>]+>/g, ""))
      .join("\n")
      .slice(0, 8000) ?? "";

    const systemPrompt = `You are a literary assistant helping a reader understand a passage from a book titled "${title}". Explain clearly and concisely, referencing characters, events, or context from the story when relevant. Keep explanations to 2-4 sentences unless the user asks for more detail. Do not spoil future events — only reference what has happened up to this point.${wikiContext}${summaryContext}\n\nChapter ${currentChapter + 1} context:\n${chapterText}`;

    const userMsg: ExplainMessage = { role: "user", content: `Please explain this passage:\n"${selectedText}"` };

    setExplainState({ text: selectedText, messages: [userMsg], loading: true, systemPrompt });

    try {
      const reply = await aiText({
        preset: "quick",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg.content },
        ],
      });

      setExplainState((prev) => prev ? {
        ...prev,
        messages: [...prev.messages, { role: "assistant", content: reply }],
        loading: false,
      } : null);
    } catch (err) {
      console.error("[explain] Error:", err);
      setExplainState((prev) => prev ? {
        ...prev,
        messages: [...prev.messages, { role: "assistant", content: "Failed to generate explanation. Please check your API key and try again." }],
        loading: false,
      } : null);
    }
  }, [filePath, currentChapter, chapters, title]);

  const handleExplainFollowUp = useCallback(async (question: string) => {
    if (!explainState || !filePath) return;

    const userMsg: ExplainMessage = { role: "user", content: question };
    const updatedMessages = [...explainState.messages, userMsg];

    setExplainState((prev) => prev ? { ...prev, messages: updatedMessages, loading: true } : null);

    try {
      // Build full conversation for the API
      const apiMessages = [
        { role: "system" as const, content: explainState.systemPrompt },
        ...updatedMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      const reply = await aiText({ preset: "quick", messages: apiMessages });

      setExplainState((prev) => prev ? {
        ...prev,
        messages: [...prev.messages, { role: "assistant", content: reply }],
        loading: false,
      } : null);
    } catch (err) {
      console.error("[explain follow-up] Error:", err);
      setExplainState((prev) => prev ? {
        ...prev,
        messages: [...prev.messages, { role: "assistant", content: "Failed to respond. Please try again." }],
        loading: false,
      } : null);
    }
  }, [explainState, filePath]);

  // ── Quote save handler ─────────────────────────────

  const handleSaveQuote = useCallback(async (text: string, paraIndex: number) => {
    if (!filePath) return;
    const api = window.electronAPI;
    if (!api) return;

    const savedQuote = await api.quotesAdd(
      filePath,
      currentChapter,
      paraIndex,
      text,
      chapterTitle,
      title
    );

    // Show toast
    if (quoteToastTimer.current) clearTimeout(quoteToastTimer.current);
    setQuoteToastVisible(true);
    quoteToastTimer.current = setTimeout(() => setQuoteToastVisible(false), 2000);

    // Fire-and-forget AI enrichment
    const surrounding = chapters[currentChapter]?.paragraphs
      .slice(Math.max(0, paraIndex - 2), paraIndex + 3)
      .join(" ");
    enrichQuote(text, { chapterTitle, bookTitle: title, surroundingText: surrounding })
      .then((enrichment) => {
        api.quotesUpdate(savedQuote.id, {
          speaker: enrichment.speaker,
          kind: enrichment.kind,
          aiEnhanced: true,
        });
      })
      .catch(() => {/* silent */});
  }, [filePath, currentChapter, chapterTitle, title, chapters]);

  // ── Simulate handlers ──────────────────────────────

  const handleSimulateEntity = useCallback(async (entity: { id: string; name: string; type: WikiEntryType; color: string }, paragraphIndex: number) => {
    if (!filePath) return;

    // Truncate right at the paragraph where the user right-clicked
    const truncateAfterPara = paragraphIndex;

    // Create branch
    const branchId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const branch = {
      id: branchId,
      filePath,
      entityId: entity.id,
      entityName: entity.name,
      chapterIndex: currentChapter,
      truncateAfterPara,
    };

    await window.electronAPI?.simUpsertBranch(branch);

    setActiveBranch({
      id: branchId,
      chapterIndex: currentChapter,
      truncateAfterPara,
      entityId: entity.id,
      entityName: entity.name,
    });
    setActiveBranchSegments([]);
    setSimulateChoices([]);

    // Refresh branch list
    const branches = await window.electronAPI?.simGetBranches(filePath) ?? EMPTY_ARRAY;
    setSavedBranches(branches);
  }, [filePath, currentChapter]);

  const handleSimulateSubmit = useCallback(async (text: string) => {
    if (!activeBranch || !filePath || simulateGenerating) return;

    setSimulateGenerating(true);
    setSimulateChoices([]);

    try {
      // Get entity data for AI context
      const api = window.electronAPI;
      if (!api) throw new Error("No API");

      const [row, details, relationships, allEntries, aliases, chapterSummariesRaw] = await Promise.all([
        api.wikiGetEntry(filePath, activeBranch.entityId),
        api.wikiGetDetails(filePath, activeBranch.entityId, activeBranch.chapterIndex),
        api.wikiGetRelationships(filePath, activeBranch.entityId, activeBranch.chapterIndex),
        api.wikiGetEntries(filePath),
        api.wikiGetAliases(filePath, activeBranch.entityId),
        api.wikiGetChapterSummaries(filePath, 0, activeBranch.chapterIndex),
      ]);

      const nameMap = new Map(allEntries.map(e => [e.id, e.name]));

      // Get preceding paragraphs for current chapter context
      const base = wikiEnabled && formattedChapters[activeBranch.chapterIndex]
        ? formattedChapters[activeBranch.chapterIndex]
        : chapters[activeBranch.chapterIndex]?.htmlParagraphs ?? EMPTY_ARRAY;
      const truncated = base.slice(0, activeBranch.truncateAfterPara + 1);
      const existingGenerated = activeBranchSegments.flatMap(s => s.htmlParagraphs);
      const allPrecedingParas = [...truncated, ...existingGenerated];

      // Build previous chapter text (the chapter right before the branch chapter)
      let prevChapterText = "";
      const prevChIdx = activeBranch.chapterIndex - 1;
      if (prevChIdx >= 0 && chapters[prevChIdx]) {
        const prevParas = chapters[prevChIdx].htmlParagraphs;
        // Take last ~4000 chars of the previous chapter
        const stripped: string[] = [];
        let charCount = 0;
        for (let i = prevParas.length - 1; i >= 0; i--) {
          const t = prevParas[i].replace(/<[^>]+>/g, "").trim();
          if (!t) continue;
          if (charCount + t.length > 4000) break;
          stripped.unshift(t);
          charCount += t.length;
        }
        prevChapterText = stripped.join("\n\n");
      }

      // Format chapter summaries for broader narrative context
      const chapterSummaries = (chapterSummariesRaw ?? EMPTY_ARRAY)
        .slice(-8)
        .map(s => `- Chapter ${s.chapter_index + 1}: ${s.summary}`);

      // Extract voice lines from the original book text (all chapters up to branch point)
      const entityNames = [activeBranch.entityName, ...((aliases ?? EMPTY_ARRAY) as Array<{ alias: string } | string>).map(a => typeof a === "string" ? a : a.alias)];
      const allBookParas: string[] = [];
      for (let ci = 0; ci <= activeBranch.chapterIndex; ci++) {
        const chParas = chapters[ci]?.htmlParagraphs ?? EMPTY_ARRAY;
        if (ci === activeBranch.chapterIndex) {
          allBookParas.push(...chParas.slice(0, activeBranch.truncateAfterPara + 1));
        } else {
          allBookParas.push(...chParas);
        }
      }
      const voiceLines = extractVoiceLines(allBookParas, entityNames);

      // Also check wiki details for previously saved voice lines
      const savedVoiceDetails = details
        .filter(d => d.category === "voice")
        .map(d => d.content);
      const combinedVoice = [...new Set([...savedVoiceDetails, ...voiceLines])].slice(0, 20);

      const entityData = {
        name: activeBranch.entityName,
        description: row?.description ?? "",
        shortDescription: row?.short_description ?? "",
        details: details.map(d => ({ category: d.category, content: d.content })),
        relationships: relationships.map(r => ({
          targetName: (r.source_id === activeBranch.entityId
            ? nameMap.get(r.target_id)
            : nameMap.get(r.source_id)) ?? r.target_id,
          relation: r.relation,
        })),
        voiceLines: combinedVoice,
      };

      const result = await generateSimContinuation(
        title,
        entityData,
        allPrecedingParas,
        prevChapterText,
        chapterSummaries,
        text,
      );

      // Auto-format generated paragraphs if formatting is enabled
      let finalParagraphs = result.htmlParagraphs;
      if (formattingEnabled && styleDictionary) {
        try {
            const syntheticChapter = {
              title: "",
              paragraphs: finalParagraphs.map(p => p.replace(/<[^>]+>/g, "").trim()),
              htmlParagraphs: finalParagraphs,
            };
            const fmtResult = await formatChapterContent(
              syntheticChapter, title, () => false, styleDictionary, filePath,
            );
            if (fmtResult) {
              finalParagraphs = fmtResult.paragraphs;
            }
        } catch (fmtErr) {
          console.warn("Failed to format simulate content:", fmtErr);
        }
      }

      const segmentIndex = activeBranchSegments.length;
      await api.simAddSegment({
        filePath,
        branchId: activeBranch.id,
        segmentIndex,
        userInput: text,
        htmlParagraphs: JSON.stringify(finalParagraphs),
      });

      setActiveBranchSegments(prev => [...prev, { userInput: text, htmlParagraphs: finalParagraphs }]);
      setSimulateChoices(result.choices);

      // Persist new voice lines to wiki DB (only ones not already saved)
      const newVoiceLines = voiceLines.filter(vl => !savedVoiceDetails.includes(vl));
      if (newVoiceLines.length > 0) {
        await api.wikiAddDetails(
          filePath,
          activeBranch.entityId,
          newVoiceLines.map(vl => ({
            chapterIndex: activeBranch.chapterIndex,
            category: "voice",
            content: vl,
          })),
        );
      }
    } catch (err) {
      console.error("Simulate generation error:", err);
    } finally {
      setSimulateGenerating(false);
    }
  }, [activeBranch, filePath, simulateGenerating, formattingEnabled, formattedChapters, chapters, activeBranchSegments, title, styleDictionary]);

  const handleExitBranch = useCallback(() => {
    setActiveBranch(null);
    setActiveBranchSegments([]);
    setSimulateChoices([]);
  }, []);

  const handleLoadBranch = useCallback(async (branch: SimBranchRow) => {
    if (!filePath) return;

    // Load segments
    const segments = await window.electronAPI?.simGetSegments(filePath, branch.id) ?? EMPTY_ARRAY;
    const parsedSegments = segments.map(s => ({
      userInput: s.user_input,
      htmlParagraphs: JSON.parse(s.html_paragraphs) as string[],
    }));

    // Navigate to branch chapter
    setCurrentChapter(branch.chapter_index);
    setActiveBranch({
      id: branch.id,
      chapterIndex: branch.chapter_index,
      truncateAfterPara: branch.truncate_after_para,
      entityId: branch.entity_id,
      entityName: branch.entity_name,
    });
    setActiveBranchSegments(parsedSegments);
    setShowBranchList(false);
  }, [filePath]);

  const handleDeleteBranch = useCallback(async (branchId: string) => {
    if (!filePath) return;
    await window.electronAPI?.simDeleteBranch(filePath, branchId);
    setSavedBranches(prev => prev.filter(b => b.id !== branchId));
    if (activeBranch?.id === branchId) {
      setActiveBranch(null);
      setActiveBranchSegments([]);
    }
  }, [filePath, activeBranch]);

  const clearWiki = useCallback(() => {
    wikiAbortRef.current = true;
    setWikiEnabled(false);
    setWikiProcessingChapter(null);
    setWikiEntityIndex([]);
    setWikiProcessedChapters(new Set());
    setWikiEntryCount(0);
    window.electronAPI?.wikiClear(filePath);
    window.electronAPI?.setSetting(`wikiEnabled:${filePath}`, JSON.stringify(false));
  }, [filePath]);

  const processAllWikiChapters = useCallback(async (fromChapter?: number, upToChapter?: number) => {
    const api = window.electronAPI;
    const apiKey = await api?.getSetting("openrouterApiKey");
    if (!apiKey || !api) return;

    wikiAbortRef.current = false;

    const start = fromChapter ?? 0;
    const limit = upToChapter ?? chapters.length - 1;

    // Always query DB (not React state) so we never miss chapters due to stale state
    const getUnprocessed = async (): Promise<number[]> => {
      const processed = new Set(await api.wikiGetProcessed(filePath));
      const queue: number[] = [];
      for (let i = start; i <= limit; i++) {
        if (!processed.has(i) && chapters[i]) {
          // Skip structural chapters (cover, TOC, etc.) — mark them processed so they don't re-appear
          if (isStructuralChapter(chapters[i].title)) {
            await api.wikiMarkProcessed(filePath, i);
          } else {
            queue.push(i);
          }
        }
      }
      return queue;
    };

    let unprocessed = await getUnprocessed();
    if (unprocessed.length === 0) return;

    // Per-chapter attempt counter — prevent infinite retries on persistently broken chapters
    const attemptCounts = new Map<number, number>();
    const initialCount = unprocessed.length;

    while (unprocessed.length > 0 && !wikiAbortRef.current) {
      // Give up on chapters that have failed twice — mark them processed so we don't loop forever
      const giveUp = unprocessed.filter((i) => (attemptCounts.get(i) ?? 0) >= 2);
      for (const i of giveUp) {
        console.warn(`Wiki: giving up on chapter ${i} after 2 failed attempts, marking processed`);
        await api.wikiMarkProcessed(filePath, i);
      }

      const toProcess = unprocessed.filter((i) => (attemptCounts.get(i) ?? 0) < 2);
      if (toProcess.length === 0) break;

      // Process exactly one chapter at a time
      const chapterIndex = toProcess[0];
      const text = chapters[chapterIndex].paragraphs.join("\n");
      attemptCounts.set(chapterIndex, (attemptCounts.get(chapterIndex) ?? 0) + 1);

      setWikiProcessingChapter(chapterIndex);
      const doneCount = initialCount - unprocessed.length;
      setWikiAllProgress({ current: doneCount, total: initialCount });

      try {
        await generateWikiForChapterBatch(
          [{ index: chapterIndex, text }],
          title, filePath, () => wikiAbortRef.current,
        );
        if (wikiAbortRef.current) break;
        await refreshWikiState();
      } catch (err) {
        console.error(`Wiki error at chapter ${chapterIndex}:`, err);
      }

      // Re-query DB — marks made by the chapter call are now reflected
      unprocessed = await getUnprocessed();
      const newDoneCount = initialCount - unprocessed.length;
      setWikiAllProgress({ current: newDoneCount, total: initialCount });
    }

    await refreshWikiState();
    setWikiProcessingChapter(null);
    setWikiAllProgress(null);
  }, [chapters, title, filePath, refreshWikiState]);

  const cancelWikiProcessAll = useCallback(() => {
    wikiAbortRef.current = true;
    setWikiProcessingChapter(null);
    setWikiAllProgress(null);
    cancelFormatAll();
  }, [cancelFormatAll]);

  // Wiki entity index for text highlighting (already from DB)
  const effectiveWikiEntityIndex = useMemo(() => {
    if (!wikiEnabled) return [];
    return wikiEntityIndex;
  }, [wikiEnabled, wikiEntityIndex]);

  // Effective HTML paragraphs — layered: base (condensed or original) + formatting overlay
  // Branch only overrides content on the branch's own chapter — other chapters show normally
  const isBranchChapter = activeBranch && currentChapter === activeBranch.chapterIndex;
  const effectiveHtml = useMemo(() => {
    if (isBranchChapter && activeBranch) {
      const base = formattingEnabled && formattedChapters[activeBranch.chapterIndex]
        ? formattedChapters[activeBranch.chapterIndex]
        : chapters[activeBranch.chapterIndex]?.htmlParagraphs ?? EMPTY_ARRAY;
      const truncated = base.slice(0, activeBranch.truncateAfterPara + 1);
      const generated = activeBranchSegments.flatMap(s => s.htmlParagraphs);
      return [...truncated, ...generated];
    }

    // Base layer: condensed (plain text) or original
    const useCondensed = condenseEnabled && !!condensedChapters[currentChapter];

    if (useCondensed) {
      // Condensed base — use formatted-condensed if available, else plain condensed
      if (formattingEnabled && fmtCondensedChapters[currentChapter]) {
        return fmtCondensedChapters[currentChapter];
      }
      return condensedChapters[currentChapter];
    }

    // Original base — use formatted-original if available, else raw
    if (formattingEnabled && formattedChapters[currentChapter]) {
      return formattedChapters[currentChapter];
    }
    return chapter?.htmlParagraphs ?? EMPTY_ARRAY;
  }, [isBranchChapter, activeBranch, activeBranchSegments, formattingEnabled, formattedChapters,
      fmtCondensedChapters, condenseEnabled, condensedChapters, currentChapter, chapter, chapters]);

  // Speed reader chunks from effective HTML (with wiki entity injection)
  const speedReaderChunks = useMemo(() => {
    if (!speedReaderActive) return [];
    // Inject wiki entities into HTML before chunking so entity names are tagged
    let html = effectiveHtml;
    if (wikiEnabled && effectiveWikiEntityIndex.length > 0) {
      const regex = buildEntityRegex(effectiveWikiEntityIndex);
      if (regex) {
        html = html.map(h => injectWikiEntities(h, effectiveWikiEntityIndex, regex));
      }
    }
    return chunkParagraphs(html);
  }, [speedReaderActive, effectiveHtml, wikiEnabled, effectiveWikiEntityIndex]);

  // Restore saved reading position after book loads
  const progressKey = `readProgress:${filePath}`;
  useEffect(() => {
    if (!bookContent || !filePath) return;
    window.electronAPI?.getSetting(progressKey).then((raw) => {
      if (!raw) return;
      try {
        const { chapter, page } = JSON.parse(raw);
        const ch = Math.min(chapter ?? 0, bookContent.chapters.length - 1);
        setCurrentChapter(ch);
        if (page && page > 0) {
          // pendingLastPageRef is repurposed: store the exact page to restore.
          // handleMeasure will resolve it once TextContent measures.
          pendingLastPageRef.current = false;
          // Set page directly; handleMeasure will clamp if needed
          setCurrentPage(page);
        }
      } catch { /* ignore corrupt data */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookContent, filePath]);

  // Save reading position on chapter/page change
  const saveProgressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!filePath || !bookContent) return;
    if (saveProgressRef.current) clearTimeout(saveProgressRef.current);
    saveProgressRef.current = setTimeout(() => {
      window.electronAPI?.setSetting(
        progressKey,
        JSON.stringify({ chapter: currentChapter, page: currentPage, totalChapters: chapters.length }),
      );
    }, 500);
    return () => { if (saveProgressRef.current) clearTimeout(saveProgressRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, currentPage, filePath, bookContent]);

  // Record page view for reading activity tracking
  const recordPageRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!filePath || !bookContent) return;
    if (recordPageRef.current) clearTimeout(recordPageRef.current);
    recordPageRef.current = setTimeout(() => {
      window.electronAPI?.recordPageView(
        filePath,
        title,
        currentChapter,
        chapterTitle,
        currentPage,
        totalPages,
        chapters.length,
      );
    }, 1000);
    return () => { if (recordPageRef.current) clearTimeout(recordPageRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, currentPage, filePath, bookContent]);

  useEffect(() => { window.electronAPI?.onMaximized(setMaximized); }, []);

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

  // ── Page navigation (Reader owns all state) ─────────────
  // When navigating to a chapter's last page, we store -1 here.
  // Once TextContent measures the real page count, we resolve it.
  const pendingLastPageRef = useRef(false);

  const handleChapterChange = useCallback((index: number, goToLastPage = false) => {
    if (activeBranch && index > activeBranch.chapterIndex) return;
    tts.actions.stop();
    pendingLastPageRef.current = goToLastPage;
    setCurrentPage(0);
    setTotalPages(1);
    setCurrentChapter(index);
    setShowTOC(false);
  }, [tts.actions, activeBranch]);

  // Called by TextContent when it measures the real page count
  const handleMeasure = useCallback((measured: number) => {
    setTotalPages(measured);
    if (pendingLastPageRef.current && measured > 1) {
      pendingLastPageRef.current = false;
      setCurrentPage(measured - 1);
    } else {
      // Clamp current page to valid range
      setCurrentPage((prev) => Math.min(prev, measured - 1));
    }
  }, []);

  // Simple page navigation
  const goNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    } else if (!activeBranch || currentChapter < (activeBranch?.chapterIndex ?? Infinity)) {
      if (currentChapter < chapters.length - 1) {
        handleChapterChange(currentChapter + 1);
      }
    }
  }, [currentPage, totalPages, currentChapter, chapters.length, handleChapterChange, activeBranch]);

  const goPrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    } else if (currentChapter > 0) {
      handleChapterChange(currentChapter - 1, true);
    }
  }, [currentPage, currentChapter, handleChapterChange]);

  const [firstVisiblePara, setFirstVisiblePara] = useState(0);

  const toggleTOC = useCallback(() => { setShowTTS(false); setShowTextSettings(false); setShowAI(false); setShowTOC(v => !v); }, []);
  const toggleTTS = useCallback(() => { setShowTOC(false); setShowTextSettings(false); setShowAI(false); setShowTTS(v => !v); }, []);
  const toggleTextSettings = useCallback(() => { setShowTOC(false); setShowTTS(false); setShowAI(false); setShowTextSettings(v => !v); }, []);
  const toggleAI = useCallback(() => { setShowTOC(false); setShowTTS(false); setShowTextSettings(false); setShowAI(v => !v); }, []);

  const handleSpeedReaderToggle = useCallback(() => {
    setSpeedReaderActive(prev => {
      if (prev) { setSrChunkParaIndex(-1); setSrChunkText(""); setSrChunkOffset(0); }
      return !prev;
    });
  }, []);

  const handleSpeedReaderChunkChange = useCallback((paraIndex: number, chunkText: string, charOffset: number) => {
    setSrChunkParaIndex(paraIndex);
    setSrChunkText(chunkText);
    setSrChunkOffset(charOffset);
  }, []);

  const handleSpeedReaderChapterEnd = useCallback(() => {
    if (currentChapter < chapters.length - 1) {
      handleChapterChange(currentChapter + 1);
    }
  }, [currentChapter, chapters.length, handleChapterChange]);

  // Track speed reader paragraph progress as read marks
  const handleSpeedReaderReadProgress = useCallback((paraIndex: number) => {
    setPersistedReadMarks(prev => {
      const existing = prev[currentChapter] ?? -1;
      if (paraIndex <= existing) return prev;
      const next = { ...prev, [currentChapter]: paraIndex };
      window.electronAPI?.setSetting(`ttsReadMarks:${filePath}`, JSON.stringify(next));
      return next;
    });
  }, [currentChapter, filePath]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen?.(); setIsFullscreen(true); }
    else { document.exitFullscreen?.(); setIsFullscreen(false); }
  }, []);

  // Escape + Space keyboard handling
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // If typing in an input, blur it first instead of closing panels
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
          (e.target as HTMLElement).blur();
          return;
        }
        if (activeBranch) { handleExitBranch(); }
        else if (showAI) setShowAI(false);
        else if (showTextSettings) setShowTextSettings(false);
        else if (showTOC) setShowTOC(false);
        else if (showTTS) setShowTTS(false);
        else if (isTTSActive) tts.actions.stop();
        else if (isFullscreen) { document.exitFullscreen?.(); setIsFullscreen(false); }
        else window.electronAPI?.close();
      }
      if (e.key === " " && !isImageBook) {
        // Don't intercept space when typing in an input/textarea
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        if (tts.state.status === "playing") tts.actions.pause();
        else tts.actions.play();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showTextSettings, showTOC, showTTS, showAI, activeBranch, handleExitBranch, isFullscreen, isTTSActive, isImageBook, tts.state.status, tts.actions]);

  // Arrow key page navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
      // Don't hijack scroll from sidebars/panels/scrollable children
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

  // Bulk progress dock — must be after all callback definitions
  const bulkRun = useBulkRun({
    wikiAllProgress, wikiProcessingChapter,
    formatAllProgress, formattingChapter,
    enrichAllProgress, enrichingChapter,
    condenseAllProgress, condensingChapter,
    onRunWiki: processAllWikiChapters, onRunFormat: formatAllChapters,
    onRunTitles: enrichAll, onRunCondense: condenseAllChapters,
    cancelWiki: cancelWikiProcessAll, cancelFormat: cancelFormatAll,
    cancelTitles: cancelEnrichAll, cancelCondense: cancelCondenseAll,
  });

  if (!isLoaded) return null;

  const footerHeight = settings.immersiveMode && !immersiveVisible ? 0 : FOOTER_HEIGHT;

  return (
    <div className={`flex h-screen flex-col ${theme.bg} transition-colors duration-300`}>
      {/* Header */}
      <header className={`relative shrink-0 border-b ${theme.surface} ${theme.border}`}>
        <ReaderHeader
          title={title} author={author} theme={theme}
          readingTheme={settings.readingTheme} maximized={maximized}
          isFullscreen={isFullscreen} hasMultipleChapters={chapters.length > 1}
          isImageBook={isImageBook} isBookmarked={!!bookmarkState.currentBookmark}
          isTTSActive={isTTSActive} showTOC={showTOC} showTTS={showTTS}
          showTextSettings={showTextSettings} showAI={showAI}
          onThemeChange={(t) => updateSetting("readingTheme", t)}
          onTOCToggle={toggleTOC} onTTSToggle={toggleTTS}
          onTextSettingsToggle={toggleTextSettings}
          onBookmarkToggle={bookmarkState.toggleBookmark}
          onFullscreenToggle={toggleFullscreen}
          onAIToggle={toggleAI}
          speedReaderActive={speedReaderActive}
          onSpeedReaderToggle={handleSpeedReaderToggle}
          onOpenQuotes={() => window.electronAPI?.openQuotes({ filePath, title })}
        />

        {/* TTS Panel */}
        {showTTS && !isImageBook && (
          <TTSPanel
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
              // Resume from last read position if available, otherwise start from first visible paragraph
              const persisted = persistedReadMarks[currentChapter] ?? -1;
              const resumeFrom = persisted >= firstVisiblePara ? persisted + 1 : firstVisiblePara;
              tts.actions.playFrom(resumeFrom);
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

        {/* Text Settings Panel */}
        {showTextSettings && !isImageBook && (
          <TextSettingsPanel
            theme={theme} fontFamily={settings.fontFamily} fontSize={settings.fontSize}
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
      </header>

      {/* Main area: content + footer as siblings in a column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Content area — sidebar overlays this, not the footer */}
        <div ref={readerContentRef} className="relative flex-1 overflow-hidden">
          {showTOC && chapters.length > 1 && (
            <TOCSidebar
              chapters={chapters} currentChapter={currentChapter}
              bookmarks={bookmarkState.bookmarks} theme={theme}
              chapterLabels={chapterLabels}
              enrichedNames={enrichedNames}
              enrichEnabled={enrichEnabled}
              enrichingChapter={enrichingChapter}
              onEnrichChapter={enrichChapter}
              formattingEnabled={formattingEnabled}
              formattedChapters={formattedChapters}
              formattingChapter={formattingChapter}
              onFormatChapter={formatChapter}
              wikiEnabled={wikiEnabled}
              wikiProcessedChapters={wikiProcessedChapters}
              onSelectChapter={handleChapterChange}
              onJumpToBookmark={() => {}}
              onDeleteBookmark={bookmarkState.removeBookmark}
              onClose={() => setShowTOC(false)}
            />
          )}

          {showAI && (
            <AISidebar
              theme={theme}
              chapters={chapters}
              enrichedNames={enrichedNames}
              enrichEnabled={enrichEnabled}
              enrichingChapter={enrichingChapter}
              enrichAllProgress={enrichAllProgress}
              onEnrichToggle={toggleEnrichEnabled}
              onEnrichAll={enrichAll}
              onCancelEnrichAll={cancelEnrichAll}
              onClearEnrichedNames={clearEnrichedNames}
              formattingEnabled={formattingEnabled}
              formattedChapterCount={Object.keys(formattedChapters).length}
              formattingChapter={formattingChapter}
              formatAllProgress={formatAllProgress}
              onFormattingToggle={toggleFormattingEnabled}
              onFormatAll={formatAllChapters}
              onCancelFormatAll={cancelFormatAll}
              onClearFormatting={clearFormatting}
              styleDictionary={styleDictionary}
              condenseEnabled={condenseEnabled}
              condensedChapterCount={Object.keys(condensedChapters).length}
              condensingChapter={condensingChapter}
              condenseAllProgress={condenseAllProgress}
              onCondenseToggle={toggleCondenseEnabled}
              onCondenseAll={condenseAllChapters}
              onCancelCondenseAll={cancelCondenseAll}
              onClearCondense={clearCondense}
              currentChapterCondenseDone={!!condensedChapters[currentChapter]}
              filePath={filePath}
              bookTitle={title}
              currentChapterWikiDone={wikiProcessedChapters.has(currentChapter)}
              currentChapterFormatDone={
                condenseEnabled
                  ? !!fmtCondensedChapters[currentChapter]
                  : !!formattedChapters[currentChapter]
              }
              currentChapterEnrichDone={!!enrichedNames[currentChapter]}
              wikiEnabled={wikiEnabled}
              wikiEntryCount={wikiEntryCount}
              wikiProcessedCount={
                Object.keys(chapterLabels).length > 0
                  ? Array.from(wikiProcessedChapters).filter((i) => i in chapterLabels).length
                  : wikiProcessedChapters.size
              }
              wikiProcessingChapter={wikiProcessingChapter}
              wikiAllProgress={wikiAllProgress}
              totalChapters={Object.keys(chapterLabels).length > 0 ? Object.keys(chapterLabels).length : chapters.length}
              currentChapter={currentChapter}
              onWikiToggle={toggleWikiEnabled}
              onWikiProcessAll={processAllWikiChapters}
              onCondenseRetry={() => {
                // Clear condensed + formatted-condensed for this chapter, then re-condense
                clearCondense();
                condenseChapter(currentChapter);
              }}
              onWikiRetry={() => retryWikiChapter(currentChapter)}
              onFormatRetry={() => {
                if (condenseEnabled && condensedChapters[currentChapter]) {
                  clearFormatting();
                  formatCondensedChapter(currentChapter);
                } else {
                  formatChapter(currentChapter);
                }
              }}
              onEnrichRetry={() => enrichChapter(currentChapter)}
              onCancelWikiProcessAll={cancelWikiProcessAll}
              onClearWiki={clearWiki}
              buddyEnabled={buddyEnabled}
              onBuddyToggle={toggleBuddyEnabled}
              simulateEnabled={simulateEnabled}
              onSimulateToggle={toggleSimulateEnabled}
              commentsEnabled={commentsEnabled}
              commentingChapter={commentingChapter}
              chapterCommentCount={Object.keys(chapterComments).length}
              onCommentsToggle={toggleCommentsEnabled}
              onClearComments={clearComments}
              chapterLabels={chapterLabels}
              onClose={() => setShowAI(false)}
              onBulkStart={bulkRun.start}
            />
          )}

          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className={`h-6 w-6 animate-spin ${theme.muted}`} strokeWidth={1.5} />
            </div>
          ) : isTOCChapter(chapterTitle) ? (
            <div className="h-full overflow-y-auto" style={{ padding: `${settings.textPadding}px` }}>
              <BookTableOfContents
                toc={bookContent?.toc ?? EMPTY_ARRAY}
                currentChapter={currentChapter}
                theme={theme}
                enrichedNames={enrichedNames}
                enrichEnabled={enrichEnabled}
                onSelectChapter={handleChapterChange}
              />
            </div>
          ) : (
            <TextContent
              chapterTitle={chapterTitle}
              htmlParagraphs={effectiveHtml}
              theme={theme}
              readingTheme={settings.readingTheme}
              aiFormattingEnabled={formattingEnabled && (
                (condenseEnabled && !!fmtCondensedChapters[currentChapter]) ||
                (!condenseEnabled && !!formattedChapters[currentChapter])
              )}
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
              onFirstParaChange={setFirstVisiblePara}
              onPageRequest={setCurrentPage}
              ttsStatus={tts.state.status}
              ttsParagraphIndex={tts.state.currentParagraph}
              ttsActiveWordIndex={tts.activeWordIndex}
              ttsHighWaterMark={effectiveHighWaterMark}
              ttsHighlightMode={settings.ttsHighlightMode}
              ttsShowReadMark={settings.ttsShowReadMark}
              onPlayFromParagraph={(idx) => tts.actions.playFrom(idx)}
              wikiEnabled={wikiEnabled}
              wikiEntityIndex={effectiveWikiEntityIndex}
              currentChapterIndex={currentChapter}
              filePath={filePath}
              bookTitle={title}
              simulateEnabled={simulateEnabled}
              onSimulateEntity={handleSimulateEntity}
              simulateMode={!!isBranchChapter}
              simulateInputVisible={!!isBranchChapter && !simulateGenerating}
              simulateGenerating={!!isBranchChapter && simulateGenerating}
              onSimulateSubmit={handleSimulateSubmit}
              branchEntityName={activeBranch?.entityName}
              simulateChoices={isBranchChapter ? simulateChoices : EMPTY_ARRAY}
              commentsEnabled={commentsEnabled}
              inlineComments={chapterComments[currentChapter] ?? EMPTY_ARRAY}
              onAddComment={addUserComment}
              onDeleteComment={deleteUserComment}
              onExplain={handleExplain}
              onSaveQuote={handleSaveQuote}
              speedReaderActive={speedReaderActive}
              speedReaderParaIndex={srChunkParaIndex}
              speedReaderChunkText={srChunkText}
              speedReaderChunkOffset={srChunkOffset}
            />
          )}

          {/* Speed reader overlay (control bar + RSVP display) */}
          {speedReaderActive && !isTOCChapter(chapterTitle) && (
            <SpeedReaderView
              theme={theme}
              chunks={speedReaderChunks}
              chapterTitle={chapterTitle}
              onExit={() => { setSpeedReaderActive(false); setSrChunkParaIndex(-1); setSrChunkText(""); setSrChunkOffset(0); }}
              onChapterEnd={handleSpeedReaderChapterEnd}
              onParagraphChange={(paraIdx) => setFirstVisiblePara(paraIdx)}
              onReadProgress={handleSpeedReaderReadProgress}
              onChunkChange={handleSpeedReaderChunkChange}
            />
          )}

          {/* Top fade */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-0"
            style={{
              height: `${settings.textPadding}px`,
              background: `linear-gradient(to bottom, ${theme.bgRaw}, transparent)`,
            }}
          />
          {/* Bottom fade */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0"
            style={{
              height: `${settings.textPadding}px`,
              background: `linear-gradient(to top, ${theme.bgRaw}, transparent)`,
            }}
          />
        </div>

        {/* AI Explain panel */}
        {explainState && (
          <ExplainPanel
            theme={theme}
            selectedText={explainState.text}
            messages={explainState.messages}
            loading={explainState.loading}
            onAsk={handleExplainFollowUp}
            onClose={() => setExplainState(null)}
          />
        )}

        {/* AI Buddy backdrop — click to close */}
        {showBuddy && buddyEnabled && wikiEnabled && (
          <div className="fixed inset-0 z-30" onClick={() => setShowBuddy(false)} />
        )}

        {/* Floating row above footer — buddy button + bulk progress dock */}
        <div className="absolute bottom-14 left-0 right-0 z-40 flex items-end justify-end gap-3 px-4 pointer-events-none">
          {/* Bulk progress dock */}
          {bulkRun.showDock && (
            <div className="pointer-events-auto">
              <BulkProgressDock
                isRunning={bulkRun.state.isRunning}
                isDone={bulkRun.state.isDone}
                phases={bulkRun.state.phases}
                currentPhaseIdx={bulkRun.state.currentPhaseIdx}
                eta={bulkRun.state.eta}
                chapterLabels={chapterLabels}
                activeChapters={{
                  wiki: wikiProcessingChapter,
                  format: formattingChapter,
                  titles: enrichingChapter,
                  condense: condensingChapter,
                }}
                onCancel={bulkRun.cancel}
                onDismiss={bulkRun.dismiss}
              />
            </div>
          )}

          {/* AI Buddy button + panel */}
          {buddyEnabled && wikiEnabled && (
            <div className="pointer-events-auto">
              <div className="relative">
                {showBuddy && (
                  <AIBuddyPanel
                    theme={theme}
                    filePath={filePath}
                    bookTitle={title}
                    currentChapter={currentChapter}
                    totalChapters={chapters.length}
                    wikiEntryCount={wikiEntryCount}
                    readChapter={(idx) => chapters[idx]?.paragraphs?.join("\n") ?? null}
                    onEntityClick={(entityId) => {
                      window.electronAPI?.openWiki({ filePath, title, entryId: entityId });
                    }}
                    onClose={() => setShowBuddy(false)}
                    onDetach={() => {
                      setShowBuddy(false);
                      window.electronAPI?.openBuddy({ filePath, title, currentChapter, totalChapters: chapters.length });
                    }}
                    onWikiUpdated={refreshWikiState}
                  />
                )}
                <button
                  onClick={() => setShowBuddy((v) => !v)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-[var(--bg-surface)] shadow-lg shadow-black/30 transition-all hover:bg-[var(--bg-elevated)] ${showBuddy ? "bg-white/[0.08]" : ""}`}
                  style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.3)" }}
                >
                  <MessageCircle className="h-5 w-5 text-[var(--accent-brand)]" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quote saved toast */}
        <div
          className="pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2 transition-all duration-300"
          style={{ opacity: quoteToastVisible ? 1 : 0, transform: `translateX(-50%) translateY(${quoteToastVisible ? "0" : "6px"})` }}
        >
          <div
            className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-3.5 py-2 text-xs text-white/80 shadow-lg shadow-black/40 backdrop-blur-xl"
            style={{ backgroundColor: "var(--bg-overlay)" }}
          >
            <Quote className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
            Quote saved
          </div>
        </div>

        {/* Footer — hidden during speed reader mode */}
        {!speedReaderActive && <ReaderFooter
          currentPage={currentPage} totalPages={totalPages}
          chapterIndex={currentChapter} chapterCount={chapters.length}
          chapterTitle={chapterTitle} theme={theme} immersiveMode={settings.immersiveMode}
          immersiveVisible={immersiveVisible}
          canGoPrev={!activeBranch && (currentPage > 0 || currentChapter > 0)}
          canGoNext={!activeBranch && (currentPage < totalPages - 1 || currentChapter < chapters.length - 1)}
          onPrev={goPrevPage}
          onNext={goNextPage}
          ttsStatus={tts.state.status}
          estimatedSeconds={ttsProgress.estimatedSeconds}
          branchMode={!!activeBranch}
          branchEntityName={activeBranch?.entityName}
          onExitBranch={handleExitBranch}
          savedBranches={savedBranches}
          showBranchList={showBranchList}
          onToggleBranchList={() => setShowBranchList(v => !v)}
          onLoadBranch={handleLoadBranch}
          onDeleteBranch={handleDeleteBranch}
          activeBranchId={activeBranch?.id}
          chapterLabels={chapterLabels}
        />}
      </div>

    </div>
  );
}
