# Making web answers more useful

Research date: 2026-10-01. Application code was not changed for this investigation. Public product documentation describes supported behavior, not the complete private implementation of ChatGPT or Gemini.

## What the Beijing example revealed

The screenshots compare a generic answer with a sourced summary of holiday traffic forecasts and restrictions. The second answer does not establish access to live road speeds. A claim that roads are clear right now requires separate evidence.

I exercised the configured `qwen3.6:35b-a3b` gateway with `告诉我北京的路况`, the current time, and the existing search tool:

- The model called search with **`北京实时路况 2024`**, despite receiving a 2026 timestamp.
- DuckDuckGo returned eight results, mostly interactive map services. The reader obtained only one short page excerpt of 126 characters.
- The model stopped after one search. It offered generic advice and inferred that roads would be clear because it was late, without evidence for that observation.

This is one diagnostic run, not proof that every response follows the same path. It does show why verifying that a model calls a tool is insufficient.

With the same DuckDuckGo backend, the query **`北京 路况 2026年10月1日 国庆 出行提示 site:beijing.gov.cn`** found current official notices. The existing page reader extracted 3,788 characters from a [Beijing government transport notice](https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202609/t20260930_4886577.html), including its September 30 publication date and October 1 forecast, and 2,940 characters from a [traffic police advisory](https://jtgl.beijing.gov.cn/jgj/jgxx/94246/95332/744133520/index.html).

The immediate gap is query planning and recovering from inadequate evidence. Replacing the search provider alone cannot correct a wrong year or a decision to stop early.

## What the products document

| System | Publicly documented behavior | Relevant lesson |
| --- | --- | --- |
| ChatGPT Search | Can search automatically or when selected; rewrites requests into targeted queries and can issue follow-up queries after examining results. Answers expose citations and sources. | Search is an iterative workflow, not just attaching the first result list. |
| OpenAI web-search API | Reasoning models can search, open pages, and find text; responses include structured citation metadata. | Give the model reading tools and preserve source mappings. |
| Gemini Search grounding | With Google Search enabled, the model can generate queries, retrieve information, and produce an answer with grounding metadata. URL Context supports reading supplied pages. | Separate discovery, reading, and evidence-backed synthesis. |

Sources: [ChatGPT Search](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt), [OpenAI web-search API](https://developers.openai.com/api/docs/guides/tools-web-search), [Gemini Search grounding](https://ai.google.dev/gemini-api/docs/google-search), [Gemini URL Context](https://ai.google.dev/gemini-api/docs/url-context).

These hosted capabilities require their supported services. Changing a local model's request format to the Responses API does not provide OpenAI's search infrastructure. Ollama already supports the essential client-managed tool loop: the model selects tools, the application executes them, and results return to the model. [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)

Search also has limits. Google's consumer Gemini Maps integration explicitly excludes live traffic updates. A dedicated traffic service is needed for reliable road-level live conditions; AMap documents such an API, with authorization requirements that must be checked before adopting it. [Gemini Maps limitations](https://support.google.com/gemini/answer/16622866), [AMap traffic API](https://lbs.amap.com/api/webservice/guide/api-advanced/traffic-situation-inquiry)

## Repository gaps before implementation

This is the investigation's historical snapshot; the implementation now includes query planning, page reading, evidence review, and source citations.

- `lib/mcpChat.ts` supplies a browser-generated UTC timestamp and permits five model rounds, but accepts the first response without tool calls as final. It has no explicit check that retrieved evidence answers the question.
- `lib/webSearchTool.ts` exposes only a query. The model cannot independently choose a result to open or request another section of a page.
- `app/api/web-search/route.ts` keeps the first eight results in provider order. `lib/webSearch.ts` reads the first four and takes up to the first 6,000 characters of static page text. It cannot extract a live map rendered by JavaScript.
- `app/components/ChatInterface.tsx` forces search when the button is selected by searching the latest message verbatim. That bypasses contextual query planning.
- Sources are displayed, but there is no structured mapping that validates a cited source ID against retrieved evidence. Fetch time is correctly distinguished from observation time in the prompt, but that instruction alone did not prevent unsupported claims.

## Recommended implementation

1. **Plan relevant searches.** Use server time and the requested location's date when relevant. Generate focused queries from the question and necessary conversation context. Preserve explicit historical dates; do not blindly append the current year.
2. **Keep automatic and forced search distinct.** Normally let the model decide whether retrieval helps. Selecting Web Search requires a search attempt, using the same query planner. Preserve MCP approval and refusal handling.
3. **Separate search from reading.** Add a bounded `read_page` tool, useful excerpt selection, source dates, and explicit retrieval failures. Reuse the existing public-network validation, pinned connections, redirect checks, limits, and cancellation.
4. **Check evidence before finishing.** Detect irrelevant, old, empty, or unreadable results. Within a small query/time budget, reformulate and try another source. For this example, traffic advisories provide useful partial evidence when live measurements are unavailable. Label forecasts, restrictions, and live observations accurately.
5. **Use structured citations.** Return source IDs and metadata, validate referenced IDs, and render links from retrieved URLs. Citation validation prevents invented links; it does not by itself prove that a source supports a claim.
6. **Evaluate actual answers.** Include Chinese and English current queries, follow-ups, historical requests, ordinary chat, empty results, dynamic pages, cancellation, and declined MCP calls. Measure evidence relevance and claim support, not only whether a tool ran.

Keep the existing local-model architecture initially. Compare DuckDuckGo and Exa on the same representative questions before changing providers. Provider quality and model tool competence both matter, but the reproduced failure already identifies workflow improvements that either provider needs.
