"use client";

import { Code as CodeIcon, Wrench } from "lucide-react";
import { structuredResponse, toolCallResponse } from "../snippets/responses";
import { structuredSnippets } from "../snippets/structured";
import { toolsSnippets } from "../snippets/tools";
import { Callout, Code, CodeTabs, DocSection, EndpointUrls, ParamTable, Prose, ResponseExample, Steps, SubHeading, WorksWith } from "../ui";

export function Tools() {
  return (
    <DocSection id="tools" icon={<Wrench className="h-5 w-5 text-nvidia-green" />} title="Tools & MCP"
      summary="Describe functions your app can run; the model decides when to call one and with which arguments, and your app runs it and returns the result.">
      <Prose><b className="text-foreground">When to use it:</b> fetching live data, calling your APIs, database lookups, and connecting MCP servers.</Prose>
      <SubHeading>Before you begin</SubHeading>
      <WorksWith capabilities={["tools"]} />
      <EndpointUrls path="/v1/chat/completions" />
      <SubHeading>How the loop works</SubHeading>
      <Steps steps={[
        { title: "Send tools with your messages", body: <>Pass OpenAI function definitions in <Code>tools</Code>.</> },
        { title: "Run the call", body: <>If the reply has <Code>tool_calls</Code> (<Code>finish_reason: &quot;tool_calls&quot;</Code>), run each function in your code.</> },
        { title: "Return the result", body: <>Append the assistant message and a <Code>role: &quot;tool&quot;</Code> message with the matching <Code>tool_call_id</Code>, then call the API again for the final answer.</> },
      ]} />
      <SubHeading>Request</SubHeading>
      <CodeTabs snippets={toolsSnippets} />
      <ResponseExample title="Example response with a tool call" json={toolCallResponse} />
      <Callout tone="warning">
        Don&apos;t send <Code>tool_choice</Code>: local models ignore it, so the model always decides whether to call a tool.
      </Callout>
      <Callout>
        <b>MCP:</b> keep the MCP client in your app. Map the server&apos;s <Code>tools/list</Code> to <Code>tools</Code>, and run{" "}
        <Code>tools/call</Code> when the model asks. Don&apos;t send MCP protocol messages to the API. The gateway has no hosted web
        search, code interpreter or MCP bridge.
      </Callout>
    </DocSection>
  );
}

export function Structured() {
  return (
    <DocSection id="structured" icon={<CodeIcon className="h-5 w-5 text-nvidia-green" />} title="Structured output"
      summary="Get JSON your code can parse, either any valid JSON object or JSON that matches a schema you provide.">
      <Prose><b className="text-foreground">When to use it:</b> extracting fields from text, generating data for your UI, and any reply your program reads.</Prose>
      <SubHeading>Before you begin</SubHeading>
      <WorksWith capabilities={["completion"]} />
      <EndpointUrls path="/v1/chat/completions" />
      <SubHeading>Request</SubHeading>
      <CodeTabs snippets={structuredSnippets} />
      <ResponseExample json={structuredResponse} />
      <SubHeading>Options</SubHeading>
      <ParamTable rows={[
        { name: "response_format.type", type: '"json_object" | "json_schema"', required: true, description: <><Code>json_object</Code> returns any valid JSON; <Code>json_schema</Code> returns JSON shaped by your schema.</> },
        { name: "response_format.json_schema", type: "object", description: <>With <Code>json_schema</Code>: <Code>name</Code> and <Code>schema</Code> (a JSON Schema object).</> },
      ]} />
      <Callout>Also ask for JSON in your prompt. The content arrives as a string in <Code>choices[0].message.content</Code>; parse it with <Code>JSON.parse</Code> or <Code>json.loads</Code>.</Callout>
    </DocSection>
  );
}
