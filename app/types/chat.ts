import type { ThinkingMetadata, ThinkingMode } from "@/lib/modelThinking";
import type { McpActivity, McpChatMessage } from "@/lib/mcpChat";
import type { SearchSource } from "@/lib/searchEvidence";

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
  mcpActivity?: McpActivity[];
  mcpStatus?: string;
  mcpContext?: McpChatMessage[];
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
