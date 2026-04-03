/* ── CommentInput — Reusable inline comment input with send button ── */

import { Send } from "lucide-react";

interface CommentInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function CommentInput({ value, onChange, onSubmit, onCancel }: CommentInputProps) {
  const hasText = value.trim().length > 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <input
        type="text"
        placeholder="Add your thoughts..."
        value={value}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && hasText) onSubmit();
          if (e.key === "Escape") onCancel();
        }}
        style={{
          flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "6px", padding: "5px 8px", fontSize: "11px", outline: "none",
          color: "rgba(255,255,255,0.8)",
        }}
      />
      <button
        onClick={() => { if (hasText) onSubmit(); }}
        style={{
          flexShrink: 0, width: "24px", height: "24px", borderRadius: "6px",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: hasText ? "var(--accent-brand)" : "rgba(255,255,255,0.04)",
          border: "none", cursor: hasText ? "pointer" : "default",
          color: hasText ? "white" : "rgba(255,255,255,0.3)",
        }}
      ><Send style={{ width: "10px", height: "10px" }} strokeWidth={2} /></button>
    </div>
  );
}
