"use client";

import { useMemo, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { CAPABILITY_ORDER, capabilityInfo } from "@/lib/models/modelCapabilities";
import type { DocModel } from "./hooks";
import { useCopy } from "./hooks";
import { CapabilityBadge } from "./ui";

function sortCapabilities(capabilities: string[]) {
  const rank = (capability: string) => {
    const index = CAPABILITY_ORDER.indexOf(capability);
    return index < 0 ? CAPABILITY_ORDER.length : index;
  };
  return [...capabilities].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function StatusBox({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <div className={`rounded-lg border p-4 text-sm ${tone === "error" ? "border-red-500/20 bg-red-500/5 text-red-500" : "border-border bg-panel text-foreground/55"}`}>
      {children}
    </div>
  );
}

function ModelCard({ model }: { model: DocModel }) {
  const { copied, copy } = useCopy();
  const endpoint = model.capabilities.map((capability) => capabilityInfo(capability).endpoint).find(Boolean);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => copy(model.name, "model")} title="Copy model name"
          className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
          <span className="truncate font-mono text-sm font-semibold text-foreground">{model.name}</span>
          {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-nvidia-green" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-foreground/35 group-hover:text-foreground/70" />}
        </button>
        {model.size && <span className="shrink-0 rounded-md bg-panel-hover px-1.5 py-0.5 font-mono text-[11px] text-foreground/55">{model.size}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {model.capabilities.length
          ? sortCapabilities(model.capabilities).map((capability) => <CapabilityBadge key={capability} capability={capability} />)
          : <span className="text-xs text-foreground/45">No capabilities reported</span>}
      </div>
      {endpoint && <div className="font-mono text-[11px] text-foreground/45">{endpoint}</div>}
    </div>
  );
}

// Filterable list of the models the caller can use, tagged by the capabilities Ollama reports.
export function ModelCatalog({ models, loading, error, only, filters = true }: {
  models: DocModel[]; loading: boolean; error: string | null; only?: string; filters?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const scoped = useMemo(() => only ? models.filter((model) => model.capabilities.includes(only)) : models, [models, only]);
  const available = useMemo(() => sortCapabilities([...new Set(scoped.flatMap((model) => model.capabilities))]), [scoped]);
  const visible = scoped.filter((model) => selected.every((capability) => model.capabilities.includes(capability)));

  if (loading) return <StatusBox><span className="mr-2 inline-block h-2 w-2 animate-ping rounded-full bg-nvidia-green" />Loading models…</StatusBox>;
  if (error) return <StatusBox tone="error">{error} Wake or start the AI server, then refresh this page.</StatusBox>;
  if (!scoped.length) return <StatusBox>{only ? `No models with the ${capabilityInfo(only).label} capability are available right now.` : "No models are available right now."}</StatusBox>;

  const toggle = (capability: string) =>
    setSelected((current) => current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability]);

  return (
    <div className="space-y-3">
      {filters && available.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter models by capability">
          {available.map((capability) => {
            const active = selected.includes(capability);
            const count = scoped.filter((model) => model.capabilities.includes(capability)).length;
            return (
              <button key={capability} type="button" onClick={() => toggle(capability)} aria-pressed={active}
                title={capabilityInfo(capability).description}
                className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${active ? "border-nvidia-green bg-nvidia-green/12 text-foreground" : "border-border bg-panel text-foreground/65 hover:bg-panel-hover"}`}>
                {active && <Check className="h-3 w-3 text-nvidia-green" />}
                {capabilityInfo(capability).label}
                <span className="text-foreground/40">{count}</span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])} className="inline-flex h-8 cursor-pointer items-center gap-1 px-2 text-xs font-semibold text-foreground/55 hover:text-foreground">
              <X className="h-3 w-3" />Clear
            </button>
          )}
        </div>
      )}
      {visible.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((model) => <ModelCard key={model.name} model={model} />)}
        </div>
      ) : (
        <StatusBox>No model has all of: {selected.map((capability) => capabilityInfo(capability).label).join(", ")}.</StatusBox>
      )}
    </div>
  );
}
