"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart3, BookOpen, ExternalLink, Key, Loader2 } from "lucide-react";

import { UsageView } from "../../components/UsageView";
import { LogoMark } from "../../components/ui/LogoMark";
import { ExitBack } from "../../components/ui/ExitBack";
import { ThemeToggle } from "../../components/ui/ThemeToggle";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  total_tokens: number;
  total_requests: number;
}

interface User {
  id: string;
  username: string;
  email: string;
}

const activeSection = "usage";

export default function ApiKeyUsagePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/login", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) setUser(d.user);
        else router.replace("/auth");
      })
      .catch(() => router.replace("/auth"))
      .finally(() => setSessionLoading(false));
  }, [router]);

  const fetchKeys = useCallback(async () => {
    setKeysLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/apikeys", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load API keys.");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchKeys();
  }, [user, fetchKeys]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-nvidia-green" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-[100svh] flex-col font-sans text-foreground">
      <header className="sticky top-0 z-50 px-3 py-3 sm:px-4 md:px-8">
        <div className="sticker flex items-center justify-between gap-3 !rounded-full px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ExitBack href="/" />
            <Link href="/" className="hidden items-center gap-2 sm:inline-flex">
              <LogoMark size={22} className="!rounded-xl !border-[3px]" />
              <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em]">
                Usage
              </span>
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <ThemeToggle />
            <div className="min-w-0 text-right text-xs text-muted">
              Signed in as <span className="font-semibold text-foreground">{user.username}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav className="sticker mx-2 mb-2 grid shrink-0 grid-cols-4 gap-1.5 !rounded-2xl px-2 py-2 sm:p-3 md:sticky md:top-[5.5rem] md:mx-3 md:mb-0 md:h-[calc(100vh-6.5rem)] md:w-64 md:flex md:flex-col md:gap-2 md:overflow-y-auto custom-scrollbar">
          {[
            { id: "keys", label: "API Keys", icon: Key, href: "/apikeys/manage" },
            { id: "usage", label: "Token Usage", icon: BarChart3, href: "/apikeys/usage" },
          ].map((item) => (
            <Link
              href={item.href}
              key={item.id}
              className={`flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-all sm:text-sm md:justify-start md:gap-3 md:px-4 ${
                activeSection === item.id
                  ? "border border-nvidia-green/20 bg-nvidia-green/10 text-nvidia-green"
                  : "border border-transparent text-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.id === "keys" ? "Keys" : item.id === "usage" ? "Usage" : item.label}</span>
            </Link>
          ))}
          <Link
            href="/documentation"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 text-xs font-semibold text-muted transition-all hover:text-foreground sm:text-sm md:justify-start md:gap-3 md:px-4"
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="truncate md:hidden">Docs</span>
            <span className="hidden truncate md:inline">Documentation</span>
            <ExternalLink className="ml-auto hidden h-3.5 w-3.5 opacity-60 md:block" />
          </Link>
        </nav>

        <main className="w-full max-w-6xl flex-1 space-y-5 p-4 sm:space-y-6 sm:p-6 md:p-8">
          <div className="sticker mb-2 px-4 py-3 sm:px-5 sm:py-4">
            <h1 className="font-display text-lg font-bold uppercase tracking-tight text-foreground sm:text-xl">
              Usage & Performance
            </h1>
            <p className="mt-1 text-xs leading-5 text-muted">
              Track usage and token rates consumed per key.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-alert/30 bg-alert/10 p-3 text-sm text-alert">
              {error}
            </div>
          )}

          <UsageView keys={keys} keysLoading={keysLoading} />
        </main>
      </div>
    </div>
  );
}
