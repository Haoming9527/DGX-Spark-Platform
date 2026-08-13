export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  thoughtProcess?: string;
  isThinking?: boolean;
  evalCount?: number;
  evalDurationMs?: number;
}

export interface ModelItem {
  id: string;
  name: string;
  parameterSize?: string | null;
  capabilities: string[];
  thinking: boolean;
  vision: boolean;
  tools: boolean;
  embedding: boolean;
  audio: boolean;
}

export type ChatImage = {
  id: string;
  name: string;
  dataUrl: string;
};
