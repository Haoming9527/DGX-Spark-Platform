import { NextRequest, NextResponse } from "next/server";
import { clientKey, takeRateLimit } from "../../../lib/security/rateLimit";
import {
  getInferenceGatewayBase,
  gatewayAuthHeaders,
  requireInferenceGateway,
} from "../../../lib/inference/inferenceGateway";

export const dynamic = "force-dynamic";

function gatewayHostFromBase(base: string | null): string | null {
  if (!base) return null;
  try {
    return new URL(base).host;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const configuredBase = getInferenceGatewayBase();
  const gatewayHost = gatewayHostFromBase(configuredBase);

  try {
    if (!await takeRateLimit(`status:${clientKey(req)}`, { limit: 60, windowMs: 60_000 })) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
    const { base, apiKey } = requireInferenceGateway();
    const response = await fetch(`${base}/status`, {
      method: "GET",
      headers: gatewayAuthHeaders(apiKey),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if ([530, 503, 502, 401].includes(response.status)) {
        return NextResponse.json(
          {
            error: "OFFLINE",
            message: "Inference gateway is unreachable.",
            status: "offline",
            gateway: "offline",
            gateway_host: gatewayHost,
            endpoints: [],
            checked_at: new Date().toISOString(),
          },
          { status: 200 }
        );
      }
      return NextResponse.json({ error: "Gateway request failed." }, { status: response.status });
    }

    const capacity = await response.json();
    return NextResponse.json({
      ...capacity,
      gateway: "ready",
      gateway_host: gatewayHost,
      error: capacity.status === "sleeping" ? "SLEEPING" : undefined,
    });
  } catch (error: unknown) {
    console.error("Gateway status failed:", error);
    return NextResponse.json(
      {
        error: "OFFLINE",
        message: "Inference gateway is currently unavailable.",
        status: "offline",
        gateway: "offline",
        gateway_host: gatewayHost,
        endpoints: [],
        checked_at: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
