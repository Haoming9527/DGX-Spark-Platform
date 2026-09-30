import type { SearchSource } from "./searchEvidence";

function sourceUrl(source: SearchSource): URL | undefined {
  try {
    const url = new URL(source.url);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url;
  } catch {}
}

export function sourceDomain(source: SearchSource): string {
  return sourceUrl(source)?.hostname.replace(/^www\./, "") || "Source";
}

export function sourceOutboundHref(source: SearchSource, appHostname = ""): string | undefined {
  const url = sourceUrl(source);
  if (!url) return;
  if (/^[a-z0-9.-]+$|^\[[a-f0-9:]+\]$/i.test(appHostname)) {
    url.searchParams.set("utm_source", appHostname.toLowerCase().replace(/^www\./, ""));
  }
  return url.href;
}

export function sourceFaviconHref(source: SearchSource): string | undefined {
  const hostname = sourceUrl(source)?.hostname;
  if (!hostname || !hostname.includes(".") || !/^[a-z0-9.-]+$/i.test(hostname) || /^\d+(?:\.\d+){3}$/.test(hostname) || /\.(?:local|localhost|internal)$/i.test(hostname)) return;
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`;
}
