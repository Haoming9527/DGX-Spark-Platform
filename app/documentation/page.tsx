import Image from "next/image";
import Link from "next/link";
import { Key } from "lucide-react";
import { DocsView } from "../components/DocsView";

export default function DocumentationPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <Image src="/logo.svg" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="text-[15px] font-semibold tracking-tight">
              DGX Spark <span className="font-medium text-foreground/45">Docs</span>
            </span>
          </Link>
        </div>

        <Link
          href="/apikeys/manage"
          className="flex items-center gap-2 px-3 py-2 bg-panel hover:bg-panel-hover border border-border hover:border-nvidia-green/50 rounded-lg text-sm font-semibold transition-colors"
        >
          <Key className="w-4 h-4 text-nvidia-green" />
          Get API key
        </Link>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-8 space-y-6">
        <div className="border-b border-border/50 pb-4">
          <h1 className="text-2xl font-bold tracking-tight">Developer Documentation</h1>
          <p className="text-sm text-foreground/50 mt-1">
            OpenAI-compatible API for models on DGX Spark.
          </p>
        </div>
        <DocsView />
      </main>
    </div>
  );
}
