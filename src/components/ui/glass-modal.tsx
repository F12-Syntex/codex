"use client";

/**
 * GlassModal — the one centered modal for Codex.
 * Scrim + glass-thick panel with a spring "sheet" entrance (motion).
 * Inspired by 21st.dev "Animated Dialog" (rmahammad) choreography.
 *
 * Built on Radix Dialog: focus is trapped inside the panel, the panel itself
 * takes focus on open (no focus ring on ✕; Tab reaches the first control),
 * focus returns to the opener on close, and the rest of the page is inert to
 * pointer and assistive tech. Motion runs through `forceMount` +
 * AnimatePresence so the exit animation still plays.
 *
 *   <GlassModal open={open} onClose={close} title="Details" subtitle="…" width={560}>
 *     <GlassModal.Body>…</GlassModal.Body>
 *     <GlassModal.Footer>…buttons…</GlassModal.Footer>
 *   </GlassModal>
 */

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
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
  const panelRef = React.useRef<HTMLDivElement>(null);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content
                asChild
                forceMount
                aria-modal="true"
                // No subtitle → no description; say so explicitly (Radix warns otherwise).
                {...(subtitle ? {} : { "aria-describedby": undefined })}
                // Focus the panel, not its first control: opening Details or Recap
                // shouldn't paint a focus ring on ✕. An `autoFocus` child (e.g. a
                // confirm button) has already taken focus by now and keeps it.
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  const panel = panelRef.current;
                  if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
                }}
                // Esc is the modal's alone: keep it from reaching window-level
                // handlers (e.g. the reader's Esc chain, which closes the window).
                onEscapeKeyDown={(e) => {
                  e.stopPropagation();
                  if (!dismissible) e.preventDefault();
                }}
                onPointerDownOutside={(e) => {
                  if (!dismissible) e.preventDefault();
                }}
                onInteractOutside={(e) => {
                  if (!dismissible) e.preventDefault();
                }}
              >
                <motion.div
                  ref={panelRef}
                  tabIndex={-1}
                  className={cn(
                    "glass-thick relative flex flex-col overflow-hidden rounded-2xl text-label outline-none",
                    className,
                  )}
                  style={{ width, maxWidth: "100%", maxHeight }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96, filter: "blur(6px)" }}
                  // `filter: none` once settled — `blur(0px)` would stay a Backdrop Root
                  // and kill the blur of glass nested in the panel (conventions §2).
                  animate={
                    reduce
                      ? { opacity: 1 }
                      : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }
                  }
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)" }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34, mass: 0.9 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Radix needs a title for assistive tech even when none is shown. */}
                  {!title && <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>}
                  {(title || !hideClose) && (
                    <div className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-3">
                      {icon && <div className="shrink-0">{icon}</div>}
                      <div className="min-w-0 flex-1">
                        {title && (
                          <DialogPrimitive.Title asChild>
                            <h2 className="text-title truncate font-display text-label">{title}</h2>
                          </DialogPrimitive.Title>
                        )}
                        {subtitle && (
                          <DialogPrimitive.Description asChild>
                            <p className="mt-0.5 text-xs text-label-secondary">{subtitle}</p>
                          </DialogPrimitive.Description>
                        )}
                      </div>
                      {headerActions}
                      {!hideClose && (
                        <DialogPrimitive.Close asChild>
                          <button
                            type="button"
                            aria-label="Close"
                            className="focus-ring pressable -mt-0.5 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary hover:bg-fill-secondary hover:text-label"
                          >
                            <X className="size-3.5" strokeWidth={2.25} />
                          </button>
                        </DialogPrimitive.Close>
                      )}
                    </div>
                  )}
                  {children}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
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
