import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["duck-duck-scrape", "cheerio"],
  outputFileTracingIncludes: {
    "/api/web-search": ["./node_modules/duck-duck-scrape/lib/search/search-html.cjs"],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
