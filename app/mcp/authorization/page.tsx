import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { LogoMark } from "@/app/components/ui/LogoMark";
import { McpIcon } from "@/app/components/ui/McpIcon";
import { ThemeToggle } from "@/app/components/ui/ThemeToggle";
import { ExitButton } from "./ExitButton";

export const metadata: Metadata = {
  title: "MCP authorization | DGX Spark Platform",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AuthorizationPage({ searchParams }: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const success = (await searchParams).status === "complete";
  const StatusIcon = success ? Check : X;

  return (
    <div className="flex min-h-[100svh] flex-col text-foreground">
      <header className="px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <LogoMark href="/" size={26} />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-20 pt-8 sm:pb-28">
        <section aria-labelledby="authorization-title" className="sticker w-full max-w-lg px-6 py-9 text-center sm:px-10 sm:py-12">
          <div className="relative mx-auto mb-7 w-fit">
            <McpIcon className="h-14 w-14" aria-hidden="true" />
            <span className={`absolute -bottom-1 -right-3 flex h-7 w-7 items-center justify-center rounded-full border-4 border-panel ${success ? "bg-nvidia-green text-black" : "bg-alert text-white"}`}>
              <StatusIcon className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
            </span>
          </div>
          <h1 id="authorization-title" className="font-display text-3xl font-bold uppercase leading-tight sm:text-4xl">
            {success ? "MCP authorization complete" : "Authorization not completed"}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            {success
              ? "Return to your chat and connect the server again to load its tools. You can close this tab."
              : "Return to your chat and try connecting again. Keep your login active in the same browser."}
          </p>
          <div className="mt-8 flex justify-center">
            <ExitButton />
          </div>
        </section>
      </main>
    </div>
  );
}
