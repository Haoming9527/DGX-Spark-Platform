import { NextRequest, NextResponse } from "next/server";
import { fetchOpenAiModelList, openAiError, unsupportedOpenAiEndpoint, validateBearerToken } from "../../../lib/openaiGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await validateBearerToken(req);
    if (!auth.ok) return auth.response;

    const models = await fetchOpenAiModelList();
    if (!models.ok) return models.response;

    return NextResponse.json({
      object: "list",
      data: models.data,
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return openAiError("DGX Spark connection timed out.", 503, "server_error", "offline");
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    return openAiError(message, 500, "api_error");
  }
}

export async function DELETE() {
  return unsupportedOpenAiEndpoint("models", "DELETE");
}
