"use client";

import { useEffect, useState } from "react";
import { parsePowerSnapshot, type PowerSnapshot } from "@/lib/infra/power";

export function usePowerTelemetry() {
  const [snapshot, setSnapshot] = useState<PowerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ signIn: boolean } | null>(null);

  useEffect(() => {
    let stopped = false;
    let signedOut = false;
    let poll: number | undefined;
    let active: AbortController | null = null;
    const isVisible = () => document.visibilityState === "visible";

    const load = async () => {
      if (stopped || signedOut || active || !isVisible()) return;
      window.clearTimeout(poll);
      const started = Date.now();
      const controller = new AbortController();
      active = controller;
      let timedOut = false;
      let failed = false;
      const deadline = window.setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
      try {
        const response = await fetch("/api/admin/infra/pi-power", { cache: "no-store", signal: controller.signal });
        if (response.status === 401 || response.status === 403) {
          if (!stopped && !controller.signal.aborted) {
            signedOut = true;
            setSnapshot(null);
            setError({ signIn: true });
          }
          return;
        }
        if (!response.ok) throw new Error("Reading unavailable");
        const reading = parsePowerSnapshot(await response.json());
        if (!reading || reading.stale || reading.retained || !reading.mqtt_connected || reading.device_status !== "online") {
          throw new Error("No fresh reading");
        }
        if (!stopped && !controller.signal.aborted) {
          setSnapshot(reading);
          setError(null);
        }
      } catch {
        failed = true;
        if (!stopped && (!controller.signal.aborted || timedOut)) {
          setSnapshot(null);
          setError({ signIn: false });
        }
      } finally {
        window.clearTimeout(deadline);
        if (active === controller) active = null;
        if (!stopped) {
          setLoading(false);
          if (!signedOut && isVisible()) {
            const delay = controller.signal.aborted && !timedOut ? 0 : failed ? 1000 : Math.max(0, 1000 - (Date.now() - started));
            poll = window.setTimeout(() => void load(), delay);
          }
        }
      }
    };
    const onVisibility = () => {
      window.clearTimeout(poll);
      if (!isVisible()) active?.abort();
      else {
        setSnapshot(null);
        setLoading(true);
        void load();
      }
    };
    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      active?.abort();
      window.clearTimeout(poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { snapshot, loading, error };
}
