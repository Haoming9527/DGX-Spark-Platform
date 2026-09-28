export type SparkAction = "on" | "shutdown";

// Only these deliberate, public refusals may be relayed from the control API.
// Transport/server failures remain ambiguous and retain the original request ID.
export const SPARK_CONTROL_FAILURES = {
  COOLDOWN: { status: 409, message: "Wait for the power safety interval to finish." },
  MAINTENANCE_LOCK: { status: 409, message: "Spark maintenance is in progress. Shutdown is locked." },
  RECOVERY_REQUIRED: { status: 409, message: "The gateway is checking Spark power after an interruption. Wait for recovery to finish." },
  OPERATION_CONFLICT: { status: 409, message: "Another power operation is active or this request ID was already used. Refresh the Spark status." },
  SAFETY_UNAVAILABLE: { status: 503, message: "The safety checks are unavailable. Check the Spark status and setup before retrying." },
  NOT_READY: { status: 409, message: "The Spark is not ready for this power action. Check its current status." },
  INVALID_REQUEST: { status: 400, message: "The gateway rejected the power request." },
} as const;

export type SparkControlErrorCode = keyof typeof SPARK_CONTROL_FAILURES;

export function isSparkControlErrorCode(value: unknown): value is SparkControlErrorCode {
  return typeof value === "string" && Object.hasOwn(SPARK_CONTROL_FAILURES, value);
}

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
  power_on_blocked_reason: string | null;
  shutdown_blocked_reason: string | null;
  power_on_cooldown_seconds: number;
  shutdown_cooldown_seconds: number;
  maintenance_locked: boolean | null;
  active_requests: number;
  admission_blocked_reason: string | null;
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

export function isSparkPublicMessage(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512 &&
    Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
}

function nullableMessage(value: unknown): value is string | null {
  return value === null || isSparkPublicMessage(value);
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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
  // An older gateway cannot advertise the new safety checks. Fail closed instead
  // of treating missing protection fields as a zero-second cooldown.
  if (!nullableMessage(data.power_on_blocked_reason) || !nullableMessage(data.shutdown_blocked_reason) ||
    !count(data.power_on_cooldown_seconds) || !count(data.shutdown_cooldown_seconds) ||
    (data.maintenance_locked !== null && typeof data.maintenance_locked !== "boolean") ||
    !count(data.active_requests) || !nullableMessage(data.admission_blocked_reason)) return null;
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
    power_on_blocked_reason: data.power_on_blocked_reason,
    shutdown_blocked_reason: data.shutdown_blocked_reason,
    power_on_cooldown_seconds: data.power_on_cooldown_seconds,
    shutdown_cooldown_seconds: data.shutdown_cooldown_seconds,
    maintenance_locked: data.maintenance_locked,
    active_requests: data.active_requests,
    admission_blocked_reason: data.admission_blocked_reason,
    configuration_error: typeof data.configuration_error === "string" ? data.configuration_error : null,
    error: typeof data.error === "string" ? data.error : null,
  };
}
