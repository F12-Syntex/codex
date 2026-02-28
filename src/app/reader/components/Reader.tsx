"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { getThemeClasses } from "../lib/theme";
import type { BookContent, CustomFont } from "../lib/types";
import { useReaderSettings } from "../hooks/useReaderSettings";
import { useBookmarks } from "../hooks/useBookmarks";
import { useTTS } from "../hooks/useTTS";
import { ReaderHeader } from "./ReaderHeader";
import { ReaderFooter, FOOTER_HEIGHT } from "./ReaderFooter";
import { TOCSidebar } from "./TOCSidebar";
import { TTSPanel } from "./TTSPanel";
import { TextSettingsPanel } from "./TextSettingsPanel";
import { BookTableOfContents, isTOCChapter } from "./BookTableOfContents";
import { TextContent } from "./TextContent";

interface ReaderProps {
  filePath: string;
  format: string;
  title: string;
  author: string;
}

export function Reader({ filePath, format, title, author }: ReaderProps) {
  const [bookContent, setBookContent] = useState<BookContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [customFonts] = useState<CustomFont[]>([]);

  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showTOC, setShowTOC] = useState(false);
  const [showTTS, setShowTTS] = useState(false);
  const [showTextSettings, setShowTextSettings] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [immersiveVisible, setImmersiveVisible] = useState(true);

  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { settings, updateSetting, isLoaded } = useReaderSettings();
  const theme = getThemeClasses(settings.readingTheme);

  const chapters = bookContent?.chapters ?? [];
  const chapter = chapters[currentChapter];
  const paragraphs = chapter?.paragraphs ?? [];
  const isImageBook = bookContent?.isImageBook ?? false;
  const chapterTitle = chapter?.title ?? `Chapter ${currentChapter + 1}`;

  // TTS
  const tts = useTTS({
    paragraphs,
    voice: settings.ttsVoice,
    rate: settings.ttsRate,
    pitch: settings.ttsPitch,
    volume: settings.ttsVolume,
    autoAdvance: settings.ttsAutoAdvance,
    onParagraphChange: () => {},
    onChapterEnd: () => {
      if (currentChapter < chapters.length - 1) {
        handleChapterChange(currentChapter + 1);
        setTimeout(() => tts.actions.play(), 300);
      }
    },
  });

  const isTTSActive = tts.state.status !== "idle";

  const bookmarkState = useBookmarks({
    filePath,
    chapterIndex: currentChapter,
    paragraphIndex: 0,
    chapterTitle,
  });

  // Load book content
  useEffect(() => {
    if (!filePath) { setIsLoading(false); return; }
    setIsLoading(true);
    window.electronAPI
      ?.getBookContent(filePath, format)
      .then((content) => { setBookContent(content); setIsLoading(false); })
      .catch(() => {
        setBookContent({
          chapters: [{ title: "Error", paragraphs: ["Failed to load book content."], htmlParagraphs: ["<p>Failed to load book content.</p>"] }],
          isImageBook: false,
        });
        setIsLoading(false);
      });
  }, [filePath, format]);

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

  const handleChapterChange = useCallback((index: number) => {
    tts.actions.stop();
    setCurrentChapter(index);
    setShowTOC(false);
  }, [tts.actions]);

  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page);
    setTotalPages(total);
  }, []);

  const toggleTOC = useCallback(() => { setShowTTS(false); setShowTextSettings(false); setShowTOC(v => !v); }, []);
  const toggleTTS = useCallback(() => { setShowTOC(false); setShowTextSettings(false); setShowTTS(v => !v); }, []);
  const toggleTextSettings = useCallback(() => { setShowTOC(false); setShowTTS(false); setShowTextSettings(v => !v); }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen?.(); setIsFullscreen(true); }
    else { document.exitFullscreen?.(); setIsFullscreen(false); }
  }, []);

  // Escape + Space keyboard handling
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showTextSettings) setShowTextSettings(false);
        else if (showTOC) setShowTOC(false);
        else if (showTTS) setShowTTS(false);
        else if (isTTSActive) tts.actions.stop();
        else if (isFullscreen) { document.exitFullscreen?.(); setIsFullscreen(false); }
        else window.electronAPI?.close();
      }
      if (e.key === " " && !isImageBook) {
        e.preventDefault();
        if (tts.state.status === "playing") tts.actions.pause();
        else tts.actions.play();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showTextSettings, showTOC, showTTS, isFullscreen, isTTSActive, isImageBook, tts.state.status, tts.actions]);

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
          showTextSettings={showTextSettings}
          onThemeChange={(t) => updateSetting("readingTheme", t)}
          onTOCToggle={toggleTOC} onTTSToggle={toggleTTS}
          onTextSettingsToggle={toggleTextSettings}
          onBookmarkToggle={bookmarkState.toggleBookmark}
          onFullscreenToggle={toggleFullscreen}
        />

        {/* TTS Panel */}
        {showTTS && !isImageBook && (
          <TTSPanel
            theme={theme}
            paragraphCount={paragraphs.length}
            state={tts.state}
            voices={tts.voices}
            selectedVoice={settings.ttsVoice}
            rate={settings.ttsRate}
            pitch={settings.ttsPitch}
            volume={settings.ttsVolume}
            autoAdvance={settings.ttsAutoAdvance}
            onPlay={() => tts.actions.play()}
            onPause={() => tts.actions.pause()}
            onStop={() => tts.actions.stop()}
            onPrev={() => tts.actions.skipPrev()}
            onNext={() => tts.actions.skipNext()}
            onVoiceChange={(v) => updateSetting("ttsVoice", v)}
            onRateChange={(r) => updateSetting("ttsRate", r)}
            onPitchChange={(p) => updateSetting("ttsPitch", p)}
            onVolumeChange={(v) => updateSetting("ttsVolume", v)}
            onAutoAdvanceChange={(a) => updateSetting("ttsAutoAdvance", a)}
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
        <div className="relative flex-1 overflow-hidden">
          {showTOC && chapters.length > 1 && (
            <TOCSidebar
              chapters={chapters} currentChapter={currentChapter}
              bookmarks={bookmarkState.bookmarks} theme={theme}
              onSelectChapter={handleChapterChange}
              onJumpToBookmark={() => {}}
              onDeleteBookmark={bookmarkState.removeBookmark}
              onClose={() => setShowTOC(false)}
            />
          )}

          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className={`h-6 w-6 animate-spin ${theme.muted}`} strokeWidth={1.5} />
            </div>
          ) : isTOCChapter(chapterTitle) ? (
            <div className="h-full overflow-y-auto" style={{ padding: `${settings.textPadding}px` }}>
              <BookTableOfContents
                chapters={chapters}
                currentChapter={currentChapter}
                theme={theme}
                onSelectChapter={handleChapterChange}
              />
            </div>
          ) : (
            <TextContent
              chapterTitle={chapterTitle}
              htmlParagraphs={chapter?.htmlParagraphs ?? []}
              theme={theme}
              fontFamily={settings.fontFamily}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              paraSpacing={settings.paraSpacing}
              padding={settings.textPadding}
              maxTextWidth={settings.maxTextWidth}
              animated={settings.animatedPageTurn}
              onPageChange={handlePageChange}
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

        {/* Footer — always below content, never overlapped by sidebar */}
        <ReaderFooter
          currentPage={currentPage} totalPages={totalPages}
          chapterIndex={currentChapter} chapterCount={chapters.length}
          chapterTitle={chapterTitle} theme={theme} immersiveMode={settings.immersiveMode}
          immersiveVisible={immersiveVisible}
          canGoPrev={currentChapter > 0} canGoNext={currentChapter < chapters.length - 1}
          onPrev={() => handleChapterChange(currentChapter - 1)}
          onNext={() => handleChapterChange(currentChapter + 1)}
        />
      </div>
    </div>
  );
}
