import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    object: "api",
    name: "DGX Spark OpenAI-compatible API",
    version: "v1",
    supported_endpoints: {
      models: "/v1/models",
      model: "/v1/models/{model}",
      chat_completions: "/v1/chat/completions",
    },
    unsupported_openai_surfaces_return_json_errors: [
      "responses",
      "embeddings",
      "images",
      "audio",
      "files",
      "uploads",
      "batches",
      "fine_tuning",
      "moderations",
      "vector_stores",
      "realtime",
      "assistants",
      "admin",
    ],
  });
}
