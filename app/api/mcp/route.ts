import { NextRequest } from "next/server";
import { ApiRequestError, readJsonBody } from "@/lib/apiRequest";
import { mcpConfigured } from "@/lib/mcp/crypto";
import { publicUrl, resolvePublic } from "@/lib/mcp/network";
import { boundedString, mcpAccount, mcpFailure, mcpJson } from "@/lib/mcp/request";
import { cleanExpiredStates, createConnection, listConnections, type McpCredentials } from "@/lib/mcp/storage";
import type { McpAuth } from "@/lib/mcp/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { account } = await mcpAccount(req, false);
    if (!mcpConfigured()) return mcpJson({ configured: false, connections: [] });
    await cleanExpiredStates();
    return mcpJson({ configured: true, connections: await listConnections(account.id) });
  } catch (error) { return mcpFailure(error); }
}

export async function POST(req: NextRequest) {
  try {
    const { account } = await mcpAccount(req);
    const body = await readJsonBody(req, 16384);
    if (body.trusted !== true) throw new ApiRequestError(400, "Only connect a server you trust.");
    const name = boundedString(body.name, "Name", 100, true);
    const description = boundedString(body.description, "Description", 500);
    const url = publicUrl(boundedString(body.url, "Server URL", 2048, true));
    if (url.search) throw new ApiRequestError(400, "Use the token field for credentials, not URL query parameters.");
    const auth = boundedString(body.auth, "Authentication", 10, true) as McpAuth;
    if (!["oauth", "none", "auto", "token"].includes(auth)) throw new ApiRequestError(400, "Choose a supported authentication method.");
    const token = boundedString(body.token, "Token", 8192, auth === "token");
    const clientId = boundedString(body.clientId, "OAuth client ID", 1024);
    const clientSecret = boundedString(body.clientSecret, "OAuth client secret", 4096);
    const issuer = boundedString(body.issuer, "OAuth issuer", 2048);
    if ((clientId || clientSecret || issuer) && auth !== "oauth" && auth !== "auto") {
      throw new ApiRequestError(400, "OAuth settings require OAuth authentication.");
    }
    if ((clientId || clientSecret || issuer) && (!clientId || !issuer)) {
      throw new ApiRequestError(400, "Provide both the registered OAuth client ID and issuer URL.");
    }
    if ((token && auth !== "token") || /[\r\n]/.test(token)) throw new ApiRequestError(400, "Use a valid bearer token with token authentication.");
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(8000)]);
    await resolvePublic(url, signal);
    const credentials: McpCredentials = auth === "token" ? { token } : {};
    if (clientId) {
      const issuerUrl = publicUrl(issuer);
      if (issuerUrl.search) throw new ApiRequestError(400, "OAuth issuer cannot contain query parameters.");
      await resolvePublic(issuerUrl, signal);
      credentials.expectedIssuer = issuerUrl.href;
      credentials.client = { client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), issuer: issuerUrl.href };
    }
    const connection = await createConnection(account.id, { name, description, url: url.href, auth, credentials });
    return mcpJson({ connection }, 201);
  } catch (error) { return mcpFailure(error); }
}
