import type { MetadataRoute } from "next";
import { siteUrl } from "./sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/apikeys/", "/power", "/mcp/"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
