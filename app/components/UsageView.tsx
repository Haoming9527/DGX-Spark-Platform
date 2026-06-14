"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { UsageOverview } from "./UsageOverview";
import { UsageDetails } from "./UsageDetails";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedApiId = searchParams.get("api");
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(14);
  const [chartData, setChartData] = useState<DailyMetric[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const selectedKey = useMemo(() => {
    return keys.find((item) => item.id === selectedApiId) || null;
  }, [keys, selectedApiId]);

  useEffect(() => {
    if (!selectedKey) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setChartLoading(true);
    }, 0);

    const loadChartData = (signal?: AbortSignal) => {
      fetch(`/api/apikeys/usage?id=${selectedKey.id}&days=${timeRange}`, {
        cache: "no-store",
        signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load usage data.");
          return res.json();
        })
        .then((data) => {
          setChartData(data.chartData || []);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("Error loading usage data:", err);
          setChartData([]);
        })
        .finally(() => {
          clearTimeout(timer);
          if (!controller.signal.aborted) {
            setChartLoading(false);
          }
        });
    };

    loadChartData(controller.signal);
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadChartData();
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      window.clearInterval(refresh);
      controller.abort();
    };
  }, [selectedKey, timeRange]);

  if (selectedKey) {
    return (
      <UsageDetails
        selectedKey={selectedKey}
        onBackClick={() => {
          setChartData([]);
          router.push("/apikeys/usage");
        }}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        chartData={chartData}
        loading={chartLoading}
      />
    );
  }

  if (selectedApiId && !keysLoading) {
    return (
      <div className="bg-panel border border-border rounded-lg p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10">
          <ShieldAlert className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Access denied</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground/50">
          This API key does not exist or does not belong to your account.
        </p>
        <button
          onClick={() => router.push("/apikeys/usage")}
          className="mt-5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground/70 hover:border-nvidia-green/50 hover:text-foreground transition-colors cursor-pointer"
        >
          View your API usage
        </button>
      </div>
    );
  }

  return (
    <UsageOverview
      keys={keys}
      keysLoading={keysLoading}
      onKeyClick={(key) => {
        router.push(`/apikeys/usage?api=${encodeURIComponent(key.id)}`);
      }}
    />
  );
}
