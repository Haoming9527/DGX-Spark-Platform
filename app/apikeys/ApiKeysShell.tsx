"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, BookOpen, Key } from "lucide-react";
import { ExitBack } from "../components/ui/ExitBack";
import { ThemeToggle } from "../components/ui/ThemeToggle";

export function ApiKeysShell({
  label,
  title,
  hint,
  active,
  username,
  children,
}: {
  label: string;
  title: string;
  hint: string;
  active: "keys" | "usage";
  username: string;
  children: ReactNode;
}) {
  const nav = [
    { id: "keys" as const, label: "Keys", icon: Key, href: "/apikeys/manage" },
    { id: "usage" as const, label: "Usage", icon: BarChart3, href: "/apikeys/usage" },
  ];

  return (
    <div className="flex min-h-[100svh] flex-col font-sans text-foreground">
      <header className="sticky top-0 z-50 px-3 py-3 sm:px-4 md:px-8">
        <div className="sticker flex items-center justify-between gap-3 !rounded-full px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-3">
            <ExitBack href="/" />
            <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em]">{label}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <ThemeToggle />
            <div className="hidden min-w-0 text-right text-xs text-muted sm:block">
              Signed in as <span className="font-semibold text-foreground">{username}</span>
            </div>
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-2 px-3 sm:px-4 md:flex-row md:items-start md:gap-3 md:px-8">
        <nav className="flex w-full shrink-0 gap-2 md:sticky md:top-[5.5rem] md:w-44 md:flex-col">
          {nav.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`sticker flex h-11 flex-1 items-center justify-center gap-2 px-3 text-sm font-semibold md:flex-none md:justify-start ${
                active === item.id ? "text-nvidia-green" : "text-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          <Link
            href="/documentation"
            target="_blank"
            rel="noopener noreferrer"
            className="sticker flex h-11 flex-1 items-center justify-center gap-2 px-3 text-sm font-semibold text-muted hover:text-foreground md:flex-none md:justify-start"
          >
            <BookOpen className="h-4 w-4" />
            Docs
          </Link>
        </nav>
        <main className="w-full max-w-6xl min-w-0 flex-1 space-y-5 pb-4 sm:pb-6 md:pb-8">
          <div className="sticker mb-2 px-4 py-3 sm:px-5 sm:py-4">
            <h1 className="font-display text-lg font-bold uppercase tracking-tight sm:text-xl">{title}</h1>
            <p className="mt-1 text-xs leading-5 text-muted">{hint}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
