import { useEffect } from "react";

/**
 * Closes a panel when the user clicks outside of it.
 * Ignores clicks on elements matching `ignoreSelector` (e.g. toolbar buttons).
 * Uses a small delay before attaching the listener to avoid immediately
 * closing on the same click that opened the panel.
 */
export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  ignoreSelector?: string,
): void {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ignoreSelector && (e.target as Element)?.closest(ignoreSelector)) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [ref, onClose, ignoreSelector]);
}
