import "server-only";
import { randomUUID } from "node:crypto";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import { prisma } from "../prisma";
import { ApiRequestError } from "../apiRequest";
import { seal, unseal } from "./crypto";
import type { McpAuth, McpConnection } from "./types";

export type McpCredentials = {
  token?: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  expiresAt?: number;
  discovery?: OAuthDiscoveryState;
  expectedIssuer?: string;
};

export type McpRecord = {
  id: string; user_id: string; name: string; description: string; url: string;
  auth: McpAuth; credentials: string; connected_at: Date | null; revision: number;
};

export function credentialsContext(record: Pick<McpRecord, "id" | "user_id">) {
  return `mcp:${record.user_id}:${record.id}`;
}

export function readCredentials(record: McpRecord) {
  return unseal<McpCredentials>(record.credentials, credentialsContext(record));
}

export function publicConnection(record: McpRecord): McpConnection {
  return {
    id: record.id, name: record.name, description: record.description, url: record.url,
    auth: record.auth, connected: Boolean(record.connected_at),
  };
}

export async function connectionFor(userId: string, id: string): Promise<McpRecord> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiRequestError(404, "MCP connection not found.");
  }
  const rows = await prisma.$queryRaw<McpRecord[]>`
    SELECT * FROM mcp_connections WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
  `;
  if (!rows[0]) throw new ApiRequestError(404, "MCP connection not found.");
  return rows[0];
}

export async function listConnections(userId: string) {
  const rows = await prisma.$queryRaw<McpRecord[]>`
    SELECT * FROM mcp_connections WHERE user_id = ${userId}::uuid ORDER BY created_at
  `;
  return rows.map(publicConnection);
}

export async function createConnection(userId: string, input: {
  name: string; description: string; url: string; auth: McpAuth; credentials: McpCredentials;
}) {
  const id = randomUUID();
  const encrypted = seal(input.credentials, credentialsContext({ id, user_id: userId }));
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const counts = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM mcp_connections WHERE user_id = ${userId}::uuid
    `;
    if (Number(counts[0].count) >= 8) throw new ApiRequestError(400, "You can save up to eight MCP connections.");
    const rows = await tx.$queryRaw<McpRecord[]>`
      INSERT INTO mcp_connections (id, user_id, name, description, url, auth, credentials)
      VALUES (${id}::uuid, ${userId}::uuid, ${input.name}, ${input.description}, ${input.url}, ${input.auth}, ${encrypted})
      RETURNING *
    `;
    return publicConnection(rows[0]);
  });
}

export async function saveCredentials(record: McpRecord, credentials: McpCredentials, connected = false) {
  const encrypted = seal(credentials, credentialsContext(record));
  const count = await prisma.$executeRaw`
    UPDATE mcp_connections SET credentials = ${encrypted}, revision = revision + 1,
      connected_at = CASE WHEN ${connected} THEN statement_timestamp() ELSE NULL END
    WHERE id = ${record.id}::uuid AND user_id = ${record.user_id}::uuid AND revision = ${record.revision}
  `;
  if (!count) throw new ApiRequestError(409, "This MCP connection changed. Refresh and try again.");
  record.revision += 1;
  record.credentials = encrypted;
}

export async function forgetConnection(userId: string, id: string) {
  await connectionFor(userId, id);
  await prisma.$executeRaw`DELETE FROM mcp_connections WHERE id = ${id}::uuid AND user_id = ${userId}::uuid`;
}

export async function cleanExpiredStates() {
  await prisma.$executeRaw`
    DELETE FROM mcp_oauth_states WHERE state_hash IN (
      SELECT state_hash FROM mcp_oauth_states WHERE expires_at < statement_timestamp() LIMIT 100
    )
  `;
  await prisma.$executeRaw`
    DELETE FROM mcp_calls WHERE (user_id, request_id) IN (
      SELECT user_id, request_id FROM mcp_calls WHERE expires_at < statement_timestamp() LIMIT 100
    )
  `;
}
