"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Info, Loader2 } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  total_tokens: number;
  total_requests: number;
}

interface DailyMetric {
  date: string;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  successRate: number;
  errors: {
    badRequest: number;
    forbidden: number;
    notFound: number;
  };
}

interface UsageDetailsProps {
  selectedKey: ApiKey;
  onBackClick: () => void;
  timeRange: 7 | 14 | 30;
  setTimeRange: (days: 7 | 14 | 30) => void;
  chartData: DailyMetric[];
  loading?: boolean;
}

export function UsageDetails({
  selectedKey,
  onBackClick,
  timeRange,
  setTimeRange,
  chartData,
  loading = false,
}: UsageDetailsProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const totalTimeRangeRequests = useMemo(() => {
    return chartData.reduce((acc, d) => acc + d.requests, 0);
  }, [chartData]);

  const totalTimeRangeErrors = useMemo(() => {
    return chartData.reduce((acc, d) => d.errors.badRequest + d.errors.forbidden + d.errors.notFound + acc, 0);
  }, [chartData]);

  const maxDailyRequests = useMemo(() => {
    return Math.max(...chartData.map((d) => d.requests), 5);
  }, [chartData]);

  const maxDailyErrors = useMemo(() => {
    return Math.max(...chartData.map((d) => d.errors.badRequest + d.errors.forbidden + d.errors.notFound), 5);
  }, [chartData]);

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const hoveredPoint = hoverIndex !== null ? chartData[hoverIndex] : null;

  // SVG dimensions
  const width = 500;
  const height = 180;
  const paddingLeft = 48;
  const paddingRight = 48;
  const paddingTop = 15;
  const paddingBottom = 25;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const divisor = chartData.length > 1 ? chartData.length - 1 : 1;

  // Requests Coordinates for hover alignment
  const requestsPoints = chartData.map((d, i) => {
    const x = paddingLeft + (i / divisor) * chartWidth;
    const y = paddingTop + chartHeight - (maxDailyRequests > 0 ? (d.requests / maxDailyRequests) * chartHeight : 0);
    return { x, y };
  });

  // Success Rate Line Path coordinates
  const successPoints = chartData.map((d, i) => {
    const x = paddingLeft + (i / divisor) * chartWidth;
    const y = paddingTop + chartHeight - (d.successRate / 100) * chartHeight;
    return { x, y };
  });

  const successPath = successPoints.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");

  return (
    <div className="space-y-6 relative">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-[100] flex items-center justify-center rounded-2xl min-h-[300px]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-nvidia-green animate-spin" />
            <span className="text-xs text-foreground/50 font-semibold">Loading telemetry data...</span>
          </div>
        </div>
      )}

      {/* Back button and Date Range filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBackClick}
          className="flex items-center gap-2 text-xs font-semibold text-foreground/50 hover:text-foreground hover:bg-panel-hover border border-border/80 rounded-lg px-3 py-1.5 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Keys Overview</span>
        </button>

        <div className="flex bg-background border border-border/60 rounded-lg p-0.5 text-xs font-semibold shrink-0">
          {([7, 14, 30] as const).map((days) => (
            <button
              key={days}
              onClick={() => {
                setTimeRange(days);
                setHoverIndex(null);
              }}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                timeRange === days
                  ? "bg-nvidia-green/15 text-nvidia-green border border-nvidia-green/20"
                  : "text-foreground/40 hover:text-foreground/70"
              }`}
            >
              {days} Days
            </button>
          ))}
        </div>
      </div>

      {/* Stats Header */}
      <div className="bg-panel border border-border rounded-xl p-5 flex items-center justify-between">
        <div className="space-y-1 truncate pr-4">
          <h2 className="text-sm font-bold text-foreground truncate">{selectedKey.name}</h2>
          <div className="flex items-center gap-2 text-xs text-foreground/40 font-mono">
            <span>Prefix:</span>
            <code className="text-nvidia-green bg-background px-1.5 py-0.5 rounded border border-border/50">
              {selectedKey.key_prefix}…
            </code>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase font-bold text-foreground/30 tracking-wider">Metrics Sum</div>
          <div className="text-base font-bold text-foreground tabular-nums">
            {selectedKey.total_requests.toLocaleString()}{" "}
            <span className="text-xs font-normal text-foreground/40">requests</span>
          </div>
          <div className="text-xs text-nvidia-green font-bold tabular-nums">
            {selectedKey.total_tokens.toLocaleString()}{" "}
            <span className="text-[10px] font-normal text-foreground/40">tokens</span>
          </div>
        </div>
      </div>

      {/* Side-by-side charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Requests & Success Rate Combo Chart */}
        <div className="bg-panel border border-border rounded-xl p-5 space-y-4 relative flex flex-col justify-between min-h-[240px]">
          <div className="flex justify-between items-center border-b border-border/40 pb-2">
            <span className="text-xs font-bold text-foreground/70">Total API Requests & Success Rate</span>
            <div className="flex items-center gap-3 text-[10px] font-bold text-foreground/45">
              <span className="flex items-center gap-1.5"><span className="w-2 h-0.5 bg-nvidia-green" /> Success Rate</span>
            </div>
          </div>

          <div className="relative flex-1 flex items-center justify-center">
            {totalTimeRangeRequests === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/5 pointer-events-none z-10">
                <Info className="w-5 h-5 text-foreground/20 mb-1" />
                <span className="text-xs text-foreground/30 font-bold uppercase tracking-wider">No Data Available</span>
              </div>
            )}

            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto select-none overflow-visible"
              onMouseMove={(e) => {
                if (totalTimeRangeRequests === 0) return;
                const svg = e.currentTarget;
                const rect = svg.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const relativeX = (x / rect.width) * width;
                const clampedX = Math.max(paddingLeft, Math.min(width - paddingRight, relativeX));
                const idx = Math.round(((clampedX - paddingLeft) / chartWidth) * divisor);
                setHoverIndex(idx);
              }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                const y = paddingTop + p * chartHeight;
                return (
                  <g key={idx} className="opacity-15">
                    <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="currentColor" strokeDasharray="3,3" strokeWidth="1" />
                    <text x={paddingLeft - 8} y={y + 3} textAnchor="end" fontSize="9" fill="currentColor">{Math.round(maxDailyRequests * (1 - p))}</text>
                    <text x={width - paddingRight + 8} y={y + 3} textAnchor="start" fontSize="9" fill="currentColor">{Math.round(100 * (1 - p))}%</text>
                  </g>
                );
              })}

              {/* Axis Labels */}
              <text
                x={paddingLeft - 36}
                y={paddingTop + chartHeight / 2}
                textAnchor="middle"
                transform={`rotate(-90, ${paddingLeft - 36}, ${paddingTop + chartHeight / 2})`}
                fontSize="8"
                className="fill-foreground/30 font-bold uppercase tracking-wider"
              >
                Requests
              </text>
              <text
                x={width - paddingRight + 36}
                y={paddingTop + chartHeight / 2}
                textAnchor="middle"
                transform={`rotate(90, ${width - paddingRight + 36}, ${paddingTop + chartHeight / 2})`}
                fontSize="8"
                className="fill-foreground/30 font-bold uppercase tracking-wider"
              >
                Success Rate
              </text>

              {totalTimeRangeRequests > 0 && (
                <>
                  {/* Success Rate line on top */}
                  <path d={successPath} fill="none" stroke="#76b900" strokeWidth="1.8" strokeLinecap="round" className="opacity-95" />

                  {chartData.map((d, i) => {
                    const showLabel = i === 0 || i === Math.floor(chartData.length / 2) || i === chartData.length - 1;
                    const x = paddingLeft + (i / divisor) * chartWidth;
                    return (
                      <g key={i}>
                        {showLabel && (
                          <text x={x} y={height - 5} textAnchor="middle" fontSize="9" className="fill-foreground/40 font-semibold">{d.date}</text>
                        )}
                      </g>
                    );
                  })}

                  {hoverIndex !== null && (
                    <g>
                      <line x1={requestsPoints[hoverIndex].x} y1={paddingTop} x2={requestsPoints[hoverIndex].x} y2={height - paddingBottom} stroke="rgba(255,255,255,0.18)" strokeDasharray="4,4" strokeWidth="1.2" />
                      <circle cx={successPoints[hoverIndex].x} cy={successPoints[hoverIndex].y} r="4.5" fill="#76b900" stroke="#000" strokeWidth="1.5" />
                    </g>
                  )}
                </>
              )}
            </svg>
          </div>
        </div>

        {/* API Errors */}
        <div className="bg-panel border border-border rounded-xl p-5 space-y-4 relative flex flex-col justify-between min-h-[240px]">
          <div className="flex justify-between items-center border-b border-border/40 pb-2">
            <span className="text-xs font-bold text-foreground/70">Total API Errors</span>
            <div className="flex items-center gap-3.5 text-[9px] font-bold text-foreground/45">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500" /> 400</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-cyan-400" /> 403</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-purple-500" /> 404</span>
            </div>
          </div>

          <div className="relative flex-1 flex items-center justify-center">
            {totalTimeRangeRequests === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/5 pointer-events-none z-10">
                <Info className="w-5 h-5 text-foreground/20 mb-1" />
                <span className="text-xs text-foreground/30 font-bold uppercase tracking-wider">No Data Available</span>
              </div>
            )}

            {totalTimeRangeRequests > 0 && totalTimeRangeErrors === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/5 pointer-events-none z-10">
                <span className="text-[11px] text-nvidia-green font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-nvidia-green/10 border border-nvidia-green/20">No API errors recorded</span>
              </div>
            )}

            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto select-none overflow-visible"
              onMouseMove={(e) => {
                if (totalTimeRangeRequests === 0 || totalTimeRangeErrors === 0) return;
                const svg = e.currentTarget;
                const rect = svg.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const relativeX = (x / rect.width) * width;
                const clampedX = Math.max(paddingLeft, Math.min(width - paddingRight, relativeX));
                const idx = Math.round(((clampedX - paddingLeft) / chartWidth) * divisor);
                setHoverIndex(idx);
              }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                const y = paddingTop + p * chartHeight;
                return (
                  <g key={idx} className="opacity-15">
                    <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="currentColor" strokeDasharray="3,3" strokeWidth="1" />
                    <text x={paddingLeft - 8} y={y + 3} textAnchor="end" fontSize="9" fill="currentColor">{Math.round(maxDailyErrors * (1 - p))}</text>
                  </g>
                );
              })}

              {/* Axis Label */}
              <text
                x={paddingLeft - 36}
                y={paddingTop + chartHeight / 2}
                textAnchor="middle"
                transform={`rotate(-90, ${paddingLeft - 36}, ${paddingTop + chartHeight / 2})`}
                fontSize="8"
                className="fill-foreground/30 font-bold uppercase tracking-wider"
              >
                Errors
              </text>

              {totalTimeRangeRequests > 0 && totalTimeRangeErrors > 0 && (
                <>
                  {chartData.map((d, i) => {
                    const x = paddingLeft + (i / divisor) * chartWidth;
                    const barWidth = Math.max(3, (chartWidth / chartData.length) * 0.6);
                    
                    const badRequestH = (d.errors.badRequest / maxDailyErrors) * chartHeight;
                    const forbiddenH = (d.errors.forbidden / maxDailyErrors) * chartHeight;
                    const notFoundH = (d.errors.notFound / maxDailyErrors) * chartHeight;

                    const yStart = paddingTop + chartHeight;

                    return (
                      <g key={i}>
                        {d.errors.badRequest > 0 && (
                          <rect x={x - barWidth / 2} y={yStart - badRequestH} width={barWidth} height={badRequestH} fill="#3b82f6" />
                        )}
                        {d.errors.forbidden > 0 && (
                          <rect x={x - barWidth / 2} y={yStart - badRequestH - forbiddenH} width={barWidth} height={forbiddenH} fill="#22d3ee" />
                        )}
                        {d.errors.notFound > 0 && (
                          <rect x={x - barWidth / 2} y={yStart - badRequestH - forbiddenH - notFoundH} width={barWidth} height={notFoundH} fill="#a855f7" />
                        )}
                      </g>
                    );
                  })}

                  {chartData.map((d, i) => {
                    const showLabel = i === 0 || i === Math.floor(chartData.length / 2) || i === chartData.length - 1;
                    const x = paddingLeft + (i / divisor) * chartWidth;
                    return (
                      <g key={i}>
                        {showLabel && (
                          <text x={x} y={height - 5} textAnchor="middle" fontSize="9" className="fill-foreground/40 font-semibold">{d.date}</text>
                        )}
                      </g>
                    );
                  })}

                  {hoverIndex !== null && (
                    <line x1={requestsPoints[hoverIndex].x} y1={paddingTop} x2={requestsPoints[hoverIndex].x} y2={height - paddingBottom} stroke="rgba(255,255,255,0.18)" strokeDasharray="4,4" strokeWidth="1.2" />
                  )}
                </>
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* Tooltip detail box */}
      <AnimatePresence>
        {hoveredPoint && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 24 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="bg-panel border border-border rounded-xl p-5 flex items-center justify-center relative">
              <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                <div>
                  <span className="text-[10px] text-foreground/40 font-bold block uppercase tracking-wider">Date</span>
                  <span className="text-sm font-bold text-foreground">{hoveredPoint.date}</span>
                </div>
                <div>
                  <span className="text-[10px] text-foreground/40 font-bold block uppercase tracking-wider">Requests</span>
                  <span className="text-sm font-bold text-blue-400 tabular-nums">
                    {hoveredPoint.requests.toLocaleString()}{" "}
                    <span className="text-xs text-foreground/40 font-normal">({hoveredPoint.successRate}% OK)</span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-foreground/40 font-bold block uppercase tracking-wider">Tokens Consumed</span>
                  <span className="text-sm font-bold text-nvidia-green tabular-nums">
                    {hoveredPoint.tokens.toLocaleString()}{" "}
                    <span className="text-[10px] text-foreground/45 font-normal">({formatNumber(hoveredPoint.promptTokens)} p / {formatNumber(hoveredPoint.completionTokens)} c)</span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-foreground/40 font-bold block uppercase tracking-wider">API Errors</span>
                  <span className="text-sm font-bold text-red-400 tabular-nums">
                    {hoveredPoint.errors.badRequest + hoveredPoint.errors.forbidden + hoveredPoint.errors.notFound > 0 ? (
                      `400: ${hoveredPoint.errors.badRequest} | 403: ${hoveredPoint.errors.forbidden} | 404: ${hoveredPoint.errors.notFound}`
                    ) : (
                      "0 Errors"
                    )}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
