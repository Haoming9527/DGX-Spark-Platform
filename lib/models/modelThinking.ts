export type ThinkingMode = "none" | "toggle" | "required" | "levels";
export type ThinkingControl = boolean | string | null;
export type ThinkingMetadata = { values: (boolean | string)[]; default?: boolean | string };

export function readThinkingMetadata(metadata: unknown): ThinkingMetadata | undefined {
  if (!metadata || typeof metadata !== "object" || !("values" in metadata) || !Array.isArray(metadata.values)) return;
  const values = [...new Set(metadata.values.filter((value): value is boolean | string =>
    typeof value === "boolean" || typeof value === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(value)))];
  if (!values.length) return;
  const fallback = "default" in metadata ? metadata.default : undefined;
  return { values, ...(values.some((value) => value === fallback) ? { default: fallback as boolean | string } : {}) };
}

export function thinkingMode(model: string, capabilities: string[], metadata: unknown): ThinkingMode {
  const settings = readThinkingMetadata(metadata);
  if (settings) {
    const { values } = settings;
    if (!values.some((value) => value !== false)) return "none";
    if (values.some((value) => typeof value === "string") && values.length > 1) return "levels";
    return values.includes(false) ? "toggle" : "required";
  }
  if (!capabilities.includes("thinking")) return "none";
  return /(?:^|\/)gpt[-_]?oss(?:[:/-]|$)/i.test(model) ? "levels" : "toggle";
}

export function selectThinkingControl(model: string, metadata: unknown, enabled: boolean): ThinkingControl {
  const settings = readThinkingMetadata(metadata);
  if (settings) {
    const preferences = enabled ? ["high", true, "medium", "low"] : [false, "low"];
    for (const value of preferences) {
      if (settings.values.includes(value)) return value;
    }
    return settings.default ?? null;
  }
  if (/(?:^|\/)gpt[-_]?oss(?:[:/-]|$)/i.test(model)) return enabled ? "high" : "low";
  return enabled;
}
