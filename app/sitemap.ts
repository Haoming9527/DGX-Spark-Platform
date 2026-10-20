import type { MetadataRoute } from "next";

export function siteUrl() {
  const explicit = process.env.SITE_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return (explicit || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/+$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/documentation`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/status`, changeFrequency: "hourly", priority: 0.4 },
  ];
}
