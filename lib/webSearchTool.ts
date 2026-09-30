export const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "search_web",
    description: "Search the web for evidence. Returns source IDs, URLs, snippets, reading status and available excerpts. Write a focused query using context, the correct date and location. If results are irrelevant, stale or unreadable, reformulate; use read_page for promising sources. Cite evidence with [source:ID].",
    parameters: {
      type: "object",
      properties: { query: { type: "string", minLength: 1, maxLength: 1000, description: "A focused web search query." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

export const READ_PAGE_TOOL = {
  type: "function",
  function: {
    name: "read_page",
    description: "Read a public HTTPS page for evidence, including relevant passages beyond the search preview. Provide the exact URL from a search result or the user's request and a focused query to find relevant passages. Returns a source ID, publication metadata when available and reading status. Cannot read interactive maps, private pages or execute JavaScript.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", maxLength: 2048 },
        query: { type: "string", maxLength: 1000, description: "The facts or passages to find on this page." },
      },
      required: ["url"], additionalProperties: false,
    },
  },
};
