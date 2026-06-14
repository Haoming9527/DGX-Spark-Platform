"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BarChart3, BookOpen, ExternalLink, Key, Loader2 } from "lucide-react";

import { UsageView } from "../../components/UsageView";

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-nvidia-green animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-[100svh] bg-background text-foreground font-sans flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md px-3 sm:px-4 md:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 shrink-0 rounded-lg bg-nvidia-green/10 border border-nvidia-green/20 flex items-center justify-center overflow-hidden p-0.5">
            <Image src="/logo.svg" alt="Logo" width={28} height={28} className="object-contain" />
          </div>
          <span className="font-bold text-sm truncate">DGX Spark<span className="text-nvidia-green"> Platform</span></span>
        </Link>
        <div className="min-w-0 text-right text-xs text-foreground/40">
          Signed in as <span className="text-foreground/70 font-semibold">{user.username}</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row">
        <nav className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-panel/30 px-2 py-2 sm:p-4 shrink-0 grid grid-cols-4 md:flex md:flex-col gap-1.5 md:gap-2 md:overflow-y-auto custom-scrollbar md:sticky md:top-[61px] md:h-[calc(100vh-61px)]">
          <Link
            href="/"
            className="flex h-9 min-w-0 items-center justify-center md:justify-start gap-1.5 md:gap-3 px-2 md:px-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer text-foreground/50 hover:text-foreground/80 border border-transparent"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="truncate md:hidden">Back</span>
            <span className="hidden md:inline truncate">Back to Chat</span>
          </Link>
          {[
            { id: "keys", label: "API Keys", icon: Key, href: "/apikeys/manage" },
            { id: "usage", label: "Token Usage", icon: BarChart3, href: "/apikeys/usage" },
          ].map((item) => (
            <Link
              href={item.href}
              key={item.id}
              className={`flex h-9 min-w-0 items-center justify-center md:justify-start gap-1.5 md:gap-3 px-2 md:px-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeSection === item.id
                  ? "bg-nvidia-green/10 text-nvidia-green border border-nvidia-green/15"
                  : "text-foreground/50 hover:text-foreground/80 border border-transparent"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.id === "keys" ? "Keys" : item.id === "usage" ? "Usage" : item.label}</span>
            </Link>
          ))}
          <Link
            href="/documentation"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 min-w-0 items-center justify-center md:justify-start gap-1.5 md:gap-3 px-2 md:px-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer text-foreground/50 hover:text-foreground/80 border border-transparent"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span className="truncate md:hidden">Docs</span>
            <span className="hidden md:inline truncate">Documentation</span>
            <ExternalLink className="hidden md:block w-3.5 h-3.5 ml-auto opacity-60" />
          </Link>
        </nav>

        <main className="flex-1 w-full max-w-6xl p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6">
          <div className="border-b border-border/50 pb-3 sm:pb-4 mb-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Usage & Performance
            </h1>
            <p className="text-xs text-foreground/40 mt-1 leading-5">
              Track usage and token rates consumed per key.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <UsageView keys={keys} keysLoading={keysLoading} />
        </main>
      </div>
    </div>
  );
}
