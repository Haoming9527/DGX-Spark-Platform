"use client";

import { useState, useEffect } from "react";
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

export function UsageView({ keys, keysLoading }: UsageViewProps) {
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(14);
  const [chartData, setChartData] = useState<DailyMetric[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    if (!selectedKey) {
      return;
    }

    const timer = setTimeout(() => {
      setChartLoading(true);
    }, 0);

    fetch(`/api/apikeys/usage?id=${selectedKey.id}&days=${timeRange}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load usage data.");
        return res.json();
      })
      .then((data) => {
        setChartData(data.chartData || []);
      })
      .catch((err) => {
        console.error("Error loading usage data:", err);
        setChartData([]);
      })
      .finally(() => {
        setChartLoading(false);
      });

    return () => clearTimeout(timer);
  }, [selectedKey, timeRange]);

  if (selectedKey) {
    return (
      <UsageDetails
        selectedKey={selectedKey}
        onBackClick={() => {
          setSelectedKey(null);
          setChartData([]);
        }}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        chartData={chartData}
        loading={chartLoading}
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
