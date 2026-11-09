/**
 * EmptyState — centred "nothing here yet" block: an icon in a soft glass
 * circle with a faint accent ink bloom, a serif headline, one line of help
 * and an optional action.
 * Adapted from 21st.dev "Empty State" (serafimcloud, id 1435): same lifted
 * icon tile + hover rise, re-styled for the Glass system.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "group/empty flex animate-fade-up flex-col items-center justify-center px-8 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="relative mb-5">
          <div aria-hidden className="absolute -inset-5 rounded-full bg-brand/10 blur-2xl" />
          <div className="glass-thin relative grid size-14 place-items-center rounded-full text-label-tertiary transition-transform duration-500 ease-spring group-hover/empty:-translate-y-0.5 [&_svg]:size-6 [&_svg]:shrink-0">
            {icon}
          </div>
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-label text-balance">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm text-label-secondary text-balance">{description}</p>
      )}
      {action && <div className="mt-5 flex items-center gap-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
