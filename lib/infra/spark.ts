export type SparkAction = "on" | "shutdown";

export type SparkOperation = {
  id: string;
  request_id: string;
  action: SparkAction;
  status: "running" | "succeeded" | "failed" | "unknown";
  phase: string;
  message: string;
  started_at: string;
  finished_at?: string;
};

export type SparkSnapshot = {
  device: "dgx-spark-sg";
  relay_state: "ON" | "OFF" | null;
  machine_status: "online" | "unreachable" | "unknown";
  power_w: number | null;
  voltage_v: number | null;
  current_a: number | null;
  energy_today_kwh: number | null;
  energy_yesterday_kwh: number | null;
  energy_total_kwh: number | null;
  received_at: string | null;
  operation: SparkOperation | null;
  can_power_on: boolean;
  can_shutdown: boolean;
  configuration_error: string | null;
  error: string | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function parseSparkOperation(value: unknown): SparkOperation | null {
  const data = object(value);
  if (!data || typeof data.id !== "string" || !data.id ||
    typeof data.request_id !== "string" || !data.request_id ||
    (data.action !== "on" && data.action !== "shutdown") ||
    !["running", "succeeded", "failed", "unknown"].includes(String(data.status)) ||
    typeof data.phase !== "string" || typeof data.message !== "string" || !timestamp(data.started_at)) return null;
  return {
    id: data.id,
    request_id: data.request_id,
    action: data.action,
    status: data.status as SparkOperation["status"],
    phase: data.phase,
    message: data.message,
    started_at: data.started_at as string,
    ...(timestamp(data.finished_at) ? { finished_at: data.finished_at as string } : {}),
  };
}

// Keep the shared browser/proxy contract limited to public readings and progress.
export function parseSparkSnapshot(value: unknown): SparkSnapshot | null {
  const data = object(value);
  if (!data || data.device !== "dgx-spark-sg" ||
    (data.relay_state !== "ON" && data.relay_state !== "OFF" && data.relay_state !== null) ||
    !["online", "unreachable", "unknown"].includes(String(data.machine_status)) ||
    typeof data.can_power_on !== "boolean" || typeof data.can_shutdown !== "boolean") return null;
  const operation = data.operation == null ? null : parseSparkOperation(data.operation);
  if (data.operation != null && !operation) return null;
  const number = (key: string): number | null => {
    const value = data[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  };
  return {
    device: "dgx-spark-sg",
    relay_state: data.relay_state,
    machine_status: data.machine_status as SparkSnapshot["machine_status"],
    power_w: number("power_w"),
    voltage_v: number("voltage_v"),
    current_a: number("current_a"),
    energy_today_kwh: number("energy_today_kwh"),
    energy_yesterday_kwh: number("energy_yesterday_kwh"),
    energy_total_kwh: number("energy_total_kwh"),
    received_at: timestamp(data.received_at),
    operation,
    can_power_on: data.can_power_on,
    can_shutdown: data.can_shutdown,
    configuration_error: typeof data.configuration_error === "string" ? data.configuration_error : null,
    error: typeof data.error === "string" ? data.error : null,
  };
}
