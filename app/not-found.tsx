import { ExitBack } from "./components/ui/ExitBack";
import { LogoMark } from "./components/ui/LogoMark";
import { ThemeToggle } from "./components/ui/ThemeToggle";

export default function NotFound() {
  return (
    <div className="flex min-h-[100svh] flex-col font-sans text-foreground">
      <header className="px-3 py-3 sm:px-4 md:px-8">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LogoMark href="/" size={22} />
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-20 pt-12">
        <div className="w-full max-w-lg text-center">
          <div className="sticker inline-flex -rotate-3 px-10 py-5 sm:px-14 sm:py-6">
            <span className="font-display text-8xl font-bold leading-none tracking-tight">404</span>
          </div>
          <h1 className="mt-10 text-3xl font-semibold tracking-tight sm:text-4xl">Nothing here. Yet.</h1>
          <p className="mx-auto mt-4 max-w-xs text-base leading-relaxed text-muted">
            This page may have moved, or the link is incorrect. Your next conversation is back home.
          </p>
          <div className="mt-8 flex justify-center">
            <ExitBack href="/" />
          </div>
        </div>
      </main>
    </div>
  );
}
