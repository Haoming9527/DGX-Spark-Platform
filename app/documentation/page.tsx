import Link from "next/link";
import { Key } from "lucide-react";
import { DocsView } from "../components/DocsView";
import { LogoMark } from "../components/ui/LogoMark";
import { ThemeToggle } from "../components/ui/ThemeToggle";

export default function DocumentationPage() {
  return (
    <div className="min-h-screen font-sans text-foreground">
      <header className="sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-3 md:px-8">
          <div className="px-5 md:px-6">
            <div className="flex items-center justify-between gap-2 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
              <div className="flex items-center gap-2 lg:justify-start">
                <LogoMark href="/" size={22} />
                <span className="sticker-sm hidden h-9 items-center px-3 sm:inline-flex">
                  <span className="font-display text-[14px] font-bold tracking-[0.02em] text-foreground">
                    Docs
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                <ThemeToggle />
                <Link
                  href="/apikeys/manage"
                  className="sticker-sm sticker-cta inline-flex h-9 items-center gap-1.5 px-3 text-[13px] font-semibold transition-[filter] hover:brightness-105"
                >
                  <Key className="h-3.5 w-3.5" strokeWidth={2.25} />
                  <span className="hidden min-[400px]:inline">Get API key</span>
                  <span className="min-[400px]:hidden">API</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
        <div className="sticker px-5 py-4">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Developer Documentation
          </h1>
          <p className="mt-1 text-sm text-muted">
            OpenAI-compatible API for models on DGX Spark.
          </p>
        </div>
        <div className="sticker p-5 md:p-6">
          <DocsView />
        </div>
      </main>
    </div>
  );
}
