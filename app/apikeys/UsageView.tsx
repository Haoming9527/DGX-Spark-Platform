"use client";

import { useState, useMemo } from "react";
import { UsageOverview } from "../components/UsageOverview";
import { UsageDetails } from "../components/UsageDetails";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  total_tokens: number;
  total_requests: number;
}

interface UsageViewProps {
  keys: ApiKey[];
  keysLoading: boolean;
}

// ── Deterministic Historical Data Simulator ───────────────────────────────────
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

function getHistoricalData(key: ApiKey, days: number): DailyMetric[] {
  const data: DailyMetric[] = [];
  let seed = 0;
  for (let c = 0; c < key.id.length; c++) {
    seed += key.id.charCodeAt(c);
  }

  const today = new Date();
  const rawTokens: number[] = [];
  const rawRequests: number[] = [];

  for (let i = 0; i < days; i++) {
    const random1 = Math.sin(seed + i * 1.7) * 0.5 + 0.5;
    const random2 = Math.cos(seed - i * 2.3) * 0.5 + 0.5;

    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - i));
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const dayFactor = isWeekend ? 0.35 : 1.0;

    rawTokens.push(random1 * dayFactor);
    rawRequests.push(random2 * dayFactor);
  }

  const sumTokens = rawTokens.reduce((a, b) => a + b, 0) || 1;
  const sumRequests = rawRequests.reduce((a, b) => a + b, 0) || 1;

  for (let i = 0; i < days; i++) {
    const dateObj = new Date(today);
    dateObj.setDate(today.getDate() - (days - 1 - i));
    const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const dayTokens = Math.round((rawTokens[i] / sumTokens) * key.total_tokens);
    const dayRequests = Math.round((rawRequests[i] / sumRequests) * key.total_requests);

    const prompt = Math.round(dayTokens * 0.72);
    const comp = dayTokens - prompt;

    const errorSeed = Math.sin(seed + i * 13.9) * 0.5 + 0.5;
    const hasErrors = errorSeed > 0.82 && dayRequests > 1;
    const badRequest = hasErrors ? Math.round(dayRequests * 0.08) : 0;
    const forbidden = hasErrors && errorSeed > 0.93 ? 1 : 0;
    const notFound = hasErrors && errorSeed > 0.88 ? 1 : 0;
    const totalErrors = badRequest + forbidden + notFound;

    const successRate = dayRequests > 0
      ? Math.max(0, Math.min(100, Math.round(((dayRequests - totalErrors) / dayRequests) * 100)))
      : 100;

    data.push({
      date: dateStr,
      tokens: dayTokens,
      promptTokens: prompt,
      completionTokens: comp,
      requests: dayRequests,
      successRate,
      errors: {
        badRequest,
        forbidden,
        notFound,
      },
    });
  }

  return data;
}

export function UsageView({ keys, keysLoading }: UsageViewProps) {
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(14);

  const chartData = useMemo(() => {
    if (!selectedKey) return [];
    return getHistoricalData(selectedKey, timeRange);
  }, [selectedKey, timeRange]);

  if (selectedKey) {
    return (
      <UsageDetails
        selectedKey={selectedKey}
        onBackClick={() => setSelectedKey(null)}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        chartData={chartData}
      />
    );
  }

  return (
    <UsageOverview
      keys={keys}
      keysLoading={keysLoading}
      onKeyClick={(key) => setSelectedKey(key)}
    />
  );
}
