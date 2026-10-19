import { NextResponse } from "next/server";

export class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function apiFailure(error: unknown, context: string) {
  if (error instanceof ApiRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(context, error);
  return NextResponse.json({ error: "Internal server error. Try again shortly." }, { status: 500 });
}

export async function readJsonBody(req: Request, limit = 8192): Promise<Record<string, unknown>> {
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(10000)]);
  const declaredSize = Number(req.headers.get("content-length"));
  if (declaredSize > limit) throw new ApiRequestError(413, "Request body is too large.");
  if (!req.body) throw new ApiRequestError(400, "A JSON object is required.");
  const reader = req.body.getReader();
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
      if (size > limit) throw new ApiRequestError(413, "Request body is too large.");
      chunks.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiRequestError(400, "A JSON object is required.");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(signal.aborted ? 408 : 400, signal.aborted
      ? "Request body timed out."
      : "A valid JSON object is required.");
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}
