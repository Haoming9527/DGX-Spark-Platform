export type PowerSnapshot = {
  device: string;
  mqtt_connected: boolean;
  device_status: "online" | "offline" | "unknown";
  stale: boolean;
  stale_after_seconds: number;
  received_at: string | null;
  age_seconds: number | null;
  retained: boolean;
  power_w: number | null;
  voltage_v: number | null;
  current_a: number | null;
  energy_today_kwh: number | null;
  energy_yesterday_kwh: number | null;
  energy_total_kwh: number | null;
};

// Whitelist the read contract; upstream diagnostics and credentials never enter the UI.
export function parsePowerSnapshot(value: unknown): PowerSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.mqtt_connected !== "boolean" || typeof data.stale !== "boolean" ||
    typeof data.retained !== "boolean" ||
    !["online", "offline", "unknown"].includes(String(data.device_status))
  ) return null;
  const number = (key: string): number | null => {
    const v = data[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  };
  const receivedAt = typeof data.received_at === "string" && Number.isFinite(Date.parse(data.received_at))
    ? data.received_at : null;
  return {
    device: "raspberry-pi-5",
    mqtt_connected: data.mqtt_connected,
    device_status: data.device_status as PowerSnapshot["device_status"],
    stale: data.stale || receivedAt === null || number("age_seconds") === null,
    // Compatibility with gateways built before the frontend was added.
    stale_after_seconds: number("stale_after_seconds") || 30,
    received_at: receivedAt,
    age_seconds: number("age_seconds"),
    retained: data.retained,
    power_w: number("power_w"),
    voltage_v: number("voltage_v"),
    current_a: number("current_a"),
    energy_today_kwh: number("energy_today_kwh"),
    energy_yesterday_kwh: number("energy_yesterday_kwh"),
    energy_total_kwh: number("energy_total_kwh"),
  };
}
