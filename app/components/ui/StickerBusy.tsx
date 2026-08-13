"use client";

import { useEffect, useState } from "react";

const GENERATING_LINES = [
  "Peeling a reply…",
  "Stamping thoughts…",
  "Almost stuck…",
  "Brewing…",
  "Pressing ink…",
];

const THINKING_LINES = [
  "Thinking…",
  "Chewing on it…",
  "Scratching notes…",
];

type StickerBusyProps = {
  mode?: "generating" | "thinking";
  className?: string;
};

export function StickerBusy({ mode = "generating", className = "" }: StickerBusyProps) {
  const lines = mode === "thinking" ? THINKING_LINES : GENERATING_LINES;
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLineIdx((i) => (i + 1) % lines.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [lines.length]);

  return (
    <div
      className={`sticker relative flex w-fit items-center gap-3 !rounded-2xl px-3.5 py-2.5 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={mode === "thinking" ? "Thinking" : "Generating"}
    >
      <span className="stamp-stack" aria-hidden>
        <span className="stamp-chip stamp-chip-a" />
        <span className="stamp-chip stamp-chip-b" />
        <span className="stamp-chip stamp-chip-c" />
      </span>

      <div className="min-w-0 pr-1">
        <p
          key={lineIdx}
          className="busy-line font-display text-[13px] font-bold uppercase tracking-[0.06em] text-foreground"
        >
          {lines[lineIdx]}
        </p>
        <span className="mt-1.5 flex items-center gap-1.5" aria-hidden>
          <span className="sticker-pulse" />
          <span className="sticker-pulse sticker-pulse-delay-1" />
          <span className="sticker-pulse sticker-pulse-delay-2" />
        </span>
      </div>
    </div>
  );
}
