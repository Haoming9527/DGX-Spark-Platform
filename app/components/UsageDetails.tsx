"use client";

import { useState, useMemo } from "react";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
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
  const [hoverChart, setHoverChart] = useState<"success" | "errors" | null>(null);

  const totalTimeRangeRequests = useMemo(() => {
    return chartData.reduce((acc, d) => acc + d.requests, 0);
  }, [chartData]);

  const totalTimeRangeErrors = useMemo(() => {
    return chartData.reduce((acc, d) => d.errors.badRequest + d.errors.forbidden + d.errors.notFound + acc, 0);
  }, [chartData]);

  const maxDailyRequests = useMemo(() => {
    return Math.max(...chartData.map((d) => d.requests), 0);
  }, [chartData]);

  const maxSuccessRate = useMemo(() => {
    return Math.max(...chartData.map((d) => d.successRate), 0);
  }, [chartData]);

  const maxDailyErrors = useMemo(() => {
    return Math.max(...chartData.map((d) => d.errors.badRequest + d.errors.forbidden + d.errors.notFound), 0);
  }, [chartData]);

  const hoveredPoint = hoverIndex !== null ? chartData[hoverIndex] : null;
  const hoveredErrors = hoveredPoint
    ? hoveredPoint.errors.badRequest + hoveredPoint.errors.forbidden + hoveredPoint.errors.notFound
    : 0;

  // SVG dimensions
  const width = 780;
  const height = 360;
  const paddingLeft = 66;
  const paddingRight = 34;
  const paddingTop = 46;
  const paddingBottom = 50;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const requestScaleMax = Math.max(maxDailyRequests, 1);
  const successScaleMax = Math.max(maxSuccessRate, 1);
  const errorScaleMax = Math.max(maxDailyErrors, 1);

  const divisor = chartData.length > 1 ? chartData.length - 1 : 1;

  const requestsPoints = chartData.map((d, i) => {
    const x = paddingLeft + (i / divisor) * chartWidth;
    const y = paddingTop + chartHeight - (d.requests / requestScaleMax) * chartHeight;
    return { x, y };
  });

  // Success Rate Line Path coordinates
  const successPoints = chartData.map((d, i) => {
    const x = paddingLeft + (i / divisor) * chartWidth;
    const y = paddingTop + chartHeight - (d.successRate / successScaleMax) * chartHeight;
    return { x, y };
  });

  const successPath = successPoints.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");

  const getAxisTicks = (max: number) => {
    if (max <= 0) return [0];
    if (max <= 4) {
      return Array.from({ length: max + 1 }, (_, i) => max - i);
    }

    const seen = new Set<number>();
    return [1, 0.75, 0.5, 0.25, 0]
      .map((p) => Math.round(max * p))
      .filter((value) => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  };

  const getAxisY = (value: number, max: number) => {
    return paddingTop + chartHeight - (value / Math.max(max, 1)) * chartHeight;
  };

  const requestTicks = getAxisTicks(maxDailyRequests);
  const successTicks = getAxisTicks(maxSuccessRate);
  const errorTicks = getAxisTicks(maxDailyErrors);

  const getTooltipStyle = (point: { x: number; y: number }) => {
    const left = (point.x / width) * 100;
    const top = (point.y / height) * 100;
    const translateX = left > 72 ? "-100%" : left < 28 ? "0" : "-50%";
    const translateY = top < 30 ? "12px" : "calc(-100% - 12px)";

    return {
      left: `${left}%`,
      top: `${top}%`,
      transform: `translate(${translateX}, ${translateY})`,
    };
  };

  return (
    <div className="relative w-full min-h-[360px]">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute -inset-3 bg-background/75 backdrop-blur-[4px] z-[100] flex items-center justify-center rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-nvidia-green animate-spin" />
            <span className="text-xs text-foreground/50 font-semibold">Loading telemetry data...</span>
          </div>
        </div>
      )}

      <div className="space-y-6">
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
                  setHoverChart(null);
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
              <span title={selectedKey.total_requests.toLocaleString()}>{formatCompactNumber(selectedKey.total_requests)}</span>{" "}
              <span className="text-xs font-normal text-foreground/40">requests</span>
            </div>
            <div className="text-xs text-nvidia-green font-bold tabular-nums">
              <span title={selectedKey.total_tokens.toLocaleString()}>{formatCompactNumber(selectedKey.total_tokens)}</span>{" "}
              <span className="text-[10px] font-normal text-foreground/40">tokens</span>
            </div>
          </div>
        </div>

        {/* Side-by-side charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Success Rate Chart */}
          <div className="bg-panel border border-border rounded-xl p-6 space-y-5 relative flex flex-col justify-between min-h-[340px]">
            <div className="flex justify-between items-center border-b border-border/40 pb-2">
              <span className="text-lg font-bold text-foreground/80">Success Rate</span>
              <div className="flex items-center gap-3 text-sm font-bold text-foreground/55">
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-blue-500" /> Requests</span>
                <span className="flex items-center gap-2"><span className="w-5 h-1 rounded-full bg-nvidia-green" /> Success Rate</span>
              </div>
            </div>

            <div className="relative flex-1 flex items-center justify-center">
              {chartData.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/5 pointer-events-none z-10">
                  <Info className="w-5 h-5 text-foreground/20 mb-1" />
                  <span className="text-xs text-foreground/30 font-bold uppercase tracking-wider">No Data Available</span>
                </div>
              )}

              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto select-none overflow-visible"
                onMouseMove={(e) => {
                  if (chartData.length === 0) return;
                  const svg = e.currentTarget;
                  const rect = svg.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const relativeX = (x / rect.width) * width;
                  const clampedX = Math.max(paddingLeft, Math.min(width - paddingRight, relativeX));
                  const idx = Math.round(((clampedX - paddingLeft) / chartWidth) * divisor);
                  setHoverIndex(idx);
                  setHoverChart("success");
                }}
                onMouseLeave={() => {
                  setHoverIndex(null);
                  setHoverChart(null);
                }}
              >
                {requestTicks.map((value) => {
                  const y = getAxisY(value, maxDailyRequests);
                  return (
                    <g key={`requests-${value}`} className="opacity-25">
                      <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="currentColor" strokeDasharray="4,4" strokeWidth="1.2" />
                      <text x={paddingLeft - 14} y={y + 6} textAnchor="end" fontSize="18" fontWeight="700" fill="currentColor">{formatCompactNumber(value)}</text>
                    </g>
                  );
                })}

                {successTicks.map((value) => {
                  const y = getAxisY(value, maxSuccessRate);
                  return (
                    <g key={`success-${value}`} className="opacity-30">
                      <text x={width - paddingRight + 12} y={y + 6} textAnchor="start" fontSize="18" fontWeight="700" fill="currentColor">{value}%</text>
                    </g>
                  );
                })}

                <text x={paddingLeft} y={paddingTop - 20} textAnchor="start" fontSize="16" className="fill-foreground/45 font-bold uppercase tracking-wider">
                  Requests
                </text>
                <text x={width - paddingRight} y={paddingTop - 20} textAnchor="end" fontSize="16" className="fill-foreground/45 font-bold uppercase tracking-wider">
                  Success Rate
                </text>

                {chartData.length > 0 && (
                  <>
                    {chartData.map((d, i) => {
                      const x = paddingLeft + (i / divisor) * chartWidth;
                      const barWidth = Math.max(10, Math.min(24, (chartWidth / chartData.length) * 0.5));
                      const barHeight = (d.requests / requestScaleMax) * chartHeight;
                      const yStart = paddingTop + chartHeight;

                      return (
                        <rect
                          key={`request-bar-${i}`}
                          x={x - barWidth / 2}
                          y={yStart - barHeight}
                          width={barWidth}
                          height={barHeight}
                          rx="3"
                          fill="#3b82f6"
                          className="opacity-90"
                        />
                      );
                    })}

                    <path d={successPath} fill="none" stroke="#76b900" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="opacity-95 drop-shadow-sm" />

                    {chartData.map((d, i) => {
                      const showLabel = i === 0 || i === Math.floor(chartData.length / 2) || i === chartData.length - 1;
                      const x = paddingLeft + (i / divisor) * chartWidth;
                      return (
                        <g key={i}>
                          {showLabel && (
                            <text x={x} y={height - 14} textAnchor="middle" fontSize="17" className="fill-foreground/55 font-bold">{d.date}</text>
                          )}
                        </g>
                      );
                    })}

                    {hoverIndex !== null && hoverChart === "success" && (
                      <g>
                        <line x1={requestsPoints[hoverIndex].x} y1={paddingTop} x2={requestsPoints[hoverIndex].x} y2={height - paddingBottom} className="stroke-foreground/60" strokeDasharray="5,5" strokeWidth="2" />
                        <circle cx={successPoints[hoverIndex].x} cy={successPoints[hoverIndex].y} r="7" fill="#76b900" stroke="#ffffff" strokeWidth="2" />
                      </g>
                    )}
                  </>
                )}
              </svg>

              {hoveredPoint && hoverIndex !== null && hoverChart === "success" && (
                <div
                  className="absolute z-20 min-w-[190px] pointer-events-none rounded-lg border border-border bg-panel/95 px-3 py-2 shadow-xl backdrop-blur-sm"
                  style={getTooltipStyle(successPoints[hoverIndex])}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">{hoveredPoint.date}</div>
                  <div className="mt-1 flex items-baseline justify-between gap-4">
                    <span className="text-[11px] font-semibold text-foreground/50">Success Rate</span>
                    <span className="text-sm font-bold text-nvidia-green tabular-nums">{hoveredPoint.successRate}%</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-4">
                    <span className="text-[11px] font-semibold text-foreground/50">Tokens Used</span>
                    <span className="text-sm font-bold text-foreground tabular-nums">{formatCompactNumber(hoveredPoint.tokens)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* API Errors */}
          <div className="bg-panel border border-border rounded-xl p-6 space-y-5 relative flex flex-col justify-between min-h-[340px]">
            <div className="flex justify-between items-center border-b border-border/40 pb-2">
              <span className="text-lg font-bold text-foreground/80">Total API Errors</span>
              <div className="flex items-center gap-3.5 text-sm font-bold text-foreground/55">
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
                  if (chartData.length === 0) return;
                  const svg = e.currentTarget;
                  const rect = svg.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const relativeX = (x / rect.width) * width;
                  const clampedX = Math.max(paddingLeft, Math.min(width - paddingRight, relativeX));
                  const idx = Math.round(((clampedX - paddingLeft) / chartWidth) * divisor);
                  setHoverIndex(idx);
                  setHoverChart("errors");
                }}
                onMouseLeave={() => {
                  setHoverIndex(null);
                  setHoverChart(null);
                }}
              >
                {errorTicks.map((value) => {
                  const y = getAxisY(value, maxDailyErrors);
                  return (
                    <g key={value} className="opacity-30">
                      <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="currentColor" strokeDasharray="4,4" strokeWidth="1.2" />
                      <text x={paddingLeft - 14} y={y + 6} textAnchor="end" fontSize="18" fontWeight="700" fill="currentColor">{formatCompactNumber(value)}</text>
                    </g>
                  );
                })}

                <text x={paddingLeft} y={paddingTop - 20} textAnchor="start" fontSize="16" className="fill-foreground/45 font-bold uppercase tracking-wider">
                  Errors
                </text>

                {chartData.length > 0 && (
                  <>
                    {chartData.map((d, i) => {
                      const x = paddingLeft + (i / divisor) * chartWidth;
                      const barWidth = Math.max(10, Math.min(24, (chartWidth / chartData.length) * 0.5));
                      
                      const badRequestH = (d.errors.badRequest / errorScaleMax) * chartHeight;
                      const forbiddenH = (d.errors.forbidden / errorScaleMax) * chartHeight;
                      const notFoundH = (d.errors.notFound / errorScaleMax) * chartHeight;

                      const yStart = paddingTop + chartHeight;

                      return (
                        <g key={i}>
                          {d.errors.badRequest > 0 && (
                            <rect x={x - barWidth / 2} y={yStart - badRequestH} width={barWidth} height={badRequestH} rx="3" fill="#3b82f6" />
                          )}
                          {d.errors.forbidden > 0 && (
                            <rect x={x - barWidth / 2} y={yStart - badRequestH - forbiddenH} width={barWidth} height={forbiddenH} rx="3" fill="#22d3ee" />
                          )}
                          {d.errors.notFound > 0 && (
                            <rect x={x - barWidth / 2} y={yStart - badRequestH - forbiddenH - notFoundH} width={barWidth} height={notFoundH} rx="3" fill="#a855f7" />
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
                            <text x={x} y={height - 14} textAnchor="middle" fontSize="17" className="fill-foreground/55 font-bold">{d.date}</text>
                          )}
                        </g>
                      );
                    })}

                    {hoverIndex !== null && hoverChart === "errors" && (
                      <line x1={requestsPoints[hoverIndex].x} y1={paddingTop} x2={requestsPoints[hoverIndex].x} y2={height - paddingBottom} className="stroke-foreground/60" strokeDasharray="5,5" strokeWidth="2" />
                    )}
                  </>
                )}
              </svg>

              {hoveredPoint && hoverIndex !== null && hoverChart === "errors" && (
                <div
                  className="absolute z-20 min-w-[210px] pointer-events-none rounded-lg border border-border bg-panel/95 px-3 py-2 shadow-xl backdrop-blur-sm"
                  style={getTooltipStyle(requestsPoints[hoverIndex])}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">{hoveredPoint.date}</div>
                  <div className="mt-1 flex items-baseline justify-between gap-4">
                    <span className="text-[11px] font-semibold text-foreground/50">API Errors</span>
                    <span className="text-sm font-bold text-red-400 tabular-nums">{formatCompactNumber(hoveredErrors)}</span>
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-foreground/60 tabular-nums">
                    400: {hoveredPoint.errors.badRequest} | 403: {hoveredPoint.errors.forbidden} | 404: {hoveredPoint.errors.notFound}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
