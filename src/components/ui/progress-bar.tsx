import { cn } from "@/lib/utils";

/**
 * ProgressBar — a recessed capsule track with an accent fill whose leading
 * edge carries a faint ink bloom. `indeterminate` sweeps a shimmer band.
 */
export function ProgressBar({
  value,
  indeterminate = false,
  className,
}: {
  value: number;
  indeterminate?: boolean;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      className={cn(
        "relative h-1 w-full overflow-hidden rounded-full bg-fill-tertiary shadow-[inset_0_1px_1px_0_var(--bg-inset)]",
        className,
      )}
    >
      {indeterminate ? (
        <div
          className="absolute inset-0 animate-shimmer rounded-full motion-reduce:animate-none"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent 0%, var(--accent-brand) 50%, transparent 100%)",
            backgroundSize: "50% 100%",
            backgroundRepeat: "no-repeat",
          }}
        />
      ) : (
        <div
          className="h-full rounded-full bg-brand shadow-[0_0_8px_0_var(--accent-brand)] transition-[width] duration-500 ease-apple"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

export default ProgressBar;
