import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../../lib/db";

export const runtime = "nodejs";

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

interface ApiKeyRow {
  id: string;
  user_id: string;
}

export async function POST(req: NextRequest) {
  let keyRow: ApiKeyRow | null = null;

  // Log detailed usage in api_key_usage table.
  async function logApiUsage(statusCode: number, tokens = 0, promptTokens = 0, completionTokens = 0) {
    if (!keyRow?.id) return;
    try {
      await query(
        `UPDATE api_keys
         SET last_used_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [keyRow.id]
      );

      await query(
        `INSERT INTO api_key_usage (key_id, tokens, prompt_tokens, completion_tokens, status_code)
         VALUES ($1, $2, $3, $4, $5)`,
        [keyRow.id, tokens, promptTokens, completionTokens, statusCode]
      );
    } catch (err) {
      console.error("Failed to log API usage:", err);
    }
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: { message: "Missing or invalid Authorization header. Expected Bearer token.", type: "invalid_request_error", code: null } },
        { status: 401 }
      );
    }

    const apiKey = authHeader.substring(7).trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: { message: "Empty API Key.", type: "invalid_request_error", code: null } },
        { status: 401 }
      );
    }

    // Lookup key by its SHA-256 hash — raw keys are never stored
    const keyHash = hashKey(apiKey);
    const dbResult = await query(
      "SELECT id, user_id FROM api_keys WHERE key_hash = $1 LIMIT 1",
      [keyHash]
    );

    if (dbResult.rows.length === 0) {
      return NextResponse.json(
        { error: { message: "Invalid API key.", type: "invalid_request_error", code: "invalid_api_key" } },
        { status: 401 }
      );
    }

    keyRow = dbResult.rows[0];

    // 2. Parse payload
    const body = await req.json();
    const { model, messages, stream } = body;

    if (!messages || !Array.isArray(messages)) {
      await logApiUsage(400);
      return NextResponse.json(
        { error: { message: "messages is required and must be an array.", type: "invalid_request_error", code: null } },
        { status: 400 }
      );
    }

    // FIX: Limit message count and content size to prevent upstream abuse.
    if (messages.length > 200) {
      await logApiUsage(400);
      return NextResponse.json(
        { error: { message: "Too many messages. Maximum is 200.", type: "invalid_request_error", code: null } },
        { status: 400 }
      );
    }
    for (const msg of messages) {
      if (typeof msg.content === "string" && msg.content.length > 100_000) {
        await logApiUsage(400);
        return NextResponse.json(
          { error: { message: "A message content exceeds the 100,000 character limit.", type: "invalid_request_error", code: null } },
          { status: 400 }
        );
      }
    }

    const endpoint = process.env.API_ENDPOINT;
    const xApiKey = process.env.X_API_KEY;

    if (!endpoint) {
      await logApiUsage(500);
      return NextResponse.json(
        { error: { message: "Upstream API_ENDPOINT is not configured.", type: "server_error", code: null } },
        { status: 500 }
      );
    }

    // Call upstream Ollama
    const upstreamResponse = await fetch(`${endpoint}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": xApiKey || "",
      },
      body: JSON.stringify({
        model: model || "llama3.1:8b",
        messages: messages,
        stream: !!stream,
      }),
    });

    if (!upstreamResponse.ok) {
      const status = upstreamResponse.status;
      await logApiUsage(status);
      if (status === 530 || status === 503 || status === 502) {
        return NextResponse.json(
          { error: { message: "DGX Spark is currently offline.", type: "server_error", code: "offline" } },
          { status: 503 }
        );
      }
      const errText = await upstreamResponse.text();
      return NextResponse.json(
        { error: { message: `Upstream error: ${errText}`, type: "server_error", code: null } },
        { status: status }
      );
    }

    // Handle Streaming response
    if (stream) {
      const chatcmplId = `chatcmpl-${crypto.randomUUID()}`;
      const createdTime = Math.floor(Date.now() / 1000);
      const targetModel = model || "llama3.1:8b";

      const reader = upstreamResponse.body?.getReader();
      if (!reader) {
        await logApiUsage(500);
        return NextResponse.json({ error: "Failed to read upstream stream" }, { status: 500 });
      }

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let buffer = "";
      let totalTokens = 0;
      let promptTokens = 0;
      let completionTokens = 0;
      let usageLogged = false;

      const logStreamUsage = async (statusCode: number) => {
        if (usageLogged) return;
        usageLogged = true;
        await logApiUsage(statusCode, totalTokens, promptTokens, completionTokens);
      };

      const customStream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                await logStreamUsage(200);
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                try {
                  const parsed = JSON.parse(trimmed);
                  const content = parsed.message?.content || "";
                  const finishReason = parsed.done ? "stop" : null;

                  // Capture token count from the final Ollama done frame
                  if (parsed.done) {
                    promptTokens = parsed.prompt_eval_count || 0;
                    completionTokens = parsed.eval_count || 0;
                    totalTokens = promptTokens + completionTokens;
                    await logStreamUsage(200);
                  }

                  const openAiChunk = {
                    id: chatcmplId,
                    object: "chat.completion.chunk",
                    created: createdTime,
                    model: targetModel,
                    choices: [
                      {
                        index: 0,
                        delta: parsed.done ? {} : { content },
                        finish_reason: finishReason,
                      },
                    ],
                  };

                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAiChunk)}\n\n`));
                } catch (e) {
                  console.warn("Failed to parse stream line:", trimmed, e);
                }
              }
            }
          } catch (err) {
            await logStreamUsage(500);
            controller.error(err);
          }
        },
        async cancel() {
          try {
            await logStreamUsage(499);
            await reader.cancel();
          } catch (err) {
            console.error("Failed to log canceled stream usage:", err);
          }
        },
      });

      return new Response(customStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Handle Non-Streaming response
    const data = await upstreamResponse.json();
    const chatcmplId = `chatcmpl-${crypto.randomUUID()}`;
    const createdTime = Math.floor(Date.now() / 1000);
    const targetModel = model || "llama3.1:8b";

    const responseBody = {
      id: chatcmplId,
      object: "chat.completion",
      created: createdTime,
      model: targetModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: data.message?.content || "",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };

    // Non-streaming: track tokens before returning
    const promptTokens = data.prompt_eval_count || 0;
    const completionTokens = data.eval_count || 0;
    const totalTokens = promptTokens + completionTokens;
    await logApiUsage(200, totalTokens, promptTokens, completionTokens);

    return NextResponse.json(responseBody);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("OpenAI Endpoint error:", error);
    if (keyRow?.id) {
      await logApiUsage(500);
    }
    return NextResponse.json(
      { error: { message: msg, type: "api_error", code: null } },
      { status: 500 }
    );
  }
}
