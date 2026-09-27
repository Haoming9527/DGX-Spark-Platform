"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Shield, Users, Cpu, CircuitBoard } from "lucide-react";
import { ExitBack } from "../components/ui/ExitBack";
import { ThemeToggle } from "../components/ui/ThemeToggle";

export function AdminShell({
  title,
  hint,
  active,
  children,
}: {
  title: string;
  hint: string;
  active: "users" | "models" | "infra";
  children: ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/login", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.authenticated || d.user?.role !== "admin") {
          router.replace("/");
          return;
        }
        setReady(true);
      })
      .catch(() => router.replace("/"));
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-nvidia-green" />
      </div>
    );
  }

  const nav = [
    { id: "users" as const, label: "Users", icon: Users, href: "/admin/users" },
    { id: "models" as const, label: "Models", icon: Cpu, href: "/admin/models" },
    { id: "infra" as const, label: "Infrastructure", icon: CircuitBoard, href: "/admin/infra" },
  ];

  return (
    <div className="flex min-h-[100svh] flex-col font-sans text-foreground">
      <header className="sticky top-0 z-50 px-3 py-3 sm:px-4 md:px-8">
        <div className="sticker flex items-center justify-between gap-3 !rounded-full px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-3">
            <ExitBack href="/" />
            <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em]">Admin</span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-2 px-3 sm:px-4 md:flex-row md:items-start md:gap-3 md:px-8">
        <nav aria-label="Admin" className="flex w-full shrink-0 flex-wrap gap-2 md:sticky md:top-[5.5rem] md:w-44 md:flex-col">
          {nav.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active === item.id ? "page" : undefined}
              className={`sticker flex h-11 flex-1 items-center justify-center gap-2 px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground sm:px-3 sm:text-sm md:flex-none md:justify-start ${
                active === item.id ? "text-nvidia-green" : "text-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="w-full max-w-6xl min-w-0 flex-1 space-y-5 pb-4 sm:pb-6 md:pb-8">
          <div className="sticker mb-2 px-4 py-3 sm:px-5 sm:py-4">
            <h1 className="font-display flex items-center gap-2 text-lg font-bold uppercase tracking-tight sm:text-xl">
              <Shield className="h-5 w-5 text-nvidia-green" />
              {title}
            </h1>
            <p className="mt-1 text-xs leading-5 text-muted">{hint}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
