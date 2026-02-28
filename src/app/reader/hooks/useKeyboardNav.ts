"use client";

import { useEffect } from "react";

interface UseKeyboardNavOptions {
  onLeft: () => void;
  onRight: () => void;
  onSpace: () => void;
  onEscape: () => void;
  onBookmark: () => void;
  enabled?: boolean;
}

export function useKeyboardNav({
  onLeft,
  onRight,
  onSpace,
  onEscape,
  onBookmark,
  enabled = true,
}: UseKeyboardNavOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          onLeft();
          break;
        case "ArrowRight":
          e.preventDefault();
          onRight();
          break;
        case " ":
          if (!e.repeat) {
            e.preventDefault();
            onSpace();
          }
          break;
        case "Escape":
          onEscape();
          break;
        case "b":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onBookmark();
          }
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onLeft, onRight, onSpace, onEscape, onBookmark]);
}
