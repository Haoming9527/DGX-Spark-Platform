export type ContextMessage = {
  role: string;
  content: string;
  thinking?: string;
  images?: string[];
  tool_calls?: { id?: string; function: { name: string; arguments: unknown } }[];
  tool_name?: string;
  tool_call_id?: string;
};

export class ContextBudgetError extends Error {
  readonly code = "CONTEXT_BUDGET";
  constructor(message: string) { super(message); this.name = "ContextBudgetError"; }
}

const encoder = new TextEncoder();
export function estimateContextUnits(value: string): number {
  return encoder.encode(value).byteLength;
}

function prefix(value: string, limit: number): string {
  let units = 0;
  let length = 0;
  for (const character of value) {
    const size = estimateContextUnits(character);
    if (units + size > limit) break;
    units += size;
    length += character.length;
  }
  return value.slice(0, length);
}

function preview(value: unknown, stringLimit: number, itemLimit: number, depth = 0, key = ""): unknown {
  if (typeof value === "string") {
    if (/^(?:id|sourceId|url|pageUrl|publishedAt|retrievedAt)$/i.test(key) || estimateContextUnits(value) <= stringLimit) return value;
    return prefix(value, Math.max(0, stringLimit - 20)) + " [truncated]";
  }
  if (!value || typeof value !== "object") return value;
  if (depth >= 8) return "[Nested content omitted]";
  if (Array.isArray(value)) {
    const items = value.slice(0, itemLimit).map(item => preview(item, stringLimit, itemLimit, depth + 1));
    if (value.length > itemLimit) items.push(`[${value.length - itemLimit} items omitted]`);
    return items;
  }
  const entries = Object.entries(value);
  const result = Object.fromEntries(entries.slice(0, 32).map(([name, item]) => [name, preview(item, stringLimit, itemLimit, depth + 1, name)]));
  if (entries.length > 32) result._omittedFields = entries.length - 32;
  return result;
}

export function compactToolContent(value: string, limit: number): string {
  if (estimateContextUnits(value) <= limit) return value;
  try {
    let data: unknown = JSON.parse(value);
    if (data && typeof data === "object" && "context_truncated" in data && "data" in data) data = data.data;
    for (let items = 16; items >= 1; items = Math.floor(items / 2)) {
      for (let size = Math.min(2048, limit); size >= 32; size = Math.floor(size / 2)) {
        const result = JSON.stringify({ context_truncated: true, data: preview(data, size, items) });
        if (estimateContextUnits(result) <= limit) return result;
      }
    }
    return '{"context_truncated":true,"data":"Result omitted"}';
  } catch {
    const notice = "\n[Tool output truncated to fit context.]";
    return prefix(value, limit - estimateContextUnits(notice)) + notice;
  }
}

function messageUnits(message: ContextMessage): number {
  let units = 64 + estimateContextUnits(message.content) + estimateContextUnits(message.thinking ?? "") +
    estimateContextUnits(message.tool_name ?? "") + estimateContextUnits(message.tool_call_id ?? "") + (message.images?.length ?? 0) * 4096;
  if (message.tool_calls?.length) {
    try { units += estimateContextUnits(JSON.stringify(message.tool_calls)); }
    catch { throw new ContextBudgetError("Tool arguments could not be encoded. Retry this message."); }
  }
  return units;
}

function toolBatches(messages: ContextMessage[]): { start: number; end: number }[] | null {
  const batches: { start: number; end: number }[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === "tool") return null;
    if (!message.tool_calls?.length) continue;
    if (message.role !== "assistant") return null;
    const pending = [...message.tool_calls];
    const start = index;
    while (pending.length) {
      const result = messages[++index];
      if (!result || result.role !== "tool" || result.tool_calls?.length) return null;
      const match = pending.findIndex(call => result.tool_call_id
        ? call.id === result.tool_call_id && (!result.tool_name || call.function.name === result.tool_name)
        : result.tool_name ? call.function.name === result.tool_name : pending.length === 1);
      if (match < 0) return null;
      pending.splice(match, 1);
    }
    batches.push({ start, end: index + 1 });
  }
  return batches;
}

