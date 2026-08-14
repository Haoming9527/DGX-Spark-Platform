"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AdminShell } from "../AdminShell";

type ModelRow = { name: string; restricted: boolean };

export default function AdminModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/models", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load models.");
      setModels(data.models || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load models.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (name: string, restricted: boolean) => {
    setError(null);
    const res = await fetch("/api/admin/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelName: name, restricted }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Update failed.");
      return;
    }
    setModels((prev) => prev.map((m) => (m.name === name ? { ...m, restricted } : m)));
  };

  return (
    <AdminShell
      title="Restricted models"
      hint="Restricted models are hidden from the public list and cannot be called without admin."
      active="models"
    >
      <div className="sticker space-y-4 p-4 sm:p-5">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-nvidia-green" />
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {models.map((model) => (
              <div key={model.name} className="flex items-center justify-between gap-3 px-4 py-3">
                <code className="truncate font-mono text-sm">{model.name}</code>
                <button
                  type="button"
                  onClick={() => toggle(model.name, !model.restricted)}
                  className={`sticker-sm h-8 px-3 text-xs font-semibold ${
                    model.restricted ? "text-red-400" : "text-nvidia-green"
                  }`}
                >
                  {model.restricted ? "Restricted" : "Public"}
                </button>
              </div>
            ))}
            {models.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted">No live models.</div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
