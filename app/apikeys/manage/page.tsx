"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { BarChart3, BookOpen, ExternalLink, Key, Loader2, Trash2, TriangleAlert, X } from "lucide-react";

import { KeysView } from "../../components/KeysView";
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

const activeSection = "keys";

export default function ManageApiKeysPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    setCreatedRawKey(null);
    try {
      const res = await fetch("/api/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create key.");
      setCreatedRawKey(data.rawKey);
      setNewKeyName("");
      fetchKeys();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmTarget) return;
    const { id } = confirmTarget;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/apikeys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.status !== 204) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to revoke key.");
      }
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setConfirmTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      const res = await fetch("/api/apikeys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rename key.");
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, name: data.key.name } : k)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 text-nvidia-green animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-[100svh] flex-col font-sans text-foreground">
      <AnimatePresence>
        {confirmTarget && (
          <ConfirmRevokeDialog
            keyName={confirmTarget.name}
            onConfirm={handleDelete}
            onCancel={() => !deletingId && setConfirmTarget(null)}
            loading={!!deletingId}
          />
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-50 px-3 py-3 sm:px-4 md:px-8">
        <div className="sticker flex items-center justify-between gap-3 !rounded-full px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ExitBack href="/" />
            <Link href="/" className="hidden items-center gap-2 sm:inline-flex">
              <LogoMark size={22} className="!rounded-xl !border-[3px]" />
              <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em]">
                API Keys
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
              Manage API Keys
            </h1>
            <p className="mt-1 text-xs leading-5 text-muted">
              Create, inspect, and revoke your credentials.
            </p>
          </div>

          <KeysView
            keys={keys}
            keysLoading={keysLoading}
            creating={creating}
            newKeyName={newKeyName}
            setNewKeyName={setNewKeyName}
            handleCreate={handleCreate}
            createdRawKey={createdRawKey}
            handleCopy={handleCopy}
            copied={copied}
            setConfirmTarget={setConfirmTarget}
            error={error}
            onRenameKey={handleRename}
          />
        </main>
      </div>
    </div>
  );
}

function ConfirmRevokeDialog({
  keyName,
  onConfirm,
  onCancel,
  loading,
}: {
  keyName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ duration: 0.18 }}
        className="sticker w-full max-w-sm overflow-hidden !rounded-2xl"
      >
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <TriangleAlert className="w-4.5 h-4.5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Revoke API Key</h3>
              <p className="text-xs text-foreground/40 mt-0.5">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-foreground/30 hover:text-foreground/60 transition-colors p-1 rounded-lg hover:bg-panel-hover cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-foreground/70">
            You are about to permanently revoke{" "}
            <span className="font-semibold text-foreground">&quot;{keyName}&quot;</span>.
            Any application using this key will immediately lose access.
          </p>

          <div className="flex gap-2.5">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2 rounded-lg border border-border bg-panel-hover text-sm font-semibold text-foreground/70 hover:text-foreground hover:border-border/80 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Revoking...</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Revoke Key</>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
