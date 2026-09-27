import { NextRequest, NextResponse } from "next/server";
import { gatewayAuthHeaders } from "../../../lib/inferenceGateway";
import { inferenceKeyForAccount } from "../../../lib/inferenceKey";
import { loadOptionalAccount } from "../../../lib/requireAccount";
import { clearSessionCookie } from "../../../lib/auth";

export const dynamic = "force-dynamic";

type CapacityStatus = {
  status?: string;
};

function json(data: unknown, init?: { status?: number; headers?: HeadersInit }, clearCookie = false) {
  const res = NextResponse.json(data, init);
  if (clearCookie) clearSessionCookie(res);
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const { account, clearCookie } = await loadOptionalAccount(req);
    const { base, apiKey } = inferenceKeyForAccount(account);
    const headers = gatewayAuthHeaders(apiKey);

    const statusRes = await fetch(`${base}/status`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!statusRes.ok) {
      if ([530, 503, 502, 401].includes(statusRes.status)) {
        return json(
          { error: "OFFLINE", message: "DGX Spark gateway is unreachable." },
          { status: 200 },
          clearCookie
        );
      }
      return json({ error: statusRes.statusText }, { status: statusRes.status }, clearCookie);
    }

    const capacity = (await statusRes.json()) as CapacityStatus;
    if (capacity.status === "sleeping") {
      return json(
        {
          error: "SLEEPING",
          message: "No AI servers are online.",
          status: capacity,
        },
        { status: 200 },
        clearCookie
      );
    }

    const response = await fetch(`${base}/olla/ollama/api/tags`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if ([530, 503, 502, 401].includes(response.status)) {
        return json(
          { error: "SLEEPING", message: "No AI servers are available." },
          { status: 200 },
          clearCookie
        );
      }
      return json({ error: response.statusText }, { status: response.status }, clearCookie);
    }

    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    if (models.length === 0) {
      return json(
        {
          error: "SLEEPING",
          message: "No models available — AI servers may be offline.",
          models: [],
        },
        { status: 200 },
        clearCookie
      );
    }

    return json(
      { ...data, models },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
      clearCookie
    );
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return json({ error: "OFFLINE", message: "DGX Spark gateway connection timed out." }, { status: 200 });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return json({ error: "OFFLINE", message: errorMsg }, { status: 200 });
  }
}
