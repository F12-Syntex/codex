"use client";

/**
 * NumberStepper — pill stepper with rolling digits, press-and-hold
 * acceleration and a small shake at the bounds.
 * Adapted from 21st.dev "Quantity Stepper" (Spectrum UI / arihantcodes) —
 * motion/react, Codex tokens, optional custom glyphs and formatter.
 *
 *   <NumberStepper value={18} min={14} max={28} onValueChange={setSize}
 *     decrementIcon={<span className="text-xs">A</span>} incrementIcon={<span className="text-base">A</span>} />
 */

import * as React from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NumberStepperProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Formats the displayed value. */
  format?: (value: number) => React.ReactNode;
  /** Accessible name for the value. */
  label?: string;
  decrementIcon?: React.ReactNode;
  incrementIcon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

const HOLD_DELAY = 380;
const HOLD_INTERVAL = 90;
const HOLD_FAST_INTERVAL = 45;
const HOLD_FAST_AFTER = 8;
const SHAKE = [0, -4, 4, -2, 2, 0];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const rollVariants = {
  enter: (dir: number) => ({ y: dir * 10, opacity: 0 }),
  center: { y: 0, opacity: 1 },
  exit: (dir: number) => ({ y: dir * -10, opacity: 0 }),
};

export function NumberStepper({
  value,
  onValueChange,
  min = 0,
  max = 99,
  step = 1,
  format,
  label = "Value",
  decrementIcon,
  incrementIcon,
  disabled = false,
  className,
}: NumberStepperProps) {
  const reduceMotion = useReducedMotion();
  const shake = useAnimationControls();
  const [direction, setDirection] = React.useState(1);
  const [repeating, setRepeating] = React.useState(false);
  const [blocked, setBlocked] = React.useState(0);

  const current = clamp(value, min, max);
  const valueRef = React.useRef(current);
  React.useEffect(() => {
    valueRef.current = current;
  }, [current]);

  const delayRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = React.useRef(0);

  const stopRepeat = React.useCallback(() => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (repeatRef.current) clearInterval(repeatRef.current);
    delayRef.current = null;
    repeatRef.current = null;
    countRef.current = 0;
    setRepeating(false);
  }, []);
  React.useEffect(() => stopRepeat, [stopRepeat]);

  React.useEffect(() => {
    if (blocked === 0) return;
    if (!reduceMotion) {
      shake.set({ x: 0 });
      void shake.start({ x: SHAKE, transition: { duration: 0.3, ease: "easeInOut" } });
    }
    const id = setTimeout(() => setBlocked(0), 400);
    return () => clearTimeout(id);
  }, [blocked, reduceMotion, shake]);

  const stepBy = React.useCallback(
    (delta: number) => {
      // Round to avoid float drift (e.g. 1.2 + 0.1)
      const next = clamp(Math.round((valueRef.current + delta) * 1000) / 1000, min, max);
      if (next === valueRef.current) {
        setBlocked((n) => n + 1);
        return false;
      }
      valueRef.current = next;
      setDirection(delta > 0 ? 1 : -1);
      onValueChange(next);
      return true;
    },
    [min, max, onValueChange],
  );

  const startHold = (delta: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    stopRepeat();
    if (!stepBy(delta)) return;
    delayRef.current = setTimeout(() => {
      setRepeating(true);
      const tick = () => {
        if (!stepBy(delta)) return stopRepeat();
        countRef.current += 1;
        if (countRef.current === HOLD_FAST_AFTER) {
          if (repeatRef.current) clearInterval(repeatRef.current);
          repeatRef.current = setInterval(tick, HOLD_FAST_INTERVAL);
        }
      };
      repeatRef.current = setInterval(tick, HOLD_INTERVAL);
    }, HOLD_DELAY);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step };
    if (!(e.key in moves)) return;
    e.preventDefault();
    e.stopPropagation();
    stepBy(moves[e.key]);
  };

  const roll = reduceMotion || blocked > 0
    ? { duration: 0 }
    : repeating
      ? { duration: 0.09, ease: "easeOut" as const }
      : { type: "spring" as const, stiffness: 420, damping: 30 };

  const btn =
    "focus-ring flex size-7 shrink-0 items-center justify-center rounded-full text-label-secondary transition-colors duration-150 hover:bg-fill-tertiary hover:text-label disabled:opacity-30";

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex h-8 select-none items-center gap-0.5 rounded-full bg-fill-tertiary px-0.5",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || current <= min}
        onPointerDown={startHold(-step)}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        whileTap={reduceMotion ? undefined : { scale: 0.85 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={btn}
      >
        {decrementIcon ?? <Minus className="size-3.5" strokeWidth={2} />}
      </motion.button>

      <motion.span
        role="spinbutton"
        aria-label={label}
        aria-valuenow={current}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        animate={shake}
        className={cn(
          "focus-ring flex h-7 min-w-9 items-center justify-center overflow-hidden rounded-full px-1 text-xs font-medium tabular-nums transition-colors",
          blocked > 0 ? "text-danger" : "text-label",
        )}
      >
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.span
            key={current}
            className="inline-block"
            custom={direction}
            variants={rollVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={roll}
          >
            {format ? format(current) : current}
          </motion.span>
        </AnimatePresence>
      </motion.span>

      <motion.button
        type="button"
        tabIndex={-1}
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || current >= max}
        onPointerDown={startHold(step)}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        whileTap={reduceMotion ? undefined : { scale: 0.85 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={btn}
      >
        {incrementIcon ?? <Plus className="size-3.5" strokeWidth={2} />}
      </motion.button>
    </div>
  );
}

export default NumberStepper;
