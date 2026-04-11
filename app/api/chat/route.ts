import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { messages, model, useReasoning } = await req.json();

    const apiKey = process.env["X_API_KEY"];
    const endpoint = process.env["API_ENDPOINT"];

    const BASE_SYSTEM_PROMPT = {
      role: "system",
      content: "You are the DGX Spark Platform AI, a local AI assistant running on NVIDIA DGX Spark. Your objective is to provide expert-level assistance with absolute precision. You are helpful, professional, and focus on delivering high-quality technical and general insights. Always ensure your responses are well-structured and concise."
    };

    const payloadMessages = [BASE_SYSTEM_PROMPT, ...messages];

    // Handle Reasoning Injection
    if (useReasoning) {
      payloadMessages.splice(payloadMessages.length - 1, 0, {
        role: "system",
        content: "You are the DGX Spark Platform AI. When asked a question, please evaluate it and output your reasoning by surrounding your internal thoughts STRICTLY with <think> and </think> tags before you provide your final definitive answer. Doing so is highly critical."
      });
    }

    const response = await fetch(`${endpoint}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X_API_KEY": apiKey || "",
      },
      body: JSON.stringify({
        model: model || "llama3.1:8b",
        messages: payloadMessages,
        stream: true,
      }),
      signal: AbortSignal.timeout(180000), // 3-minute timeout
    });

    if (!response.ok) {
      if (response.status === 530 || response.status === 503 || response.status === 502) {
        return new Response(JSON.stringify({ error: "OFFLINE", message: "DGX Spark is currently offline." }), { 
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      console.error(`Ollama Error: ${response.status}`, await response.text());
      return new Response(`Error from upstream: ${response.statusText}`, { status: response.status });
    }

    // Return the readable stream directly
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("API Route Error:", errorMsg);
    return new Response(errorMsg, { status: 500 });
  }
}
