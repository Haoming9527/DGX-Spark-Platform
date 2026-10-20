// Illustrative OpenAI-shaped responses; ids, timestamps and token counts vary.
export const chatResponse = `{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1792459525,
  "model": "qwen3.6:35b-a3b",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "AI learns patterns from data to make predictions." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 24, "completion_tokens": 11, "total_tokens": 35 }
}`;

export const streamResponse = `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"AI"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" learns"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":24,"completion_tokens":11,"total_tokens":35}}

data: [DONE]`;

export const toolCallResponse = `{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "",
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": { "name": "get_weather", "arguments": "{\\"city\\":\\"Singapore\\",\\"unit\\":\\"celsius\\"}" }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}`;

export const structuredResponse = `{
  "choices": [
    {
      "message": { "role": "assistant", "content": "{\\"answer\\": \\"Yes\\", \\"confidence\\": 0.99}" },
      "finish_reason": "stop"
    }
  ]
}`;

export const embeddingsResponse = `{
  "object": "list",
  "data": [
    { "object": "embedding", "index": 0, "embedding": [0.0123, -0.0456, 0.0789, "…"] }
  ],
  "model": "nomic-embed-text:latest",
  "usage": { "prompt_tokens": 8, "total_tokens": 8 }
}`;

export const errorResponse = `{
  "error": {
    "message": "Invalid API key.",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}`;
