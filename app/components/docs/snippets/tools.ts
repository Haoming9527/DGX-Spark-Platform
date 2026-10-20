import { baseUrl } from "../config";

export const toolsSnippets = {
  Python: `from openai import OpenAI
import json

client = OpenAI(api_key="dgx_sk_your_key_here", base_url="${baseUrl}/v1")

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get weather for a city",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
            },
            "required": ["city"],
        },
    },
}]

messages = [{"role": "user", "content": "Weather in Singapore in celsius?"}]
res = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=messages,
    tools=tools,
)
msg = res.choices[0].message
messages.append(msg)

for call in msg.tool_calls or []:
    args = json.loads(call.function.arguments)
    result = {"city": args["city"], "temp": 31, "unit": args.get("unit", "celsius")}
    messages.append({
        "role": "tool",
        "tool_call_id": call.id,
        "content": json.dumps(result),
    })

final = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=messages,
    tools=tools,
)
print(final.choices[0].message.content)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const tools = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Get weather for a city",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
      required: ["city"],
    },
  },
}];

const messages = [{ role: "user", content: "Weather in Singapore in celsius?" }];
const res = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages,
  tools,
});
const msg = res.choices[0].message;
messages.push(msg);

for (const call of msg.tool_calls || []) {
  const args = JSON.parse(call.function.arguments);
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify({
      city: args.city,
      temp: 31,
      unit: args.unit || "celsius",
    }),
  });
}

const final = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages,
  tools,
});
console.log(final.choices[0].message.content);`,
  REST: `# 1) Send the tool definition. If the reply has message.tool_calls, run the tool yourself.
curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6:35b-a3b",
    "messages": [{"role": "user", "content": "Weather in Singapore in celsius?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather for a city.",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
          },
          "required": ["city"]
        }
      }
    }]
  }'

# 2) Send the result back: repeat the call with the assistant message (including its tool_calls)
#    and a role "tool" message appended to "messages".
#    {"role": "tool", "tool_call_id": "<id from the tool call>", "content": "{\\"temp_c\\": 31}"}`,
};
