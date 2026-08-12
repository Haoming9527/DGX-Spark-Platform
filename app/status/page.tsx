"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

type ServerEndpoint = {
  name: string;
  host?: string;
  type?: string;
  status: string;
  issues?: string;
};

type StatusPayload = {
  status?: string;
  gateway?: string;
  gateway_host?: string | null;
  endpoints_up?: string;
  endpoints?: ServerEndpoint[];
  checked_at?: string;
  error?: string;
  message?: string;
};

type ComponentState = "operational" | "degraded" | "outage" | "unknown";

function toComponentState(raw: string, kind: "gateway" | "server"): ComponentState {
  const s = raw.toLowerCase();
  if (kind === "gateway") {
    if (s === "ready") return "operational";
    if (s === "offline") return "outage";
    return "unknown";
  }
  if (s === "healthy") return "operational";
  if (s === "busy" || s === "warming") return "degraded";
  if (s === "unhealthy" || s === "offline" || s === "unknown" || s === "configerror") return "outage";
  return "unknown";
}

function stateLabel(state: ComponentState) {
  switch (state) {
    case "operational":
      return "Operational";
    case "degraded":
      return "Degraded";
    case "outage":
      return "Unavailable";
    default:
      return "Unknown";
  }
}

function Dot({ state }: { state: ComponentState }) {
  const color =
    state === "operational"
      ? "bg-nvidia-green"
      : state === "degraded"
        ? "bg-amber-400"
        : state === "outage"
          ? "bg-red-500/80"
          : "bg-foreground/30";
  return <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function overallCopy(payload: StatusPayload | null): {
  title: string;
  detail: string;
  state: ComponentState;
} {
  if (!payload) {
    return { title: "Checking status…", detail: "Fetching live health from the gateway.", state: "unknown" };
  }
  if (payload.gateway !== "ready") {
    return {
      title: "Gateway unavailable",
      detail: "Chat and API traffic cannot reach the inference gateway.",
      state: "outage",
    };
  }
  if (payload.status === "sleeping") {
    return {
      title: "AI servers unavailable",
      detail: "The gateway is up, but no AI servers are online.",
      state: "outage",
    };
  }
  if (payload.status === "degraded") {
    return {
      title: "Partial outage",
      detail: "Some AI servers are online; others are unavailable.",
      state: "degraded",
    };
  }
  return {
    title: "All systems operational",
    detail: "Gateway and AI servers are responding normally.",
    state: "operational",
  };
}

function formatCheckedAt(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function StatusPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const json = (await res.json()) as StatusPayload;
      setData(json);
    } catch {
      setData({
        gateway: "offline",
        status: "offline",
        endpoints: [],
        error: "OFFLINE",
        checked_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const overall = useMemo(() => overallCopy(data), [data]);
  const gatewayState = toComponentState(data?.gateway || "unknown", "gateway");
  const servers = data?.endpoints ?? [];
  const checked = formatCheckedAt(data?.checked_at);
  const gatewayHost = data?.gateway_host?.trim() || "Not configured";

  return (
    <div className="min-h-[100svh] bg-background font-sans text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-foreground/55 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            Chat
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] text-foreground/55 transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={1.75} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-20 pt-12">
        <div className="mb-10 flex flex-col items-center text-center">
          <Image
            src="/logo.svg"
            alt=""
            width={40}
            height={40}
            className="mb-4 h-10 w-10 object-contain"
            priority
          />
          <p className="text-[13px] font-medium tracking-tight text-foreground/45">
            DGX Spark Platform
          </p>
          <h1 className="mt-3 text-[28px] font-medium tracking-tight">System status</h1>
          <p className="mt-2 max-w-[32ch] text-[15px] leading-relaxed text-foreground/45">
            Live health for gateway and AI servers.
          </p>
        </div>

        <section
          className={`mb-10 rounded-2xl border px-5 py-5 ${
            overall.state === "operational"
              ? "border-nvidia-green/25 bg-nvidia-green/[0.06]"
              : overall.state === "degraded"
                ? "border-amber-400/25 bg-amber-400/[0.06]"
                : overall.state === "outage"
                  ? "border-red-500/20 bg-red-500/[0.05]"
                  : "border-border bg-foreground/[0.02]"
          }`}
        >
          <div className="flex items-start gap-3">
            <Dot state={overall.state} />
            <div>
              <h2 className="text-[17px] font-medium tracking-tight">{overall.title}</h2>
              <p className="mt-1 text-[14px] leading-relaxed text-foreground/55">{overall.detail}</p>
              {checked && (
                <p className="mt-3 text-[12px] text-foreground/35">Updated {checked}</p>
              )}
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-foreground/35">
            Components
          </h3>
          <div className="overflow-hidden rounded-2xl border border-border/80">
            <ComponentRow
              title="Inference gateway"
              host={gatewayHost}
              state={gatewayState}
            />
            {data?.gateway === "ready" && servers.length === 0 && (
              <ComponentRow title="AI servers" host="None configured" state="unknown" />
            )}
            {data?.gateway !== "ready" && (
              <div className="border-t border-border/80 px-4 py-4 text-[13px] text-foreground/40">
                AI server health is unavailable while the gateway is offline.
              </div>
            )}
            {servers.map((s, i) => (
              <ComponentRow
                key={`${s.host || s.name}-${i}`}
                title="AI server"
                host={s.host || s.name}
                state={toComponentState(s.status, "server")}
              />
            ))}
          </div>
        </section>

        <p className="mt-12 text-center text-[11px] text-foreground/30">
          Not affiliated with NVIDIA
        </p>
      </main>
    </div>
  );
}

function ComponentRow({
  title,
  host,
  state,
}: {
  title: string;
  host: string;
  state: ComponentState;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-border/80 px-4 py-4 first:border-t-0">
      <Dot state={state} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium tracking-tight">{host}</div>
        <div className="mt-0.5 text-[13px] text-foreground/40">{title}</div>
      </div>
      <div className="shrink-0 pt-0.5 text-[13px] text-foreground/55">{stateLabel(state)}</div>
    </div>
  );
}
