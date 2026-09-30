export type McpAuth = "oauth" | "none" | "auto" | "token";

export type McpConnection = {
  id: string;
  name: string;
  description: string;
  url: string;
  auth: McpAuth;
  connected: boolean;
};

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[]; [key: string]: unknown };
};
