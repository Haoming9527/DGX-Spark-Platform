import type { UIMessage } from "ai";
import type { ThinkingMetadata, ThinkingMode } from "@/lib/models/modelThinking";
import type { SearchSource } from "@/lib/search/searchEvidence";

export type ChatMetadata = { tokens?: number; durationMs?: number };

export type SearchData = {
  status: "searching" | "done" | "failed";
  query?: string;
  sources?: SearchSource[];
  message?: string;
};

export type SearchToolOutput = { query: string; serverTime?: string; message?: string; sources: SearchSource[] };

export type McpToolMetadata = { server: string; name: string; url: string };

export type McpToolOutput = { content: string; isError: boolean };

export type PlanData = { status: "planning" | "done" };

export type ChatUIMessage = UIMessage<ChatMetadata, { search: SearchData; plan: PlanData }>;

export type McpActivity = {
  id: string;
  server: string;
  url: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "approval" | "running" | "completed" | "declined" | "failed" | "cancelled" | "unknown";
};

// View model rendered by MessageBubble and ResponseActivity, derived from ChatUIMessage.
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  thoughtProcess?: string;
  isThinking?: boolean;
  evalCount?: number;
  evalDurationMs?: number;
  searching?: boolean;
  sources?: SearchSource[];
  followUps?: string[];
  mcpActivity?: McpActivity[];
  mcpStatus?: string;
  responseStartedAt?: number;
  responseFinishedAt?: number;
  responseStatus?: "running" | "complete" | "stopped" | "error";
}

export interface ModelItem {
  id: string;
  name: string;
  parameterSize?: string | null;
  thinkingMode?: ThinkingMode;
  thinkingMetadata?: ThinkingMetadata;
  vision: boolean;
  tools: boolean;
  audio: boolean;
}

export type ChatImage = {
  id: string;
  name: string;
  dataUrl: string;
};
