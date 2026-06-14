import { NextRequest, NextResponse } from "next/server";
import { fetchOpenAiModelList, openAiError, OpenAiModel, unsupportedOpenAiEndpoint, validateBearerToken } from "../../../../lib/openaiGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  try {
    const auth = await validateBearerToken(req);
    if (!auth.ok) return auth.response;

    const { model } = await params;
    const models = await fetchOpenAiModelList();
    if (!models.ok) return models.response;

    const decodedModel = decodeURIComponent(model);
    const match = (models.data as OpenAiModel[]).find((item) => item.id === decodedModel);

    if (!match) {
      return openAiError(
        `The model '${decodedModel}' does not exist or is not currently loaded on DGX Spark.`,
        404,
        "invalid_request_error",
        "model_not_found"
      );
    }

    return NextResponse.json(match);
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return openAiError("DGX Spark connection timed out.", 503, "server_error", "offline");
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    return openAiError(message, 500, "api_error");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params;
  return unsupportedOpenAiEndpoint(`models/${decodeURIComponent(model)}`, "DELETE");
}
