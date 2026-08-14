import { NextRequest, NextResponse } from "next/server";
import { gatewayAuthHeaders } from "../../../lib/inferenceGateway";
import { inferenceKeyForRequest } from "../../../lib/inferenceKey";

export const dynamic = "force-dynamic";

type CapacityStatus = {
  status?: string;
};

export async function GET(req: NextRequest) {
  try {
    const { base, apiKey } = await inferenceKeyForRequest(req);
    const headers = gatewayAuthHeaders(apiKey);

    const statusRes = await fetch(`${base}/status`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!statusRes.ok) {
      if ([530, 503, 502, 401].includes(statusRes.status)) {
        return NextResponse.json(
          { error: "OFFLINE", message: "DGX Spark gateway is unreachable." },
          { status: 200 }
        );
      }
      return NextResponse.json({ error: statusRes.statusText }, { status: statusRes.status });
    }

    const capacity = (await statusRes.json()) as CapacityStatus;
    if (capacity.status === "sleeping") {
      return NextResponse.json(
        {
          error: "SLEEPING",
          message: "No AI servers are online.",
          status: capacity,
        },
        { status: 200 }
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
        return NextResponse.json(
          { error: "SLEEPING", message: "No AI servers are available." },
          { status: 200 }
        );
      }
      return NextResponse.json({ error: response.statusText }, { status: response.status });
    }

    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    if (models.length === 0) {
      return NextResponse.json(
        {
          error: "SLEEPING",
          message: "No models available — AI servers may be offline.",
          models: [],
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ...data, models },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return NextResponse.json(
        { error: "OFFLINE", message: "DGX Spark gateway connection timed out." },
        { status: 200 }
      );
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "OFFLINE", message: errorMsg }, { status: 200 });
  }
}
