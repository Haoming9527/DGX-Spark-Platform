import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "./db";

type OllamaModel = {
  name?: unknown;
  modified_at?: string;
};

export type OpenAiModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: "dgx-spark";
};

export function openAiError(message: string, status: number, type = "invalid_request_error", code: string | null = null) {
  return NextResponse.json(
    {
      error: {
        message,
        type,
        code,
      },
    },
    { status }
  );
}

export function unsupportedOpenAiEndpoint(path: string, method: string) {
  return openAiError(
    `${method} /v1/${path} is recognized as an OpenAI-compatible API path, but DGX Spark only supports /v1/models and /v1/chat/completions right now.`,
    404,
    "invalid_request_error",
    "endpoint_not_supported"
  );
}

export async function validateBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      response: openAiError("Missing or invalid Authorization header. Expected Bearer token.", 401),
    } as const;
  }

  const apiKey = authHeader.substring(7).trim();
  if (!apiKey) {
    return {
      ok: false,
      response: openAiError("Empty API Key.", 401),
    } as const;
  }

  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const dbResult = await query(
    "SELECT id FROM api_keys WHERE key_hash = $1 LIMIT 1",
    [keyHash]
  );

  if (dbResult.rows.length === 0) {
    return {
      ok: false,
      response: openAiError("Invalid API key.", 401, "invalid_request_error", "invalid_api_key"),
    } as const;
  }

  return { ok: true } as const;
}

export async function fetchOpenAiModelList() {
  const endpoint = process.env.API_ENDPOINT;
  const xApiKey = process.env.X_API_KEY;

  if (!endpoint) {
    return {
      ok: false,
      response: openAiError("Upstream API_ENDPOINT is not configured.", 500, "server_error"),
    } as const;
  }

  const upstreamResponse = await fetch(`${endpoint}/api/tags`, {
    method: "GET",
    headers: {
      "X-API-Key": xApiKey || "",
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!upstreamResponse.ok) {
    if ([530, 503, 502].includes(upstreamResponse.status)) {
      return {
        ok: false,
        response: openAiError("DGX Spark is currently offline.", 503, "server_error", "offline"),
      } as const;
    }

    const errText = await upstreamResponse.text();
    return {
      ok: false,
      response: openAiError(`Upstream error: ${errText}`, upstreamResponse.status, "server_error"),
    } as const;
  }

  const data = await upstreamResponse.json();
  const models = Array.isArray(data.models) ? data.models : [];

  return {
    ok: true,
    data: models
      .filter((model: OllamaModel) => typeof model.name === "string")
      .map((model: { name: string; modified_at?: string }): OpenAiModel => ({
        id: model.name,
        object: "model",
        created: model.modified_at
          ? Math.floor(new Date(model.modified_at).getTime() / 1000)
          : 0,
        owned_by: "dgx-spark",
      })),
  } as const;
}
