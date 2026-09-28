"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Cpu, Loader2, Power } from "lucide-react";
import { useSparkPower } from "./useSparkPower";

function value(number: number | null | undefined, digits: number) {
  return number == null ? "—" : number.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function interval(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const buttonBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:bg-panel-hover disabled:text-muted disabled:opacity-100";
const buttonClass = `${buttonBase} bg-panel text-foreground enabled:hover:bg-panel-hover`;
const confirmButtonClass = `${buttonBase} bg-foreground text-background enabled:hover:bg-foreground/90`;

export function DgxSparkPowerPanel() {
  const { snapshot, operation, loading, error, accessError, submitting, actionError, retryRequest, submit } = useSparkPower();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const section = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [retryShutdown, setRetryShutdown] = useState(false);
  const running = operation?.status === "running";
  const busy = submitting || running;
  const controlsBlocked = busy || Boolean(retryRequest) || Boolean(accessError);
  const shutdownConfirmationBlocked = busy || Boolean(accessError) ||
    (retryShutdown ? !retryRequest : !snapshot?.can_shutdown);
  const powerOnReason = snapshot?.power_on_cooldown_seconds ?
    `Available in ${interval(snapshot.power_on_cooldown_seconds)}.` : snapshot?.power_on_blocked_reason;
  const shutdownReason = snapshot?.shutdown_cooldown_seconds ?
    `Available in ${interval(snapshot.shutdown_cooldown_seconds)}.` : snapshot?.shutdown_blocked_reason;
  const issue = accessError ? null : snapshot?.configuration_error || snapshot?.error || error;
  const relayLabel = snapshot?.relay_state === "ON" ? "On" : snapshot?.relay_state === "OFF" ? "Off" : "Unknown";
  const machineLabel = loading ? "Checking…" : snapshot?.relay_state === "OFF" ? "Powered off" :
    running ? operation.action === "on" ? "Starting" : operation.phase === "draining" ? "Finishing AI requests" : "Shutting down" :
      snapshot?.machine_status === "online" ? "Online" :
        snapshot?.relay_state === "ON" ? "Power on; Spark unavailable" : "Unknown";
  const measurements = [
    { label: "Power", reading: snapshot?.power_w, unit: "W", digits: 1 },
    { label: "Voltage", reading: snapshot?.voltage_v, unit: "V", digits: 1 },
    { label: "Current", reading: snapshot?.current_a, unit: "A", digits: 3 },
  ];
  const energy = [
    { label: "Today", reading: snapshot?.energy_today_kwh },
    { label: "Yesterday", reading: snapshot?.energy_yesterday_kwh },
    { label: "Total", reading: snapshot?.energy_total_kwh },
  ];

  const confirmShutdown = (trigger: HTMLElement, retry = false) => {
    opener.current = trigger;
    setRetryShutdown(retry);
    dialog.current?.showModal();
    cancel.current?.focus();
  };

  useEffect(() => {
    if (shutdownConfirmationBlocked) dialog.current?.close();
  }, [shutdownConfirmationBlocked]);

  return (
    <section ref={section} tabIndex={-1} className="sticker max-w-3xl px-5 py-6 sm:px-6" aria-labelledby={`${id}-title`} aria-busy={loading}>
      <h2 id={`${id}-title`} className="flex items-center gap-2.5 text-lg font-bold">
        <Cpu className="h-5 w-5 shrink-0" aria-hidden="true" />
        DGX Spark — Singapore
      </h2>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Plug</dt>
          <dd className="font-semibold">{relayLabel}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-muted">Spark</dt>
          <dd className="font-semibold">{machineLabel}</dd>
        </div>
      </dl>
      {accessError && (
        <p className="mt-3 text-sm text-muted" role="status">
          {accessError === "signed-out" ? <Link href="/auth" className="underline underline-offset-4">Sign in to control Spark power.</Link> :
            "Your account no longer has access to Spark power controls."}
        </p>
      )}
      {issue && <p className="mt-3 text-sm text-muted" role="status">{issue}</p>}

      <dl className="mt-6 grid grid-cols-1 gap-5 min-[420px]:grid-cols-3 min-[420px]:gap-4">
        {measurements.map(({ label, reading, unit, digits }) => (
          <div key={label} className="flex items-baseline justify-between gap-3 min-[420px]:block">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums min-[420px]:mt-2">
              <span className="text-3xl font-semibold tracking-tight" aria-label={reading == null ? "Unavailable" : undefined}>{value(reading, digits)}</span>
              <span className="text-sm text-muted">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-7 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">Energy usage</h3>
        <dl className="mt-2 divide-y divide-border">
          {energy.map(({ label, reading }) => (
            <div key={label} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="flex items-baseline gap-2 tabular-nums">
                <span className="text-base font-semibold" aria-label={reading == null ? "Unavailable" : undefined}>{value(reading, 3)}</span>
                <span className="text-sm text-muted">kWh</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:flex-wrap">
          <div className="min-w-0 flex-1">
            <button type="button" className={`${buttonClass} w-full`} aria-describedby={powerOnReason ? `${id}-power-on-reason` : undefined} disabled={controlsBlocked || !snapshot?.can_power_on} onClick={() => void submit("on")}>
              <Power className="h-4 w-4 shrink-0" aria-hidden="true" />
              Power on
            </button>
            {powerOnReason && <p id={`${id}-power-on-reason`} className="mt-2 text-sm leading-6 text-muted tabular-nums">{powerOnReason}</p>}
          </div>
          <div className="min-w-0 flex-1">
            <button type="button" className={`${buttonClass} w-full`} aria-describedby={shutdownReason ? `${id}-shutdown-reason` : undefined} disabled={controlsBlocked || !snapshot?.can_shutdown} onClick={(event) => confirmShutdown(event.currentTarget)}>
              Shut down &amp; power off
            </button>
            {shutdownReason && <p id={`${id}-shutdown-reason`} className="mt-2 text-sm leading-6 text-muted tabular-nums">{shutdownReason}</p>}
          </div>
        </div>
        <div className="mt-3 text-sm leading-6" role="status" aria-live="polite" aria-atomic="true">
          {submitting ? <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />Sending request…</p> :
            operation && <p className="flex items-start gap-2">{running && <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />}<span>{operation.message}</span></p>}
          {running && <p className="mt-1 text-muted">Continues if you leave this page.</p>}
          {snapshot?.admission_blocked_reason && <p className="mt-1 text-muted">AI requests paused.</p>}
          {actionError && <p className="mt-2 text-muted">{actionError}</p>}
        </div>
        {retryRequest && !accessError && (
          <button type="button" className="mt-2 min-h-11 text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={(event) => retryRequest.action === "shutdown" ? confirmShutdown(event.currentTarget, true) : void submit("on", true)}>
            Retry the same {retryRequest.action === "on" ? "power-on" : "shutdown"} request
          </button>
        )}
      </div>

      <dialog ref={dialog} aria-labelledby={`${id}-confirm-title`} aria-describedby={`${id}-confirm-description`} className="sticker fixed m-auto max-h-[calc(100svh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto p-6 backdrop:bg-black/60" onClose={() => {
        if (opener.current?.isConnected && !opener.current.matches(":disabled")) opener.current.focus();
        else section.current?.focus();
      }}>
        <h3 id={`${id}-confirm-title`} className="text-lg font-bold">Shut down DGX Spark?</h3>
        <p id={`${id}-confirm-description`} className="mt-3 text-sm leading-6 text-muted">Blocks new AI requests and waits for active requests before shutting down. Other jobs may stop.</p>
        <div className="mt-6 flex flex-col-reverse gap-3 min-[420px]:flex-row min-[420px]:justify-end">
          <button ref={cancel} type="button" className={buttonClass} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" className={confirmButtonClass} disabled={shutdownConfirmationBlocked} onClick={() => {
            dialog.current?.close();
            void submit("shutdown", retryShutdown);
          }}>Shut down &amp; power off</button>
        </div>
      </dialog>
    </section>
  );
}