export function compactMessages<T extends ContextMessage>(
  messages: T[],
  budget: { maxInputUnits: number; maxToolResultUnits: number; maxThinkingUnits: number },
  reservedUnits = 0,
): { messages: T[]; omitted: boolean } {
  if (![budget.maxInputUnits, budget.maxToolResultUnits, budget.maxThinkingUnits, reservedUnits].every(value => Number.isSafeInteger(value) && value >= 0) || budget.maxToolResultUnits < 64) {
    throw new ContextBudgetError("Invalid conversation context budget.");
  }
  let latestUser = -1;
  messages.forEach((message, index) => { if (message.role === "user") latestUser = index; });
  if (latestUser < 0) throw new ContextBudgetError("A user message is required.");
  if ((messages[latestUser].images?.length ?? 0) > 4) throw new ContextBudgetError("Use at most four images in one message.");
  const available = budget.maxInputUnits - reservedUnits;
  let omitted = false;
  type Entry = { index: number; message: T };
  const system: Entry[] = [];
  const turns: Entry[][] = [];
  let turn: Entry[] = [];
  for (const [index, original] of messages.entries()) {
    const message = { ...original };
    if (message.images?.length && index !== latestUser) { delete message.images; omitted = true; }
    if (message.thinking) {
      if (index < latestUser || !message.tool_calls?.length || !budget.maxThinkingUnits) {
        delete message.thinking;
        omitted = true;
      } else if (estimateContextUnits(message.thinking) > budget.maxThinkingUnits) {
        message.thinking = prefix(message.thinking, budget.maxThinkingUnits);
        omitted = true;
      }
    }
    if (message.role === "tool") {
      message.content = compactToolContent(message.content, budget.maxToolResultUnits);
      if (message.content !== original.content) omitted = true;
    }
    const entry = { index, message };
    if (message.role === "system" || message.role === "developer") system.push(entry);
    else {
      if (message.role === "user" && turn.length) { turns.push(turn); turn = []; }
      turn.push(entry);
    }
  }
  if (turn.length) turns.push(turn);
  let current = turns.pop() ?? [];
  if (toolBatches(current.map(entry => entry.message)) === null) {
    throw new ContextBudgetError("The current tool conversation is incomplete. Retry this message.");
  }
  const systemCost = system.reduce((sum, entry) => sum + messageUnits(entry.message), 0);
  const newest = current.find(entry => entry.index === latestUser)!;
  if (systemCost + messageUnits(newest.message) > available) {
    throw new ContextBudgetError("This message, its images, and required instructions exceed the context limit. Shorten the message or remove attachments.");
  }
  const history = turns.filter(entries => {
    const valid = toolBatches(entries.map(entry => entry.message)) !== null;
    if (!valid) omitted = true;
    return valid;
  });
  const units = (entries: Entry[]) => entries.reduce((sum, entry) => sum + messageUnits(entry.message), 0);
  const total = () => systemCost + units(current) + history.reduce((sum, entries) => sum + units(entries), 0);
  while (history.length && total() > available) { history.shift(); omitted = true; }
  while (total() > available) {
    const batches = toolBatches(current.map(entry => entry.message))!;
    if (batches.length < 2) break;
    const batch = batches[0];
    const entry = current[batch.start];
    const message = { ...entry.message };
    const names = message.tool_calls!.map(call => call.function.name + (call.id ? ` (${call.id})` : "")).join(", ");
    const declined = current.slice(batch.start + 1, batch.end).some(item => /\bdeclined\b/i.test(item.message.content));
    message.content = `Earlier tool batch handled: ${names}. Arguments and results omitted to fit context. ${declined ? "A call was declined; do not retry or bypass that decision." : "Calls may already have executed. Do not repeat side effects; ask before retrying an uncertain action."}`;
    delete message.tool_calls;
    delete message.thinking;
    current = [...current.slice(0, batch.start), { index: entry.index, message }, ...current.slice(batch.end)];
    omitted = true;
  }
  for (let limit = Math.floor(budget.maxToolResultUnits / 2); total() > available && limit >= 64; limit = Math.floor(limit / 2)) {
    current = current.map(entry => entry.message.role !== "tool" ? entry : {
      ...entry, message: { ...entry.message, content: compactToolContent(messages[entry.index].content, limit) },
    });
    omitted = true;
  }
  if (total() > available) {
    throw new ContextBudgetError("The current request and latest tool call exceed the context limit. Shorten the request or use fewer tools; no tool arguments were truncated.");
  }
  return { messages: [...system, ...history.flat(), ...current].sort((a, b) => a.index - b.index).map(entry => entry.message), omitted };
}
