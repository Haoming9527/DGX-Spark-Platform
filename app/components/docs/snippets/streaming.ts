import { baseUrl } from "../config";

export const streamingSnippets = {
  Python: `from openai import OpenAI

client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1",
)

stream = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=[{"role": "user", "content": "Count to five."}],
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta.content or ""
    print(delta, end="", flush=True)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const stream = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages: [{ role: "user", content: "Count to five." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}`,
  REST: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -N \\
  -d '{
    "model": "qwen3.6:35b-a3b",
    "stream": true,
    "messages": [{"role": "user", "content": "Count to five."}]
  }'`,
};
