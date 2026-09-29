"use client";

import { useId, useState } from "react";
import { formatCompactNumber } from "../../lib/formatNumber";

type ModelUsage = { model: string; requests: number; tokens: number };
const tabs = ["Request", "Tokens", "Usage"] as const;
const colors = ["#75b900", "#4489df", "#af79d9", "#e69b38", "#36a899", "#db7496"];

export function ModelUsageChart({ rows, loading = false, error }: {
  rows: ModelUsage[];
  loading?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const [tab, setTab] = useState<typeof tabs[number]>("Request");
  const metric = tab === "Tokens" ? "tokens" : "requests";
  const models = rows.map((row, i) => ({
    ...row,
    value: Number.isFinite(row[metric]) ? Math.max(0, row[metric]) : 0,
    color: colors[i % colors.length],
  })).sort((a, b) => b.value - a.value || a.model.localeCompare(b.model));
  const total = models.reduce((sum, row) => sum + row.value, 0);
  const max = models[0]?.value || 1;
  const slices = models.reduce<{ model: string; color: string; value: number; start: number; end: number }[]>((result, row) => {
    const start = result.at(-1)?.end ?? 0;
    result.push({ ...row, start, end: start + (total ? row.value / total : 0) });
    return result;
  }, []);
  const percent = (value: number) => {
    const share = total ? value / total * 100 : 0;
    return share > 0 && share < 0.1 ? "<0.1%" : `${Number(share.toFixed(1))}%`;
  };

  return (
    <section aria-labelledby={`${id}-title`} className="sticker min-w-0 rounded-xl p-4 sm:rounded-2xl sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
        <h3 id={`${id}-title`} className="text-sm font-bold">By model</h3>
        <div role="tablist" aria-label="Model usage metric" className="flex rounded-lg border border-border/60 bg-background p-1 text-xs font-semibold">
          {tabs.map((name, index) => (
            <button key={name} type="button" role="tab" id={`${id}-${name}`} aria-selected={tab === name}
              aria-controls={`${id}-panel`} tabIndex={tab === name ? 0 : -1}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                setTab(tabs[next]);
                document.getElementById(`${id}-${tabs[next]}`)?.focus();
              }}
              className={`min-h-9 cursor-pointer rounded-md px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nvidia-green ${tab === name ? "bg-panel text-foreground shadow-sm" : "text-muted hover:bg-panel-hover hover:text-foreground"}`}
            >{name}</button>
          ))}
        </div>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} aria-busy={loading} tabIndex={0} className="mt-5 min-h-48 focus-visible:outline-2 focus-visible:outline-nvidia-green">
        {loading ? (
          <div role="status" className="flex h-48 items-center justify-center text-sm text-muted">Loading model usage…</div>
        ) : error ? (
          <p role="alert" className="py-16 text-center text-sm text-alert">{error}</p>
        ) : total === 0 ? (
          <p className="py-16 text-center text-sm text-muted">{tab === "Tokens" ? "No tokens recorded in this period." : "No model requests in this period."}</p>
        ) : tab === "Usage" ? (
          <>
            <p className="mb-5 text-xs text-muted">Share of requests across the models shown</p>
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
              <svg viewBox="0 0 200 200" role="img" aria-label="Request share by model" className="w-48 shrink-0 sm:w-52">
                {slices.filter((slice) => slice.value > 0).map((slice) => {
                  const start = slice.start * Math.PI * 2 - Math.PI / 2;
                  const end = slice.end * Math.PI * 2 - Math.PI / 2;
                  const label = `${slice.model}: ${percent(slice.value)} (${slice.value.toLocaleString()} requests)`;
                  return slice.value === total ? (
                    <circle key={slice.model} cx="100" cy="100" r="94" fill={slice.color}><title>{label}</title></circle>
                  ) : (
                    <path key={slice.model} d={`M100 100 L${100 + 94 * Math.cos(start)} ${100 + 94 * Math.sin(start)} A94 94 0 ${slice.end - slice.start > 0.5 ? 1 : 0} 1 ${100 + 94 * Math.cos(end)} ${100 + 94 * Math.sin(end)} Z`}
                      fill={slice.color} stroke="var(--panel)" strokeWidth="2" className="transition-opacity hover:opacity-80"><title>{label}</title></path>
                  );
                })}
              </svg>
              <ul className="w-full min-w-0 space-y-3">
                {models.map((row) => (
                  <li key={row.model} className="flex items-start gap-2.5 text-sm">
                    <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
                    <span className="min-w-0 flex-1 break-all">{row.model}</span>
                    <span className="shrink-0 font-semibold tabular-nums" title={`${row.value.toLocaleString()} requests`}>{percent(row.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 flex justify-between gap-3 text-xs text-muted"><span>{tab === "Tokens" ? "Tokens" : "Requests"} by model</span><span className="tabular-nums">{total.toLocaleString()} total</span></div>
            <ul aria-label={`${tab === "Tokens" ? "Tokens" : "Requests"} by model`} className="space-y-5">
              {models.map((row) => (
                <li key={row.model}>
                  <div className="mb-2 flex items-start justify-between gap-4 text-sm">
                    <span className="min-w-0 break-all">{row.model}</span>
                    <span className="shrink-0 font-semibold tabular-nums" title={row.value.toLocaleString()}>{formatCompactNumber(row.value)}</span>
                  </div>
                  <div aria-hidden="true" className="h-3 overflow-hidden rounded-sm bg-foreground/5">
                    <div className="h-full rounded-sm motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${row.value / max * 100}%`, backgroundColor: row.color }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
