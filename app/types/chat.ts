export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thoughtProcess?: string;
  isThinking?: boolean;
  evalCount?: number;
  evalDurationMs?: number;
}

export interface ModelItem {
  id: string;
  name: string;
}
