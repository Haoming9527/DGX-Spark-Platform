import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  parseSparkOperation,
  parseSparkSnapshot,
  type SparkAction,
} from "./spark";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

class SparkGatewayError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

export function sparkFailure(error: unknown) {
  const failure = error instanceof SparkGatewayError
    ? error
    : new SparkGatewayError("UNAVAILABLE", "Could not load Spark power information. Try again shortly.", 503);
  return NextResponse.json(
    { error: failure.code, message: failure.message },
    { status: failure.status, headers: NO_STORE },
  );
}

// Bound both size and time, including chunked bodies without Content-Length.
async function readJSON(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal) {
  if (!body) throw new Error("Missing JSON body");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("JSON body exceeds size limit");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as unknown;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}

export async function readSparkAction(req: NextRequest): Promise<{ action: SparkAction; request_id: string }> {
  // Do not trust forwarded headers to widen the origin accepted for a mutation.
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    throw new SparkGatewayError("FORBIDDEN_ORIGIN", "Power changes must be requested from this site.", 403);
  }
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new SparkGatewayError("JSON_REQUIRED", "Send the power action as JSON.", 415);
  }
  let value: unknown;
  try {
    value = await readJSON(req.body, 2048, AbortSignal.any([req.signal, AbortSignal.timeout(5000)]));
  } catch {
    throw new SparkGatewayError("INVALID_REQUEST", "The power request is invalid or too large.", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SparkGatewayError("INVALID_REQUEST", "A power action and request ID are required.", 400);
  }
  const body = value as Record<string, unknown>;
  if (
    (body.action !== "on" && body.action !== "shutdown") ||
    typeof body.request_id !== "string" || !UUID.test(body.request_id)
  ) {
    throw new SparkGatewayError("INVALID_REQUEST", "Choose power on or shutdown and provide a valid request ID.", 400);
  }
  return { action: body.action, request_id: body.request_id };
}

async function gatewayRequest(
  req: NextRequest,
  action?: { action: SparkAction; request_id: string; actorID: string },
) {
  const base = process.env.INFRA_GATEWAY_URL?.trim();
  const key = (action ? process.env.INFRA_GATEWAY_CONTROL_KEY : process.env.INFRA_GATEWAY_READ_KEY)?.trim();
  if (!base || !key) {
    throw new SparkGatewayError("NOT_CONFIGURED", action
      ? "Spark power control has not been connected yet."
      : "Spark power monitoring has not been connected yet.", 503);
  }
  let url: URL;
  try {
    const root = new URL(base);
    if (!["http:", "https:"].includes(root.protocol) || root.username || root.password || root.search || root.hash) throw new Error();
    url = new URL(`${base.replace(/\/+$/, "")}/infra/dgx-spark${action ? "/actions" : ""}`);
  } catch {
    throw new SparkGatewayError("NOT_CONFIGURED", "The Spark gateway URL needs to be configured.", 503);
  }
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(12000)]);
  let response: Response;
  try {
    response = await fetch(url, {
      method: action ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(action ? { "Content-Type": "application/json", "X-Actor-ID": action.actorID } : {}),
      },
      ...(action ? { body: JSON.stringify({ action: action.action, request_id: action.request_id }) } : {}),
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch {
    throw new SparkGatewayError("GATEWAY_UNAVAILABLE", action
      ? "The power request could not be confirmed. Check the current Spark status before retrying."
      : "Could not reach the Spark power gateway.", 503);
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403) {
      throw new SparkGatewayError("CONNECTION_REJECTED", "The gateway rejected the connection. Ask an admin to check its credentials.", 503);
    }
    if (response.status === 409) {
      throw new SparkGatewayError("OPERATION_CONFLICT", "Another power operation is active or this request ID was already used. Refresh the Spark status.", 409);
    }
    if (response.status === 400) {
      throw new SparkGatewayError("INVALID_REQUEST", "The gateway rejected the power request.", 400);
    }
    if (response.status === 404) {
      throw new SparkGatewayError("ENDPOINT_NOT_FOUND", "The Spark power endpoint is unavailable. Check the deployed gateway version.", 502);
    }
    throw new SparkGatewayError("GATEWAY_UNAVAILABLE", "Spark power is unavailable. Check its current status and configuration.", 503);
  }
  try {
    return await readJSON(response.body, 32768, signal);
  } catch {
    throw new SparkGatewayError("INVALID_RESPONSE", action
      ? "The power response could not be read. Check the current Spark status before retrying."
      : "The gateway returned an unreadable Spark power response.", 502);
  }
}

export async function readSparkStatus(req: NextRequest) {
  const snapshot = parseSparkSnapshot(await gatewayRequest(req));
  if (!snapshot) throw new SparkGatewayError("INVALID_RESPONSE", "The gateway returned an invalid Spark status.", 502);
  return NextResponse.json(snapshot, { headers: NO_STORE });
}

export async function runSparkAction(
  req: NextRequest,
  action: { action: SparkAction; request_id: string },
  actorID: string,
) {
  const operation = parseSparkOperation(await gatewayRequest(req, { ...action, actorID }));
  if (!operation) {
    throw new SparkGatewayError("INVALID_RESPONSE", "The power response is invalid. Check the current Spark status before retrying.", 502);
  }
  return NextResponse.json(operation, { status: 202, headers: NO_STORE });
}
