import type { ChatUIMessage, McpToolOutput, SearchToolOutput } from "../../app/types/chat";
import { harnessBudget } from "./chatHarness";
import { ContextBudgetError, compactToolContent, estimateContextUnits } from "./harnessContext";

type Part = ChatUIMessage["parts"][number];
type Budget = ReturnType<typeof harnessBudget>;

const IMAGE_UNITS = 4096;
const MAX_IMAGES = 4;

function partUnits(part: Part): number {
  if (part.type === "file") return IMAGE_UNITS;
  return estimateContextUnits(JSON.stringify(part));
}

function messageUnits(message: ChatUIMessage) {
  return 64 + message.parts.reduce((sum, part) => sum + partUnits(part), 0);
}

function isToolPart(part: Part): part is Extract<Part, { toolCallId: string }> {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

// Earlier turns keep their tool calls for context, but with bounded outputs and without page excerpts.
function compactEarlierPart(part: Part, budget: Budget): Part {
  if (!isToolPart(part) || part.state !== "output-available") return part;
  if (part.type === "tool-search_web") {
    const output = part.output as SearchToolOutput;
    const sources = (output.sources ?? []).map(source => {
      const rest = { ...source };
      delete rest.content;
      return rest;
    });
    return { ...part, output: { ...output, sources } } as Part;
  }
  const output = part.output as Partial<McpToolOutput> | undefined;
  if (typeof output?.content !== "string") return part;
  return { ...part, output: { ...output, content: compactToolContent(output.content, budget.maxToolResultUnits) } } as Part;
}

// Prepares the client-sent history for the model: reasoning and data parts are dropped from earlier turns,
// images are kept only on the latest user message, old tool output is bounded, and the oldest turns are
// removed until the conversation fits the input budget. The latest turn (including any in-progress tool
// approval) is kept intact.
export function trimConversation(messages: ChatUIMessage[], budget: Budget, reservedUnits = 0): ChatUIMessage[] {
  const latestUser = messages.findLastIndex(message => message.role === "user");
  if (latestUser < 0) throw new ContextBudgetError("A user message is required.");
  const images = messages[latestUser].parts.filter(part => part.type === "file").length;
  if (images > MAX_IMAGES) throw new ContextBudgetError("Use at most four images in one message.");

  const prepared = messages.map((message, index) => {
    if (index >= latestUser) return message;
    return {
      ...message,
      parts: message.parts
        .filter(part => part.type !== "reasoning" && part.type !== "file" && !part.type.startsWith("data-"))
        .map(part => compactEarlierPart(part, budget)),
    };
  });

  const available = budget.maxInputUnits - reservedUnits;
  const current = prepared.slice(latestUser);
  const currentUnits = current.reduce((sum, message) => sum + messageUnits(message), 0);
  if (currentUnits > available) {
    throw new ContextBudgetError("This message, its images, and required instructions exceed the context limit. Shorten the message or remove attachments.");
  }

  const turns: ChatUIMessage[][] = [];
  for (const message of prepared.slice(0, latestUser)) {
    if (message.role === "user" || !turns.length) turns.push([message]);
    else turns[turns.length - 1].push(message);
  }
  const turnUnits = (turn: ChatUIMessage[]) => turn.reduce((sum, message) => sum + messageUnits(message), 0);
  let total = currentUnits + turns.reduce((sum, turn) => sum + turnUnits(turn), 0);
  while (turns.length && total > available) total -= turnUnits(turns.shift()!);
  return [...turns.flat(), ...current];
}
