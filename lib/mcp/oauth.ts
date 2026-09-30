import "server-only";
import { randomBytes } from "node:crypto";
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { ApiRequestError } from "../apiRequest";
import { prisma } from "../prisma";
import { digest, seal, unseal } from "./crypto";
import { publicUrl, resolvePublic, mcpNetwork } from "./network";
import { connectionFor, saveCredentials, type McpCredentials, type McpRecord } from "./storage";

type PendingAuthorization = {
  credentials: McpCredentials; verifier: string; redirectUri: string; revision: number;
};

function sameIssuer(first: string, second: string) {
  return publicUrl(first).href.replace(/\/$/, "") === publicUrl(second).href.replace(/\/$/, "");
}

export class McpOAuthProvider implements OAuthClientProvider {
  authorizationUrl?: string;
  verifier = "";
  private stateValue = randomBytes(32).toString("base64url");

  constructor(
    readonly credentials: McpCredentials,
    readonly redirectUrl: string,
    private readonly signal: AbortSignal,
  ) {}

  get clientMetadata() {
    return {
      client_name: "DGX Spark Platform", redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
      token_endpoint_auth_method: this.credentials.client?.client_secret ? "client_secret_basic" : "none",
    };
  }
  state() { return this.stateValue; }
  clientInformation() { return this.credentials.client; }
  tokens() { return this.credentials.tokens; }
  discoveryState() { return this.credentials.discovery; }
  codeVerifier() {
    if (!this.verifier) throw new ApiRequestError(400, "OAuth approval expired. Connect again.");
    return this.verifier;
  }
  saveCodeVerifier(value: string) { this.verifier = value; }

  saveClientInformation(value: OAuthClientInformationMixed) {
    this.checkIssuer(value.issuer);
    this.credentials.client = value;
  }
  saveTokens(value: OAuthTokens) {
    this.checkIssuer(value.issuer);
    if (!/^Bearer$/i.test(value.token_type) || value.access_token.length > 8192) {
      throw new ApiRequestError(502, "The MCP server returned unsupported OAuth credentials.");
    }
    this.credentials.tokens = value;
    this.credentials.expiresAt = value.expires_in ? Date.now() + value.expires_in * 1000 : undefined;
  }
  async saveDiscoveryState(value: OAuthDiscoveryState) {
    const issuer = publicUrl(value.authorizationServerUrl);
    this.checkIssuer(issuer.href);
    const metadata = value.authorizationServerMetadata;
    if (!metadata || !sameIssuer(metadata.issuer, issuer.href)) {
      throw new ApiRequestError(502, "The MCP server has invalid OAuth discovery metadata.");
    }
    for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.registration_endpoint]) {
      if (endpoint) {
        const url = publicUrl(endpoint);
        await resolvePublic(url, this.signal);
      }
    }
    this.credentials.discovery = value;
  }
  async redirectToAuthorization(value: URL) {
    const url = publicUrl(value);
    await resolvePublic(url, this.signal);
    if (url.searchParams.get("state") !== this.stateValue || url.searchParams.get("redirect_uri") !== this.redirectUrl ||
        url.searchParams.get("code_challenge_method") !== "S256") {
      throw new ApiRequestError(502, "Invalid MCP OAuth authorization request.");
    }
    this.authorizationUrl = url.href;
  }
  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "tokens") { delete this.credentials.tokens; delete this.credentials.expiresAt; }
    if ((scope === "all" || scope === "client") && !this.credentials.expectedIssuer) delete this.credentials.client;
    if (scope === "all" || scope === "verifier") this.verifier = "";
    if (scope === "all" || scope === "discovery") delete this.credentials.discovery;
  }
  private checkIssuer(issuer?: string) {
    if (!issuer || (this.credentials.expectedIssuer && !sameIssuer(issuer, this.credentials.expectedIssuer))) {
      throw new ApiRequestError(502, "OAuth issuer does not match this connection's registration.");
    }
    const existing = this.credentials.tokens?.issuer ?? this.credentials.client?.issuer;
    if (existing && !sameIssuer(issuer, existing)) {
      throw new ApiRequestError(502, "The MCP OAuth issuer changed. Remove and add the connection again.");
    }
  }
}

export async function saveAuthorization(record: McpRecord, provider: McpOAuthProvider, sessionHash: string) {
  if (!provider.authorizationUrl || !provider.verifier) throw new ApiRequestError(502, "OAuth authorization could not be started.");
  await saveCredentials(record, provider.credentials);
  const stateHash = digest(provider.state());
  const payload = seal({
    credentials: provider.credentials, verifier: provider.verifier,
    redirectUri: provider.redirectUrl, revision: record.revision,
  } satisfies PendingAuthorization, `mcp-oauth:${record.user_id}:${record.id}:${stateHash}`);
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`DELETE FROM mcp_oauth_states WHERE connection_id = ${record.id}::uuid AND user_id = ${record.user_id}::uuid`;
    await tx.$executeRaw`
      INSERT INTO mcp_oauth_states (state_hash, user_id, connection_id, session_hash, payload, expires_at)
      VALUES (${stateHash}, ${record.user_id}::uuid, ${record.id}::uuid, ${sessionHash}, ${payload}, statement_timestamp() + INTERVAL '10 minutes')
    `;
  });
}

export async function finishAuthorization(input: {
  userId: string; sessionHash: string; state: string; code: string; origin: string; signal: AbortSignal; responseIssuer?: string;
}) {
  const stateHash = digest(input.state);
  const rows = await prisma.$queryRaw<{ connection_id: string; payload: string }[]>`
    DELETE FROM mcp_oauth_states WHERE state_hash = ${stateHash} AND user_id = ${input.userId}::uuid
      AND session_hash = ${input.sessionHash} AND expires_at > statement_timestamp()
    RETURNING connection_id, payload
  `;
  if (!rows[0]) throw new ApiRequestError(400, "OAuth approval expired or was already used. Connect again.");
  const record = await connectionFor(input.userId, rows[0].connection_id);
  const pending = unseal<PendingAuthorization>(rows[0].payload, `mcp-oauth:${record.user_id}:${record.id}:${stateHash}`);
  if (pending.redirectUri !== `${input.origin}/api/mcp/oauth/callback` || pending.revision !== record.revision) {
    throw new ApiRequestError(400, "The MCP connection changed. Connect again.");
  }
  if (input.responseIssuer && (!pending.credentials.discovery ||
      !sameIssuer(input.responseIssuer, pending.credentials.discovery.authorizationServerUrl))) {
    throw new ApiRequestError(400, "OAuth response came from a different issuer. Connect again.");
  }
  const network = mcpNetwork(input.signal);
  try {
    const provider = new McpOAuthProvider(pending.credentials, pending.redirectUri, network.signal);
    provider.verifier = pending.verifier;
    const result = await auth(provider, { serverUrl: record.url, authorizationCode: input.code, fetchFn: network.fetch });
    if (result !== "AUTHORIZED") throw new ApiRequestError(400, "OAuth was not completed. Connect again.");
    await saveCredentials(record, provider.credentials);
  } finally { await network.close(); }
}
