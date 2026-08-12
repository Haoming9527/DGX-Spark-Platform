import { NextResponse } from "next/server";
import {
  getInferenceGatewayBase,
  gatewayAuthHeaders,
  requireInferenceGateway,
} from "../../../lib/inferenceGateway";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function gatewayHostFromBase(base: string | null): string | null {
  if (!base) return null;
  try {
    return new URL(base).host;
  } catch {
    return base.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}

export async function GET() {
  const configuredBase = getInferenceGatewayBase();
  const gatewayHost = gatewayHostFromBase(configuredBase);

  try {
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
      return NextResponse.json({ error: response.statusText }, { status: response.status });
    }

    const capacity = await response.json();
    return NextResponse.json({
      ...capacity,
      gateway: "ready",
      gateway_host: gatewayHost,
      error: capacity.status === "sleeping" ? "SLEEPING" : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "OFFLINE",
        message,
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
