export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-inset)" }}>
      <div
        className="h-full rounded-full bg-[var(--accent-brand)] transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
