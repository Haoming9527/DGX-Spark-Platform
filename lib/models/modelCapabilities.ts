export function isDecisionModel(capabilities?: unknown): boolean {
  return Array.isArray(capabilities) && capabilities.some((capability) =>
    typeof capability === "string" && capability.trim().toLowerCase() === "decision");
}
