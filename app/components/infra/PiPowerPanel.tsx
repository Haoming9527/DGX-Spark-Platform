"use client";

import Link from "next/link";
import { CircuitBoard } from "lucide-react";
import { usePowerTelemetry } from "./usePowerTelemetry";

function value(number: number | null | undefined, digits: number) {
  return number == null ? "—" : number.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function PiPowerPanel() {
  const { snapshot, loading, error } = usePowerTelemetry();
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

  return (
    <section className="sticker max-w-3xl px-5 py-6 sm:px-6" aria-labelledby="pi-power-title" aria-busy={loading}>
      <h2 id="pi-power-title" className="flex items-center gap-2.5 text-lg font-bold">
        <CircuitBoard className="h-5 w-5 shrink-0" aria-hidden="true" />
        Raspberry Pi 5
      </h2>
      {error && (
        <p className="mt-3 text-sm text-muted" role="status">
          {error.signIn ? <Link href="/auth" className="underline underline-offset-4">Sign in to view readings.</Link> : "Unable to read the plug. Retrying…"}
        </p>
      )}
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
    </section>
  );
}
