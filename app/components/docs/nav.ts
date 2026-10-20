export const navGroups = [
  {
    id: "get-started",
    label: "Get started",
    items: [
      { id: "overview", label: "Overview" },
      { id: "quickstart", label: "Quickstart" },
      { id: "authentication", label: "Authentication" },
      { id: "models", label: "Models" },
    ],
  },
  {
    id: "guides",
    label: "Guides",
    items: [
      { id: "chat", label: "Chat completions" },
      { id: "streaming", label: "Streaming" },
      { id: "vision", label: "Vision" },
      { id: "embeddings", label: "Embeddings" },
      { id: "systemone", label: "System One" },
      { id: "tools", label: "Tools & MCP" },
      { id: "structured", label: "Structured output" },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    items: [
      { id: "endpoints", label: "Endpoints" },
      { id: "errors-usage", label: "Errors & usage" },
      { id: "roadmap", label: "Roadmap" },
      { id: "terms", label: "T&C" },
    ],
  },
] as const;

export type NavGroupId = (typeof navGroups)[number]["id"];

export const allSectionIds: string[] = navGroups.flatMap((group) => group.items.map((item) => item.id));

export function groupIdForSection(sectionId: string): NavGroupId | null {
  return navGroups.find((group) => group.items.some((item) => item.id === sectionId))?.id ?? null;
}

export function scrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", `#${sectionId}`);
}
