"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Router, Cpu } from "lucide-react";
import { ExitBack } from "../components/ui/ExitBack";
import { LogoMark } from "../components/ui/LogoMark";
import { ThemeToggle } from "../components/ui/ThemeToggle";

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
          ? "bg-alert"
          : "bg-muted";
  return (
    <span
      className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
      aria-hidden
    />
  );
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
    <div className="min-h-[100svh] font-sans text-foreground">
      <header className="px-4 pt-4 sm:px-5">
        <div className="sticker mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 !rounded-2xl px-2 py-2 sm:px-3">
          <ExitBack href="/" />
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="sticker-sm inline-flex items-center gap-2 px-3 py-1.5 text-[13px] text-muted transition-[filter] hover:brightness-110 hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#14b8a6] ${loading ? "animate-spin" : ""}`} strokeWidth={2.25} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-20 pt-10">
        <div className="mb-8 flex items-center gap-4">
          <LogoMark size={28} />
          <div className="sticker !rounded-xl px-4 py-2">
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.04em]">Status</h1>
            <p className="text-[13px] text-muted">DGX Spark Platform</p>
          </div>
        </div>

        <section
          className={`sticker mb-8 px-5 py-5 ${
            overall.state === "operational"
              ? "!border-nvidia-green/40"
              : overall.state === "degraded"
                ? "!border-amber-400/50"
                : overall.state === "outage"
                  ? "!border-alert/50"
                  : ""
          }`}
        >
          <div className="flex items-start gap-3">
            <Dot state={overall.state} />
            <div>
              <h2 className="font-display text-[1.2rem] font-bold uppercase tracking-[0.03em]">
                {overall.title}
              </h2>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{overall.detail}</p>
              {checked && (
                <p className="mt-3 font-mono text-[12px] text-muted">Updated {checked}</p>
              )}
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[13px] font-medium text-muted">Components</h3>
          <div className="flex flex-col gap-3">
            <ComponentCard
              kind="gateway"
              title="Gateway"
              host={gatewayHost}
              desc="Inference"
              state={gatewayState}
            />
            {data?.gateway === "ready" && servers.length === 0 && (
              <ComponentCard
                kind="ai"
                title="AI servers"
                host="None configured"
                desc="No endpoints"
                state="unknown"
              />
            )}
            {data?.gateway !== "ready" && (
              <div className="sticker px-4 py-4 text-[13px] text-muted">
                AI server health is unavailable while the gateway is offline.
              </div>
            )}
            {servers.map((s, i) => (
              <ComponentCard
                key={`${s.host || s.name}-${i}`}
                kind="ai"
                title="AI server"
                host={s.host || s.name}
                desc={stateLabel(toComponentState(s.status, "server"))}
                state={toComponentState(s.status, "server")}
              />
            ))}
          </div>
        </section>

        <p className="mt-12 text-center text-[11px] text-muted">Not affiliated with NVIDIA</p>
      </main>
    </div>
  );
}

function ComponentCard({
  kind,
  title,
  host,
  desc,
  state,
}: {
  kind: "gateway" | "ai";
  title: string;
  host: string;
  desc: string;
  state: ComponentState;
}) {
  const lamp =
    state === "operational"
      ? "bg-nvidia-green"
      : state === "degraded"
        ? "bg-amber-400"
        : state === "outage"
          ? "bg-alert"
          : "bg-muted";

  return (
    <div className="sticker-dark grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5">
      <span className="icon-sticker" aria-hidden>
        {kind === "gateway" ? (
          <Router className="h-5 w-5 text-[#ff5c5c]" strokeWidth={2.25} />
        ) : (
          <Cpu className="h-5 w-5 text-nvidia-green" strokeWidth={2.25} />
        )}
      </span>
      <div className="min-w-0">
        <div className="font-display text-[1.05rem] font-bold uppercase tracking-[0.03em]">{title}</div>
        <div className="mt-0.5 truncate font-mono text-[13px] text-[#b0b0b0]">{host}</div>
        <div className="mt-0.5 text-[13px] text-[#8a8a8a]">{desc}</div>
      </div>
      <span className={`h-2.5 w-2.5 rounded-full ${lamp}`} aria-hidden />
    </div>
  );
}
