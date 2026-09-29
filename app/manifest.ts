import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DGX Spark Platform",
    short_name: "DGX Spark",
    description: "Your AI. Your hardware. Shared with your people.",
    lang: "en",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f3f1",
    theme_color: "#f3f3f1",
    icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
