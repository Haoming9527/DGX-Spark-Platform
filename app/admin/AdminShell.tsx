"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Shield, Users, Cpu, ScrollText } from "lucide-react";
import { LogoMark } from "../components/ui/LogoMark";
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
  active: "users" | "models" | "audit";
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
    { id: "audit" as const, label: "Audit", icon: ScrollText, href: "/admin/audit" },
  ];

  return (
    <div className="flex min-h-[100svh] flex-col font-sans text-foreground">
      <header className="sticky top-0 z-50 px-3 py-3 sm:px-4 md:px-8">
        <div className="sticker flex items-center justify-between gap-3 !rounded-full px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ExitBack href="/" />
            <Link href="/admin/users" className="hidden items-center gap-2 sm:inline-flex">
              <LogoMark size={22} className="!rounded-xl !border-[3px]" />
              <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em]">Admin</span>
            </Link>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <nav className="sticker mx-2 mb-2 grid shrink-0 grid-cols-3 gap-1.5 !rounded-2xl px-2 py-2 sm:p-3 md:sticky md:top-[5.5rem] md:mx-3 md:mb-0 md:h-[calc(100vh-6.5rem)] md:w-64 md:flex md:flex-col md:gap-2">
          {nav.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold md:justify-start ${
                active === item.id
                  ? "border border-nvidia-green/20 bg-nvidia-green/10 text-nvidia-green"
                  : "border border-transparent text-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="w-full max-w-6xl flex-1 space-y-5 p-4 sm:p-6 md:p-8">
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
