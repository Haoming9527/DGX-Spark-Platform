export const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "search_web",
    description: "Search the web for evidence. Returns source IDs, URLs, snippets and bounded fulltext excerpts when available. Write a focused query using context, the correct date and location. If results are irrelevant, stale or incomplete, reformulate the query. Cite evidence with [source:ID].",
    parameters: {
      type: "object",
      properties: { query: { type: "string", minLength: 1, maxLength: 1000, description: "A focused web search query." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
};
