"use client";

/**
 * GlassModal — the one centered modal for Codex.
 * Scrim + glass-thick panel with a spring "sheet" entrance (motion).
 * Inspired by 21st.dev "Animated Dialog" (rmahammad) choreography.
 *
 *   <GlassModal open={open} onClose={close} title="Details" subtitle="…" width={560}>
 *     <GlassModal.Body>…</GlassModal.Body>
 *     <GlassModal.Footer>…buttons…</GlassModal.Footer>
 *   </GlassModal>
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Leading visual in the header (icon tile, cover thumbnail…) */
  icon?: React.ReactNode;
  /** Extra controls placed left of the close button. */
  headerActions?: React.ReactNode;
  width?: number | string;
  /** Max height of the panel; body scrolls. Default 82vh. */
  maxHeight?: number | string;
  hideClose?: boolean;
  /** Prevent closing via scrim click / Escape (e.g. while busy). */
  dismissible?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function GlassModalRoot({
  open,
  onClose,
  title,
  subtitle,
  icon,
  headerActions,
  width = 520,
  maxHeight = "82vh",
  hideClose = false,
  dismissible = true,
  className,
  children,
}: GlassModalProps) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, dismissible, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
          <motion.div
            className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              "glass-thick relative flex flex-col overflow-hidden rounded-2xl text-label",
              className,
            )}
            style={{ width, maxWidth: "100%", maxHeight }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)" }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || !hideClose) && (
              <div className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-3">
                {icon && <div className="shrink-0">{icon}</div>}
                <div className="min-w-0 flex-1">
                  {title && <h2 className="text-title truncate font-display text-label">{title}</h2>}
                  {subtitle && <p className="mt-0.5 text-xs text-label-secondary">{subtitle}</p>}
                </div>
                {headerActions}
                {!hideClose && (
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    className="focus-ring pressable -mt-0.5 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary hover:bg-fill-secondary hover:text-label"
                  >
                    <X className="size-3.5" strokeWidth={2.25} />
                  </button>
                )}
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function GlassModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-5", className)} {...props} />;
}

function GlassModalFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t border-separator px-5 py-3.5",
        className,
      )}
      {...props}
    />
  );
}

export const GlassModal = Object.assign(GlassModalRoot, {
  Body: GlassModalBody,
  Footer: GlassModalFooter,
});

export default GlassModal;
