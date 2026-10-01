"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { UsageView } from "../../components/UsageView";
import { ApiKeysShell } from "../ApiKeysShell";

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
        else router.replace("/?auth=login&next=/apikeys/usage");
      })
      .catch(() => router.replace("/?auth=login&next=/apikeys/usage"))
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
    <ApiKeysShell
      label="Usage"
      title="Usage & Performance"
      hint="Track usage and token rates consumed per key."
      active="usage"
      username={user.username}
    >
      {error && (
        <div className="rounded-xl border border-alert/30 bg-alert/10 p-3 text-sm text-alert">{error}</div>
      )}
      <UsageView keys={keys} keysLoading={keysLoading} />
    </ApiKeysShell>
  );
}
