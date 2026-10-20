import { baseUrl } from "../config";

export const chatSnippets = {
  Python: `from openai import OpenAI

client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1",
)

response = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain how AI works in a few words"},
    ],
)

print(response.choices[0].message.content)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain how AI works in a few words" },
  ],
});

console.log(response.choices[0].message.content);`,
  REST: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6:35b-a3b",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain how AI works in a few words"}
    ]
  }'`,
};
