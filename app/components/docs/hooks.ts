"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { allSectionIds } from "./nav";

export type DocModel = { name: string; capabilities: string[]; size?: string };

// One /api/models request shared by every section that lists models.
export function useModels() {
  const [state, setState] = useState<{ models: DocModel[]; loading: boolean; error: string | null }>({
    models: [], loading: true, error: null,
  });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/models", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.models)) {
          const models = data.models.map((model: { name: string; capabilities?: unknown; details?: { parameter_size?: string } }) => ({
            name: model.name,
            capabilities: Array.isArray(model.capabilities)
              ? model.capabilities.filter((cap): cap is string => typeof cap === "string").map((cap) => cap.trim().toLowerCase())
              : [],
            size: model.details?.parameter_size || undefined,
          }));
          setState({ models, loading: false, error: null });
        } else {
          setState({
            models: [], loading: false,
            error: data.error === "SLEEPING" || data.error === "OFFLINE"
              ? data.message || "The AI server is offline or asleep."
              : "Failed to fetch the model list.",
          });
        }
      })
      .catch(() => { if (!cancelled) setState({ models: [], loading: false, error: "Failed to fetch the model list." }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const copy = useCallback((text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 2000);
  }, []);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return { copied, copy };
}

export function useScrollSpy(onChange: (sectionId: string) => void) {
  useEffect(() => {
    const nodes = allSectionIds.map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    if (!nodes.length) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
        else visible.delete(entry.target.id);
      }
      let best: string | null = null;
      let bestRatio = 0;
      for (const id of allSectionIds) {
        const ratio = visible.get(id) ?? 0;
        if (ratio > bestRatio) { bestRatio = ratio; best = id; }
      }
      if (best) onChange(best);
    }, { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.1, 0.25, 0.5, 1] });
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [onChange]);
}
