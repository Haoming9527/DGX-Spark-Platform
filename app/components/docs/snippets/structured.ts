import { baseUrl } from "../config";

export const structuredSnippets = {
  Python: `from openai import OpenAI

client = OpenAI(api_key="dgx_sk_your_key_here", base_url="${baseUrl}/v1")

schema = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["answer", "confidence"],
}

res = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=[
        {"role": "user", "content": "Is Paris the capital of France? Return JSON."}
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {"name": "qa", "schema": schema, "strict": True},
    },
)
print(res.choices[0].message.content)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const schema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["answer", "confidence"],
};

const res = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages: [
    { role: "user", content: "Is Paris the capital of France? Return JSON." },
  ],
  response_format: {
    type: "json_schema",
    json_schema: { name: "qa", schema, strict: true },
  },
});
console.log(res.choices[0].message.content);`,
  REST: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6:35b-a3b",
    "messages": [
      {"role": "user", "content": "Is Paris the capital of France? Return JSON."}
    ],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "qa",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "answer": {"type": "string"},
            "confidence": {"type": "number"}
          },
          "required": ["answer", "confidence"]
        }
      }
    }
  }'`,
};
