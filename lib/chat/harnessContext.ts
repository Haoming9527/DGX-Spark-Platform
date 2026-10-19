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
