"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSparkControlErrorCode, isSparkPublicMessage, parseSparkOperation, parseSparkSnapshot, SPARK_CONTROL_FAILURES, type SparkAction, type SparkOperation, type SparkSnapshot } from "@/lib/infra/spark";

type PendingRequest = { action: SparkAction; request_id: string };
type AccessError = "signed-out" | "forbidden" | null;

function requestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // LAN HTTP pages expose getRandomValues even when randomUUID requires HTTPS.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function useSparkPower() {
  const [snapshot, setSnapshot] = useState<SparkSnapshot | null>(null);
  const [operation, setOperation] = useState<SparkOperation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<AccessError>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<PendingRequest | null>(null);
  const pending = useRef<PendingRequest | null>(null);
  const mounted = useRef(false);
  const blocked = useRef(false);
  const posting = useRef(false);
  const generation = useRef(0);
  const activeRead = useRef<AbortController | null>(null);
  const activePost = useRef<AbortController | null>(null);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let poll: number | undefined;
    mounted.current = true;
    blocked.current = false;
    const isVisible = () => document.visibilityState === "visible";

    const load = async () => {
      if (stopped || blocked.current || posting.current || activeRead.current || !isVisible()) return;
      window.clearTimeout(poll);
      const controller = new AbortController();
      activeRead.current = controller;
      const readGeneration = generation.current;
      let timedOut = false;
      let failureMessage = "Could not read the Spark. Retrying…";
      const deadline = window.setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
      const current = () => !stopped && readGeneration === generation.current;
      try {
        const response = await fetch("/api/infra/dgx-spark", { cache: "no-store", signal: controller.signal });
        if (!current() || controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          blocked.current = true;
          setAccessError(response.status === 401 ? "signed-out" : "forbidden");
          setSnapshot(null);
          setOperation(null);
          return;
        }
        if (!response.ok) {
          const body: unknown = await response.json();
          if (body && typeof body === "object" && "message" in body && isSparkPublicMessage(body.message)) failureMessage = body.message;
          throw new Error("Spark status unavailable");
        }
        const reading = parseSparkSnapshot(await response.json());
        if (!reading) {
          failureMessage = "Spark controls are unavailable. Check that the gateway is updated and its safety status is complete.";
          throw new Error("Invalid Spark safety status");
        }
        if (!current() || controller.signal.aborted) return;
        setSnapshot(reading);
        setOperation(reading.operation);
        setError(null);
        if (pending.current && reading.operation?.request_id === pending.current.request_id) {
          pending.current = null;
          setRetryRequest(null);
          setActionError(null);
        }
      } catch {
        if (current() && (!controller.signal.aborted || timedOut)) {
          setSnapshot(null);
          setError(failureMessage);
        }
      } finally {
        window.clearTimeout(deadline);
        if (activeRead.current === controller) activeRead.current = null;
        if (!stopped) {
          setLoading(false);
          if (!blocked.current && isVisible()) poll = window.setTimeout(() => void load(), 2000);
        }
      }
    };
    const onVisibility = () => {
      window.clearTimeout(poll);
      if (!isVisible()) activeRead.current?.abort();
      else void load();
    };
    refresh.current = () => { window.clearTimeout(poll); void load(); };
    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      mounted.current = false;
      activeRead.current?.abort();
      activeRead.current = null;
      activePost.current?.abort();
      window.clearTimeout(poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const submit = useCallback(async (action: SparkAction, retry = false) => {
    if (posting.current || blocked.current || !mounted.current) return;
    if (pending.current && (!retry || pending.current.action !== action)) return;
    if (!retry && (!snapshot || operation?.status === "running" || !(action === "on" ? snapshot.can_power_on : snapshot.can_shutdown))) {
      setActionError((action === "on" ? snapshot?.power_on_blocked_reason : snapshot?.shutdown_blocked_reason) || "Wait for the current Spark status before requesting this action.");
      return;
    }
    const request = retry ? pending.current : { action, request_id: requestId() };
    if (!request) return;
    posting.current = true;
    pending.current = request;
    generation.current++;
    activeRead.current?.abort();
    activeRead.current = null;
    setSubmitting(true);
    setActionError(null);
    setRetryRequest(null);
    const controller = new AbortController();
    activePost.current = controller;
    const deadline = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/infra/dgx-spark/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!mounted.current) return;
      if (response.status === 401 || response.status === 403) {
        blocked.current = true;
        pending.current = null;
        setSnapshot(null);
        setOperation(null);
        setAccessError(response.status === 401 ? "signed-out" : "forbidden");
        return;
      }
      const body: unknown = await response.json();
      if (!mounted.current) return;
      if (!response.ok) {
        const data = body !== null && typeof body === "object" ? body as { message?: unknown; error?: unknown } : {};
        const refused = isSparkControlErrorCode(data.error) && SPARK_CONTROL_FAILURES[data.error].status === response.status;
        // Server failures may happen after acceptance. Keep the same ID for an explicit retry.
        if (response.status >= 500 && !refused) throw new Error("Request outcome unknown");
        pending.current = null;
        setActionError(isSparkPublicMessage(data.message) ? data.message : "The action could not start. Check the current status.");
        return;
      }
      const accepted = parseSparkOperation(body);
      if (!accepted || accepted.request_id !== request.request_id) throw new Error("Request outcome unknown");
      pending.current = null;
      setOperation(accepted);
    } catch {
      if (mounted.current) {
        setActionError("Could not confirm the request. Check the operation status before retrying.");
        setRetryRequest(request);
      }
    } finally {
      window.clearTimeout(deadline);
      if (activePost.current === controller) activePost.current = null;
      posting.current = false;
      generation.current++;
      if (mounted.current) {
        setSubmitting(false);
        refresh.current();
      }
    }
  }, [snapshot, operation]);

  return { snapshot, operation, loading, error, accessError, submitting, actionError, retryRequest, submit };
}
