import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apiKey = process.env["X_API_KEY"];
    const endpoint = process.env["API_ENDPOINT"];

    const response = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey || "",
      },
      // Short timeout to detect offline status quickly
      signal: AbortSignal.timeout(5000), 
    });

    if (!response.ok) {
      // Handle Cloudflare Tunnel error (530) or other upstream issues
      if (response.status === 530 || response.status === 503 || response.status === 502) {
        return NextResponse.json({ error: "OFFLINE", message: "DGX Spark is unreachable." }, { status: 200 });
      }
      return NextResponse.json({ error: response.statusText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return NextResponse.json({ error: "OFFLINE", message: "DGX Spark connection timed out." }, { status: 200 });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "OFFLINE", message: errorMsg }, { status: 200 });
  }
}
