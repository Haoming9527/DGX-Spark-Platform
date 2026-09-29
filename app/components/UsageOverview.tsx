"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Zap, Activity, HelpCircle } from "lucide-react";
import { formatCompactNumber } from "../../lib/formatNumber";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  total_tokens: number;
  total_requests: number;
}

interface UsageOverviewProps {
  keys: ApiKey[];
  keysLoading: boolean;
  onKeyClick: (key: ApiKey) => void;
}

interface UsageSummary {
  tokens: number;
  requests: number;
}

export function UsageOverview({ keys, keysLoading, onKeyClick }: UsageOverviewProps) {
  const [metric, setMetric] = useState<"tokens" | "requests">("tokens");
  const [timeframe, setTimeframe] = useState<"1h" | "24h" | "7d" | "30d">("7d");
  const [usageByKeyId, setUsageByKeyId] = useState<Record<string, UsageSummary>>({});
  const [byModel, setByModel] = useState<{ model: string; requests: number; tokens: number }[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const keyIds = useMemo(() => keys.map((key) => key.id).join(","), [keys]);

  useEffect(() => {
    if (keys.length === 0) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setUsageLoading(true);
      setUsageError(null);
    }, 0);

    fetch(`/api/apikeys/usage-summary?timeframe=${timeframe}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load usage metrics.");
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const nextUsage: Record<string, UsageSummary> = {};
        for (const row of data.usage || []) {
          nextUsage[row.id] = {
            tokens: row.tokens || 0,
            requests: row.requests || 0,
          };
        }
        setUsageByKeyId(nextUsage);
        setByModel(Array.isArray(data.byModel) ? data.byModel : []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Error loading usage summary:", err);
        setUsageByKeyId({});
        setByModel([]);
        setUsageError(err instanceof Error ? err.message : "Failed to load usage metrics.");
      })
      .finally(() => {
        clearTimeout(timer);
        if (!controller.signal.aborted) {
          setUsageLoading(false);
        }
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [keyIds, keys.length, timeframe]);

  const keysWithTimeframeUsage = useMemo(() => {
    return keys.map((key) => {
      const usage = usageByKeyId[key.id] || { tokens: 0, requests: 0 };

      return {
        ...key,
        tokens: usage.tokens,
        requests: usage.requests,
      };
    });
  }, [keys, usageByKeyId]);

  const totalTokens = useMemo(() => {
    return keysWithTimeframeUsage.reduce((s, k) => s + k.tokens, 0);
  }, [keysWithTimeframeUsage]);

  const totalRequests = useMemo(() => {
    return keysWithTimeframeUsage.reduce((s, k) => s + k.requests, 0);
  }, [keysWithTimeframeUsage]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex justify-start sm:justify-end">
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value as "1h" | "24h" | "7d" | "30d")}
          className="h-9 w-full sm:w-auto bg-background border border-border/60 hover:border-nvidia-green/40 rounded-lg px-3.5 py-2 text-xs font-semibold text-foreground/80 outline-none transition-all cursor-pointer focus:border-nvidia-green/50 focus:ring-1 focus:ring-nvidia-green/20"
        >
          <option value="1h">Past 1 hour</option>
          <option value="24h">Past 24 hours</option>
          <option value="7d">Past 7 days</option>
          <option value="30d">Past 30 days</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="sticker rounded-xl sm:rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-nvidia-green/10 flex items-center justify-center text-nvidia-green">
            <Zap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-0.5 text-xs font-medium text-foreground/40">Total Tokens</div>
            {usageLoading && keys.length === 0 ? (
              <div className="h-7 w-20 animate-pulse rounded bg-border" />
            ) : (
              <div
                className={`text-xl font-bold tabular-nums ${usageLoading ? "animate-pulse" : ""}`}
                title={totalTokens.toLocaleString()}
              >
                {formatCompactNumber(totalTokens)}
              </div>
            )}
          </div>
        </div>

        <div className="sticker rounded-xl sm:rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-0.5 text-xs font-medium text-foreground/40">Total Requests</div>
            {usageLoading && keys.length === 0 ? (
              <div className="h-7 w-20 animate-pulse rounded bg-border" />
            ) : (
              <div
                className={`text-xl font-bold tabular-nums ${usageLoading ? "animate-pulse" : ""}`}
                title={totalRequests.toLocaleString()}
              >
                {formatCompactNumber(totalRequests)}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="sticker rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-4 h-4 text-nvidia-green" />
            <span className="text-sm font-bold">Key Usage Analytics</span>
          </div>
          <div className="flex w-full sm:w-auto bg-background border border-border/60 rounded-lg p-0.5 text-xs font-semibold shrink-0">
            <button
              onClick={() => setMetric("tokens")}
              className={`flex-1 sm:flex-none px-3 py-1 rounded-md transition-all cursor-pointer ${
                metric === "tokens"
                  ? "bg-nvidia-green/15 text-nvidia-green border border-nvidia-green/20"
                  : "text-foreground/40 hover:text-foreground/70"
              }`}
            >
              Tokens
            </button>
            <button
              onClick={() => setMetric("requests")}
              className={`flex-1 sm:flex-none px-3 py-1 rounded-md transition-all cursor-pointer ${
                metric === "requests"
                  ? "bg-nvidia-green/15 text-nvidia-green border border-nvidia-green/20"
                  : "text-foreground/40 hover:text-foreground/70"
              }`}
            >
              Requests
            </button>
          </div>
        </div>

        {keysLoading && keys.length === 0 ? (
          <div className="overflow-hidden rounded-lg border border-border sm:rounded-xl">
            <div className="hidden grid-cols-[2fr_1.5fr_1.5fr] gap-4 border-b border-border/30 bg-background/40 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-foreground/30 sm:grid">
              <span>Key Name</span>
              <span>Key Prefix</span>
              <span className="text-right">Usage ({metric === "tokens" ? "Tokens" : "Requests"})</span>
            </div>
            <div className="divide-y divide-border/20">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-1 items-center gap-2 px-4 py-3.5 sm:grid-cols-[2fr_1.5fr_1.5fr] sm:gap-4 sm:px-5">
                  <div className="h-4 w-28 animate-pulse rounded bg-border" />
                  <div className="h-5 w-24 animate-pulse rounded bg-border" />
                  <div className="ml-auto h-4 w-16 animate-pulse rounded bg-border" />
                </div>
              ))}
            </div>
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-foreground/30 text-center">
            <HelpCircle className="w-8 h-8 opacity-30" />
            <p className="text-sm">No usage records found. Active API keys will display graphs here.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border divide-y divide-border/30 bg-background/20 sm:rounded-xl">
            {usageError && (
              <div className="border-b border-alert/20 bg-alert/10 px-4 py-2 text-xs text-alert">{usageError}</div>
            )}
            <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1.5fr] gap-4 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-foreground/30 border-b border-border/30 bg-background/40">
              <span>Key Name</span>
              <span>Key Prefix</span>
              <span className="text-right">Usage ({metric === "tokens" ? "Tokens" : "Requests"})</span>
            </div>
            <div className="divide-y divide-border/20">
              {keysWithTimeframeUsage.map((key) => {
                const currentVal = metric === "tokens" ? key.tokens : key.requests;

                return (
                  <div
                    key={key.id}
                    onClick={() => onKeyClick(key)}
                    className="grid grid-cols-1 sm:grid-cols-[2fr_1.5fr_1.5fr] gap-2 sm:gap-4 items-center px-4 sm:px-5 py-3.5 group cursor-pointer hover:bg-white/[0.02] transition-colors"
                    title={`Click to view detailed timeline graph for ${key.name}`}
                  >
                    <div className="font-semibold text-sm text-foreground truncate group-hover:text-nvidia-green transition-colors">
                      {key.name}
                    </div>
                    <div className="min-w-0">
                      <code className="text-xs font-mono text-foreground/50 bg-background border border-border/50 rounded px-2 py-0.5 whitespace-nowrap">
                        {key.key_prefix}...
                      </code>
                    </div>
                    <div className="flex justify-between font-bold tabular-nums text-sm sm:block sm:text-right">
                      <span className="text-xs font-semibold text-foreground/35 sm:hidden">Usage</span>
                      {usageLoading ? (
                        <span className="inline-block h-4 w-14 animate-pulse rounded bg-border" />
                      ) : (
                        <span title={currentVal.toLocaleString()}>{formatCompactNumber(currentVal)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {keys.length > 0 && byModel.length > 0 && (
        <div className="sticker rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-3">
          <div className="text-sm font-bold">By model</div>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {byModel.map((row) => {
              const share = totalRequests > 0 ? Math.round((row.requests / totalRequests) * 100) : 0;
              return (
                <div key={row.model} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <code className="min-w-0 truncate font-mono text-xs">{row.model}</code>
                  <div className="shrink-0 tabular-nums text-foreground/70">
                    {formatCompactNumber(row.requests)} req · {share}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
