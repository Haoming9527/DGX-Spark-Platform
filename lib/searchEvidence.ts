export type SearchSource = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  content?: string;
  pageUrl?: string;
  retrievedAt?: string;
  publishedAt?: string;
  readStatus?: "read" | "unavailable" | "not_read";
  readError?: string;
};

export function normalizeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 2048) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

export function sourceId(value: string): string {
  const url = normalizeSourceUrl(value) ?? value;
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < url.length; index++) {
    first = Math.imul(first ^ url.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ url.charCodeAt(index);
  }
  return `web_${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}
