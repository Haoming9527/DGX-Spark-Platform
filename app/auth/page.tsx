"use client";

import { useRouter } from "next/navigation";
import { AuthModal } from "../components/AuthModal";
import { ExitBack } from "../components/ui/ExitBack";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { LogoMark } from "../components/ui/LogoMark";

export default function AuthPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-[100svh] flex-col font-sans text-foreground">
      <header className="px-3 py-3 sm:px-4 md:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ExitBack href="/" />
            <LogoMark href="/" size={22} />
            <span className="sticker-sm hidden h-9 items-center px-3 sm:inline-flex">
              <span className="font-display text-[14px] font-bold tracking-[0.02em]">Auth</span>
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-6">
        <AuthModal
          isOpen
          embedded
          onClose={() => router.push("/")}
          onSuccess={() => router.push("/apikeys/manage")}
        />
      </main>
    </div>
  );
}
