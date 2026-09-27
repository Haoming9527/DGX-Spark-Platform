import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/requireAccount";
import { parsePowerSnapshot } from "@/lib/infra/power";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: string, message: string, status = 503) {
  return NextResponse.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdminRequest(req);
    if (gate.error) {
      gate.error.headers.set("Cache-Control", "no-store");
      return gate.error;
    }
    const base = process.env.INFRA_GATEWAY_URL?.trim();
    const key = process.env.INFRA_GATEWAY_READ_KEY?.trim();
    if (!base || !key) {
      return failure("NOT_CONFIGURED", "Power monitoring has not been connected yet.");
    }
    let url: URL;
    try {
      url = new URL(`${base.replace(/\/+$/, "")}/infra/pi-power`);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      return failure("NOT_CONFIGURED", "The power monitoring connection needs to be configured.");
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(6000)]),
    });
    if (response.status === 401 || response.status === 403) {
      return failure("CONNECTION_REJECTED", "The gateway did not accept the monitoring connection. Check its read key.");
    }
    if (response.status === 404) {
      return failure("ENDPOINT_NOT_FOUND", "The gateway does not have the power monitoring endpoint. Check its URL and deployed version.");
    }
    if (response.status === 504) return failure("METER_TIMEOUT", "The plug did not respond in time.", 504);
    if (!response.ok) return failure("GATEWAY_UNAVAILABLE", "Could not read the plug.");
    const snapshot = parsePowerSnapshot(await response.json());
    if (!snapshot) return failure("INVALID_RESPONSE", "The power monitor returned an unreadable response.", 502);
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("CONNECTION_UNAVAILABLE", "Could not load power readings. Check the connection and try again.");
  }
}
