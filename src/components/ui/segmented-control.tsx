"use client";

/**
 * SegmentedControl — sliding-pill single choice (macOS / iOS style).
 * Adapted from 21st.dev "Segmented Control" (balick).
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  /** Accessible label when only an icon is shown. */
  title?: string;
  badge?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string>
  extends Omit<React.ComponentProps<"div">, "onChange" | "defaultValue"> {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  size?: "sm" | "md";
  /** Stretch segments to fill the container. */
  fill?: boolean;
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  fill = false,
  className,
  ...props
}: SegmentedControlProps<T>) {
  const pillId = React.useId();
  const reduceMotion = useReducedMotion();
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const option = options[(index + options.length) % options.length];
    onValueChange(option.value);
    buttons.current[options.indexOf(option)]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: options.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      select(moves[event.key]);
    }
  };

  return (
    <div
      role="radiogroup"
      className={cn(
        "relative inline-flex items-center rounded-full bg-fill-tertiary p-0.5",
        fill && "flex w-full",
        className,
      )}
      {...props}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.title}
            title={option.title}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "focus-ring relative inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-200",
              size === "sm" ? "h-6 px-2.5 text-xs" : "h-7 px-3 text-xs",
              option.icon && !option.label && (size === "sm" ? "w-7 px-0" : "w-8 px-0"),
              fill && "flex-1",
              selected ? "text-label" : "text-label-secondary hover:text-label",
            )}
          >
            {selected && (
              <motion.span
                layoutId={pillId}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.42 }}
                className="absolute inset-0 rounded-full bg-elevated shadow-sm ring-[0.5px] ring-separator-strong"
              />
            )}
            <span className="relative flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0">
              {option.icon}
              {option.label}
              {option.badge != null && (
                <span className="rounded-full bg-fill-secondary px-1.5 text-2xs tabular-nums text-label-secondary">
                  {option.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
