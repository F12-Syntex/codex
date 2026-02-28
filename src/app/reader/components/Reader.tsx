"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { getThemeClasses } from "../lib/theme";
import type { BookContent, ReaderBookmark, CustomFont } from "../lib/types";
import { useReaderSettings } from "../hooks/useReaderSettings";
import { useScroll } from "../hooks/useScroll";
import { useTTS } from "../hooks/useTTS";
import { useBookmarks } from "../hooks/useBookmarks";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import { ReaderHeader } from "./ReaderHeader";
import { ReaderFooter, FOOTER_HEIGHT } from "./ReaderFooter";
import { TOCSidebar } from "./TOCSidebar";
import { TTSPanel } from "./TTSPanel";
import { TextSettingsPanel } from "./TextSettingsPanel";
import { TextContent } from "./TextContent";
import { ImagePage } from "./ImagePage";

interface ReaderProps {
  filePath: string;
  format: string;
  title: string;
  author: string;
}

export function Reader({ filePath, format, title, author }: ReaderProps) {
  // Book content
  const [bookContent, setBookContent] = useState<BookContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);

  // UI state
  const [showTOC, setShowTOC] = useState(false);
  const [showTTS, setShowTTS] = useState(false);
  const [showTextSettings, setShowTextSettings] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [immersiveVisible, setImmersiveVisible] = useState(true);

  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Settings
  const { settings, updateSetting, isLoaded } = useReaderSettings();
  const theme = getThemeClasses(settings.readingTheme);

  // Derived values
  const chapters = bookContent?.chapters ?? [];
  const chapter = chapters[currentChapter];
  const paragraphs = chapter?.paragraphs ?? [];
  const isImageBook = bookContent?.isImageBook ?? false;
  const chapterTitle = chapter?.title ?? `Chapter ${currentChapter + 1}`;

  // Scroll — only used for image books now
  const scroll = useScroll({
    isImageBook,
    itemCount: paragraphs.length,
    onChapterChange: (delta) => {
      const next = currentChapter + delta;
      if (next >= 0 && next < chapters.length) {
        handleChapterChange(next);
      }
    },
  });

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
        setTimeout(() => tts.actions.play(0), 300);
      }
    },
  });

  // Bookmarks
  const bookmarkState = useBookmarks({
    filePath,
    chapterIndex: currentChapter,
    paragraphIndex: isImageBook ? scroll.currentIndex : 0,
    chapterTitle,
  });

  // Load book content
  useEffect(() => {
    if (!filePath) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    window.electronAPI
      ?.getBookContent(filePath, format)
      .then((content) => {
        setBookContent(content);
        setIsLoading(false);
      })
      .catch(() => {
        setBookContent({
          chapters: [
            {
              title: "Error",
              paragraphs: ["Failed to load book content."],
              htmlParagraphs: ["<p>Failed to load book content.</p>"],
            },
          ],
          isImageBook: false,
        });
        setIsLoading(false);
      });
  }, [filePath, format]);

  // Window events
  useEffect(() => {
    window.electronAPI?.onMaximized(setMaximized);
  }, []);

  // Immersive mode: show footer on mouse proximity to bottom
  useEffect(() => {
    if (!settings.immersiveMode) {
      setImmersiveVisible(true);
      return;
    }

    const handler = (e: MouseEvent) => {
      const distFromBottom = window.innerHeight - e.clientY;
      if (distFromBottom < 80) {
        setImmersiveVisible(true);
        if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);
        immersiveTimerRef.current = setTimeout(() => setImmersiveVisible(false), 2500);
      }
    };

    window.addEventListener("mousemove", handler);
    return () => {
      window.removeEventListener("mousemove", handler);
      if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);
    };
  }, [settings.immersiveMode]);

  // Chapter change handler
  const handleChapterChange = useCallback((index: number) => {
    tts.actions.stop();
    setCurrentChapter(index);
    scroll.resetScroll();
    setShowTOC(false);
  }, [tts.actions, scroll]);

  // Toggle functions that close other panels
  const toggleTOC = useCallback(() => {
    setShowTTS(false);
    setShowTextSettings(false);
    setShowTOC((v) => !v);
  }, []);

  const toggleTTS = useCallback(() => {
    setShowTOC(false);
    setShowTextSettings(false);
    setShowTTS((v) => !v);
  }, []);

  const toggleTextSettings = useCallback(() => {
    setShowTOC(false);
    setShowTTS(false);
    setShowTextSettings((v) => !v);
  }, []);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Handle escape
  const handleEscape = useCallback(() => {
    if (showTextSettings) {
      setShowTextSettings(false);
    } else if (showTOC) {
      setShowTOC(false);
    } else if (showTTS) {
      setShowTTS(false);
    } else if (tts.state.status === "playing" || tts.state.status === "paused") {
      tts.actions.stop();
    } else if (isFullscreen) {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    } else {
      window.electronAPI?.close();
    }
  }, [showTextSettings, showTOC, showTTS, tts.state.status, tts.actions, isFullscreen]);

  // Keyboard navigation — only image nav for now
  useKeyboardNav({
    onLeft: isImageBook ? scroll.scrollPrev : () => {},
    onRight: isImageBook ? scroll.scrollNext : () => {},
    onSpace: () => {
      if (isImageBook) return;
      if (tts.state.status === "playing") {
        tts.actions.pause();
      } else {
        tts.actions.play();
      }
    },
    onEscape: handleEscape,
    onBookmark: bookmarkState.toggleBookmark,
    enabled: true,
  });

  // Jump to bookmark
  const handleJumpToBookmark = useCallback((bm: ReaderBookmark) => {
    if (bm.chapterIndex !== currentChapter) {
      tts.actions.stop();
      setCurrentChapter(bm.chapterIndex);
      scroll.resetScroll();
    }
    if (isImageBook) {
      scroll.goToIndex(bm.paragraphIndex);
    }
    setShowTOC(false);
  }, [currentChapter, isImageBook, tts.actions, scroll]);

  if (!isLoaded) return null;

  const isTTSActive = tts.state.status !== "idle";
  const footerHeight = settings.immersiveMode && !immersiveVisible ? 0 : FOOTER_HEIGHT;

  return (
    <div className={`flex h-screen flex-col ${theme.bg} transition-colors duration-300`}>
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes slideInLeft { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`,
        }}
      />

      {/* Header */}
      <header className={`relative shrink-0 border-b ${theme.surface} ${theme.border}`}>
        <ReaderHeader
          title={title}
          author={author}
          theme={theme}
          readingTheme={settings.readingTheme}
          maximized={maximized}
          isFullscreen={isFullscreen}
          hasMultipleChapters={chapters.length > 1}
          isImageBook={isImageBook}
          isBookmarked={!!bookmarkState.currentBookmark}
          isTTSActive={isTTSActive}
          showTOC={showTOC}
          showTTS={showTTS}
          showTextSettings={showTextSettings}
          onThemeChange={(t) => updateSetting("readingTheme", t)}
          onTOCToggle={toggleTOC}
          onTTSToggle={toggleTTS}
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
            theme={theme}
            fontFamily={settings.fontFamily}
            fontSize={settings.fontSize}
            lineHeight={settings.lineHeight}
            paraSpacing={settings.paraSpacing}
            textPadding={settings.textPadding}
            maxTextWidth={settings.maxTextWidth}
            animatedPageTurn={settings.animatedPageTurn}
            immersiveMode={settings.immersiveMode}
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

      {/* Main area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* TOC Sidebar (overlay) */}
        {showTOC && chapters.length > 1 && (
          <TOCSidebar
            chapters={chapters}
            currentChapter={currentChapter}
            bookmarks={bookmarkState.bookmarks}
            theme={theme}
            onSelectChapter={handleChapterChange}
            onJumpToBookmark={handleJumpToBookmark}
            onDeleteBookmark={bookmarkState.removeBookmark}
            onClose={() => setShowTOC(false)}
          />
        )}

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className={`h-6 w-6 animate-spin ${theme.muted}`} strokeWidth={1.5} />
                <span className={`text-[13px] ${theme.muted}`}>Loading book...</span>
              </div>
            </div>
          ) : isImageBook ? (
            <div className="flex-1 overflow-hidden">
              <ImagePage
                src={paragraphs[scroll.currentIndex] ?? ""}
                alt={`Page ${scroll.currentIndex + 1}`}
              />
            </div>
          ) : (
            <TextContent
              paragraphs={paragraphs}
              theme={theme}
              chapterTitle={chapterTitle}
              fontFamily={settings.fontFamily}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              paraSpacing={settings.paraSpacing}
              textPadding={settings.textPadding}
              maxTextWidth={settings.maxTextWidth}
              animatedPageTurn={settings.animatedPageTurn}
              footerHeight={footerHeight}
            />
          )}

          {/* Footer */}
          <ReaderFooter
            currentPage={isImageBook ? scroll.currentIndex : 0}
            totalPages={isImageBook ? paragraphs.length : 1}
            chapterIndex={currentChapter}
            chapterCount={chapters.length}
            theme={theme}
            immersiveMode={settings.immersiveMode}
            immersiveVisible={immersiveVisible}
            canGoPrev={isImageBook ? (currentChapter > 0 || scroll.currentIndex > 0) : currentChapter > 0}
            canGoNext={isImageBook ? (currentChapter < chapters.length - 1 || scroll.currentIndex < paragraphs.length - 1) : currentChapter < chapters.length - 1}
            onPrev={isImageBook ? scroll.scrollPrev : () => {}}
            onNext={isImageBook ? scroll.scrollNext : () => {}}
          />
        </div>
      </div>
    </div>
  );
}
