import { baseUrl } from "../config";
import { chatSnippets } from "./chat";

export const quickstartSnippets = {
  Python: chatSnippets.Python,
  JavaScript: chatSnippets.JavaScript,
  Go: `package main

import (
  "context"
  "fmt"

  "github.com/openai/openai-go"
  "github.com/openai/openai-go/option"
)

func main() {
  client := openai.NewClient(
    option.WithAPIKey("dgx_sk_your_key_here"),
    option.WithBaseURL("${baseUrl}/v1"),
  )

  response, _ := client.Chat.Completions.New(context.TODO(), openai.ChatCompletionNewParams{
    Model: "qwen3.6:35b-a3b",
    Messages: []openai.ChatCompletionMessageParamUnion{
      openai.UserMessage("Explain how AI works in a few words"),
    },
  })

  fmt.Println(response.Choices[0].Message.Content)
}`,
  Java: `OpenAIClient client = OpenAIOkHttpClient.builder()
    .apiKey("dgx_sk_your_key_here")
    .baseUrl("${baseUrl}/v1")
    .build();

ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
    .model("qwen3.6:35b-a3b")
    .addUserMessage("Explain how AI works in a few words")
    .build();

ChatCompletion response = client.chat().completions().create(params);
System.out.println(response.choices().get(0).message().content().orElse(""));`,
  "C#": `using OpenAI.Chat;

ChatClient client = new(
    model: "qwen3.6:35b-a3b",
    credential: new ApiKeyCredential("dgx_sk_your_key_here"),
    options: new OpenAIClientOptions
    {
        Endpoint = new Uri("${baseUrl}/v1")
    }
);

ChatCompletion response = client.CompleteChat(
    "Explain how AI works in a few words"
);

Console.WriteLine(response.Content[0].Text);`,
  REST: chatSnippets.REST,
};
