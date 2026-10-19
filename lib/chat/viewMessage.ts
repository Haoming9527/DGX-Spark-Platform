import type {
  ChatUIMessage, McpActivity, McpToolMetadata, McpToolOutput, Message, SearchData, SearchToolOutput,
} from "../../app/types/chat";
import type { SearchSource } from "../search/searchEvidence";

type Part = ChatUIMessage["parts"][number];

export type LocalState = {
  startedAt?: number;
  finishedAt?: number;
  status?: Message["responseStatus"];
  errorText?: string;
  followUps?: string[];
};

const RUNNING = new Set(["input-streaming", "input-available", "approval-responded"]);

// `active` is true while streaming or while the response is paused waiting for an approval decision.
function activityStatus(part: Extract<Part, { type: "dynamic-tool" }>, active: boolean): McpActivity["status"] {
  switch (part.state) {
    case "approval-requested": return active ? "approval" : "cancelled";
    case "output-denied": return "declined";
    case "output-error": return "unknown";
    case "output-available": return (part.output as Partial<McpToolOutput> | undefined)?.isError ? "failed" : "completed";
    default: return active ? "running" : "unknown";
  }
}

function metadataOf(part: Extract<Part, { type: "dynamic-tool" }>): McpToolMetadata {
  const meta = part.toolMetadata as Partial<McpToolMetadata> | undefined;
  const [server, name] = (part.title ?? "").split(" · ");
  return { server: meta?.server ?? server ?? "MCP", name: meta?.name ?? name ?? part.toolName, url: meta?.url ?? "" };
}

// Text of the last step that produced text: tool-call preambles from earlier steps are not part of the answer.
function answerText(parts: Part[]) {
  let current: string[] = [];
  let answer: string[] = [];
  for (const part of parts) {
    if (part.type === "step-start") {
      if (current.length) answer = current;
      current = [];
    } else if (part.type === "text") {
      current.push(part.text);
    }
  }
  return (current.length ? current : answer).join("").trim();
}

export function toViewMessage(message: ChatUIMessage, streaming: boolean, local: LocalState = {}): Message {
  const role = message.role === "user" ? "user" : "assistant";
  if (role === "user") {
    const images = message.parts.flatMap(part => part.type === "file" ? [part.url] : []);
    return {
      id: message.id, role,
      content: message.parts.flatMap(part => part.type === "text" ? [part.text] : []).join("\n").trim(),
      ...(images.length ? { images } : {}),
    };
  }

  const parts = message.parts;
  const content = answerText(parts);
  const thoughtProcess = parts.flatMap(part => part.type === "reasoning" && part.text.trim() ? [part.text.trim()] : []).join("\n\n");
  const sources = new Map<string, SearchSource>();
  let searching = false;
  for (const part of parts) {
    if (part.type === "data-search") {
      const data = part.data as SearchData;
      if (data.status === "searching") searching = streaming;
      for (const source of data.sources ?? []) sources.set(source.url, source);
    } else if (part.type === "tool-search_web") {
      if (RUNNING.has(part.state)) searching = searching || streaming;
      if (part.state === "output-available") {
        for (const source of (part.output as SearchToolOutput).sources ?? []) sources.set(source.url, source);
      }
    }
  }
  // A response that stopped at an approval request is paused, not finished: the decision resumes it.
  const paused = local.status !== "stopped" && local.status !== "error" &&
    parts.some(part => part.type === "dynamic-tool" && (part.state === "approval-requested" || part.state === "approval-responded"));
  const active = streaming || paused;
  const mcpActivity = parts.flatMap((part): McpActivity[] => {
    if (part.type !== "dynamic-tool") return [];
    const meta = metadataOf(part);
    return [{
      id: part.approval?.id ?? part.toolCallId, server: meta.server, name: meta.name, url: meta.url,
      arguments: part.input && typeof part.input === "object" && !Array.isArray(part.input) ? part.input as Record<string, unknown> : {},
      status: activityStatus(part, active),
    }];
  });
  const last = parts.at(-1);
  const isThinking = streaming && !content && last?.type === "reasoning";
  const awaitingApproval = mcpActivity.some(activity => activity.status === "approval");
  const running = mcpActivity.find(activity => activity.status === "running");
  const mcpStatus = !active ? undefined
    : awaitingApproval ? "Waiting for your approval…"
      : running ? `Running ${running.name}…`
        : !content && sources.size && !searching ? "Writing answer from sources…" : undefined;
  const status = streaming || paused ? "running" : local.status ?? "complete";

  return {
    id: message.id, role,
    content: [content, local.errorText].filter(Boolean).join("\n\n"),
    ...(thoughtProcess ? { thoughtProcess } : {}),
    isThinking,
    searching,
    ...(sources.size ? { sources: [...sources.values()] } : {}),
    ...(mcpActivity.length ? { mcpActivity } : {}),
    ...(mcpStatus ? { mcpStatus } : {}),
    ...(message.metadata?.tokens ? { evalCount: message.metadata.tokens } : {}),
    ...(message.metadata?.durationMs ? { evalDurationMs: message.metadata.durationMs } : {}),
    ...(local.followUps?.length ? { followUps: local.followUps } : {}),
    responseStartedAt: local.startedAt,
    responseFinishedAt: local.finishedAt,
    responseStatus: status,
  };
}

// Server errors may carry a leading "[CODE]" or "[CODE:capability]" marker for client-side reactions.
export function parseChatError(text: string): { code?: string; capability?: string; message: string } {
  const match = /^\[([A-Z_]+)(?::([a-z]+))?\]\s*/.exec(text);
  return match ? { code: match[1], capability: match[2], message: text.slice(match[0].length) } : { message: text };
}
