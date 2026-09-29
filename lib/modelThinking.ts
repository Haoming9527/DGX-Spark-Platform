export type ThinkingMode = "none" | "toggle" | "required" | "levels";

export function thinkingMode(model: string, capabilities: string[], metadata: unknown): ThinkingMode {
  if (metadata && typeof metadata === "object" && "values" in metadata && Array.isArray(metadata.values)) {
    const values = metadata.values.filter((value): value is boolean | string =>
      typeof value === "boolean" || typeof value === "string" && value.length > 0);
    if (values.length > 0) {
      if (!values.some((value) => value !== false)) return "none";
      if (!values.includes(false)) return "required";
      return values.includes(true) ? "toggle" : "levels";
    }
  }
  if (!capabilities.includes("thinking")) return "none";
  return /(?:^|\/)gpt[-_]?oss(?:[:/-]|$)/i.test(model) ? "required" : "toggle";
}
