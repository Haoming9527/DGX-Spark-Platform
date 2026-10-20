import { baseUrl } from "../config";

export const visionSnippets = {
  Python: `from openai import OpenAI
import base64

client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1",
)

img = base64.b64encode(open("photo.jpg", "rb").read()).decode()

response = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "What is in this image?"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img}"},
            },
        ],
    }],
)

print(response.choices[0].message.content)`,
  JavaScript: `import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const img = fs.readFileSync("photo.jpg").toString("base64");

const response = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "What is in this image?" },
      {
        type: "image_url",
        image_url: { url: \`data:image/jpeg;base64,\${img}\` },
      },
    ],
  }],
});

console.log(response.choices[0].message.content);`,
  REST: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6:35b-a3b",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image?"},
        {
          "type": "image_url",
          "image_url": {"url": "data:image/jpeg;base64,..."}
        }
      ]
    }]
  }'`,
};
