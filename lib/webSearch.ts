import "server-only";
import { load, type CheerioAPI } from "cheerio";
import { Agent } from "undici";
import { ApiRequestError } from "./apiRequest";
import { resolvePublic } from "./publicNetwork";
import { normalizeSourceUrl, sourceId, type SearchSource } from "./searchEvidence";

class PageReadError extends Error {}

function publishedDate($: CheerioAPI): string | undefined {
  const candidates = $("meta[property='article:published_time'],meta[name='pubdate'],meta[itemprop='datePublished'],meta[name='DC.date.issued'],meta[name='dcterms.issued'],time[itemprop='datePublished']")
    .map((_, element) => $(element).attr("content") ?? $(element).attr("datetime") ?? "").get();
  $("script[type='application/ld+json']").slice(0, 8).each((_, element) => {
    const text = $(element).text();
    if (text.length > 65536) return;
    try {
      const pending: unknown[] = [JSON.parse(text)];
      for (let count = 0; pending.length && count < 100; count++) {
        const value = pending.pop();
        if (!value || typeof value !== "object") continue;
        if (Array.isArray(value)) pending.push(...value.slice(0, 100));
        else {
          const record = value as Record<string, unknown>;
          if (typeof record.datePublished === "string") candidates.push(record.datePublished);
          pending.push(...Object.values(record).filter(item => item && typeof item === "object").slice(0, 100));
        }
      }
    } catch {}
  });
  for (const value of candidates) {
    if (!/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(value) || !Number.isFinite(Date.parse(value))) continue;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(value).toISOString();
  }
}

function relevantExcerpts(text: string, query: string): string {
  const chunks: string[] = [];
  for (const paragraph of text.split(/\n+/).map(value => value.trim()).filter(Boolean)) {
    for (let offset = 0; offset < paragraph.length; offset += 900) chunks.push(paragraph.slice(offset, offset + 1000));
  }
  if (text.length <= 6000) return text;
  const stopWords = new Set(["the", "and", "for", "with", "what", "when", "where", "how", "this", "that", "are", "can", "you", "about", "please", "tell"]);
  const terms = [...new Set([...new Intl.Segmenter(undefined, { granularity: "word" }).segment(query.toLowerCase())]
    .filter(item => item.isWordLike && item.segment.length > 1 && !stopWords.has(item.segment))
    .map(item => item.segment))].slice(0, 40);
  const ranked = chunks.map((chunk, index) => {
    const lower = chunk.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
    return { index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Set<number>();
  let remaining = 5700;
  const add = (index: number) => {
    if (index < 0 || index >= chunks.length || selected.has(index) || chunks[index].length > remaining) return;
    selected.add(index);
    remaining -= chunks[index].length + 12;
  };
  add(0);
  for (const { index, score } of ranked) if (score) add(index);
  for (const index of [...selected]) { add(index - 1); add(index + 1); }
  for (let index = 0; index < chunks.length && remaining > 100; index++) add(index);
  return [...selected].sort((a, b) => a - b).map((index, position, indices) =>
    `${position && index > indices[position - 1] + 1 ? "[…]\n\n" : ""}${chunks[index]}`).join("\n\n").slice(0, 6000);
}

async function fetchPage(value: string, signal: AbortSignal, query: string) {
  let url = new URL(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal.throwIfAborted();
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || url.href.length > 2048) {
      throw new ApiRequestError(400, "Only public HTTPS pages on port 443 can be read.");
    }
    url.hash = "";
    const addresses = await resolvePublic(url, signal);
    const expectedHost = url.hostname.replace(/^\[|\]$/g, "");
    const agent = new Agent({ connect: {
      timeout: 4000,
      lookup: (hostname, options, callback) => {
        if (hostname.replace(/^\[|\]$/g, "") !== expectedHost) {
          callback(new Error("Host changed during connection"), "", 4);
        } else if (options.all) {
          callback(null, addresses);
        } else {
          const address = addresses.find(item => !options.family || item.family === options.family) ?? addresses[0];
          callback(null, address.address, address.family);
        }
      },
    } });
    try {
      const response = await fetch(url, {
        signal, redirect: "manual", credentials: "omit", cache: "no-store",
        headers: { Accept: "text/html", "User-Agent": "LocalAI-WebSearch/1.0" },
        dispatcher: agent,
      } as RequestInit & { dispatcher: Agent });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) throw new PageReadError("The page returned an invalid redirect.");
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("text/html") || Number(response.headers.get("content-length")) > 1572864) {
        await response.body?.cancel();
        throw new PageReadError("The page is unavailable, too large, or is not an HTML page.");
      }
      if (!response.body) throw new PageReadError("The page returned no content.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1572864) throw new PageReadError("The page is too large to read.");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      signal.throwIfAborted();
      const $ = load(Buffer.concat(chunks, size).toString("utf8"));
      const publishedAt = publishedDate($);
      const title = ($("meta[property='og:title']").attr("content") || $("h1").first().text() || $("title").text())
        .replace(/\s+/g, " ").trim().slice(0, 300);
      const snippet = ($("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "")
        .replace(/\s+/g, " ").trim().slice(0, 1200);
      $("script,style,noscript,nav,footer,header,aside,form,button,iframe,svg,[hidden],[aria-hidden=true]").remove();
      $("br,p,div,li,tr,h1,h2,h3,h4,section,article").append("\n");
      $("td,th,span").append(" ");
      const main = $("main,article,[role=main]").first().text();
      const text = (main.trim().length > 200 ? main : $("body").text())
        .split(/\n+/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n");
      if (text.length < 80 || /just a moment|verify (?:that )?you are human|enable javascript and cookies/i.test(text.slice(0, 500))) {
        throw new PageReadError("The page has no readable article text or requires JavaScript or browser verification.");
      }
      return { title: title || url.hostname, snippet, content: relevantExcerpts(text, query), pageUrl: url.href, retrievedAt: new Date().toISOString(), publishedAt };
    } finally {
      await agent.destroy();
    }
  }
  throw new PageReadError("The page redirected too many times.");
}

export async function readWebPage(value: string, requestSignal: AbortSignal, query = ""): Promise<SearchSource> {
  const url = normalizeSourceUrl(value);
  if (!url) throw new ApiRequestError(400, "Enter a valid public HTTPS page URL.");
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(10000)]);
  const source: SearchSource = { id: sourceId(url), title: new URL(url).hostname, url, snippet: "" };
  try {
    return { ...source, ...await fetchPage(url, signal, query), readStatus: "read" };
  } catch (error) {
    requestSignal.throwIfAborted();
    if (error instanceof ApiRequestError && error.status === 400) throw error;
    return { ...source, readStatus: "unavailable", readError: signal.aborted ? "Page reading timed out."
      : error instanceof PageReadError ? error.message : "The page could not be retrieved. Try another source." };
  }
}

export async function enrichSearchSources(sources: SearchSource[], requestSignal: AbortSignal, query = ""): Promise<SearchSource[]> {
  const enriched = await Promise.all(sources.map(async (source, index) => {
    if (index >= 4) return { ...source, readStatus: "not_read" as const };
    try {
      const page = await readWebPage(source.url, requestSignal, query);
      return { ...source, ...page, title: page.readStatus === "read" ? page.title : source.title, snippet: source.snippet || page.snippet };
    } catch (error) {
      requestSignal.throwIfAborted();
      return { ...source, readStatus: "unavailable" as const, readError: error instanceof ApiRequestError ? error.message : "The page could not be retrieved." };
    }
  }));
  requestSignal.throwIfAborted();
  return enriched;
}
