export function isDecisionModel(model: string, capabilities?: unknown): boolean {
  const caps = Array.isArray(capabilities)
    ? capabilities.filter((capability): capability is string => typeof capability === "string")
      .map((capability) => capability.trim().toLowerCase())
    : [];
  if (caps.length > 0) return caps.includes("decision");
  const family = model.trim().toLowerCase().split("/").at(-1)?.split(":")[0];
  return family === "clef" || family === "clef-flash";
}
