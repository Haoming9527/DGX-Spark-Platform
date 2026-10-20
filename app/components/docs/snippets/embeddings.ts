import { baseUrl } from "../config";

export const embeddingsSnippets = {
  Python: `from openai import OpenAI

client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1",
)

res = client.embeddings.create(
    model="nomic-embed-text:latest",
    input=[
        "DGX Spark runs local models",
        "Embeddings power search and RAG",
    ],
)

print(len(res.data[0].embedding), res.data[0].embedding[:4])`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const res = await client.embeddings.create({
  model: "nomic-embed-text:latest",
  input: [
    "DGX Spark runs local models",
    "Embeddings power search and RAG",
  ],
});

console.log(res.data[0].embedding.length, res.data[0].embedding.slice(0, 4));`,
  REST: `curl ${baseUrl}/v1/embeddings \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nomic-embed-text:latest",
    "input": [
      "DGX Spark runs local models",
      "Embeddings power search and RAG"
    ]
  }'`,
};
