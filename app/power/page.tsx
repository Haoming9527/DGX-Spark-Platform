"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DgxSparkPowerPanel } from "@/app/components/infra/DgxSparkPowerPanel";
import { ExitBack } from "@/app/components/ui/ExitBack";
import { ThemeToggle } from "@/app/components/ui/ThemeToggle";

export default function PowerPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/login", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data.authenticated) router.replace("/?auth=login&next=/power");
        else if (data.user?.role !== "admin" && data.user?.role !== "operator") router.replace("/");
        else setReady(true);
      })
      .catch(() => { if (!controller.signal.aborted) router.replace("/?auth=login&next=/power"); });
    return () => controller.abort();
  }, [router]);

  if (!ready) {
    return <main className="flex min-h-[100svh] items-center justify-center" aria-label="Checking access" aria-busy="true"><Loader2 className="h-8 w-8 animate-spin text-nvidia-green motion-reduce:animate-none" aria-hidden="true" /></main>;
  }

  return (
    <div className="flex min-h-[100svh] flex-col font-sans text-foreground">
      <header className="sticky top-0 z-50 px-3 py-3 sm:px-4 md:px-8">
        <div className="sticker flex items-center justify-between gap-3 !rounded-full px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-3">
            <ExitBack href="/" />
            <h1 className="font-display text-[15px] font-bold uppercase tracking-[0.04em]">Power</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 pb-8 pt-3 sm:px-4">
        <DgxSparkPowerPanel />
      </main>
    </div>
  );
}
