"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BarChart3, BookOpen, ExternalLink, Key, Loader2, Trash2, TriangleAlert, X } from "lucide-react";

import { KeysView } from "../../components/KeysView";

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-nvidia-green animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-[100svh] bg-background text-foreground font-sans flex flex-col">
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
              Manage API Keys
            </h1>
            <p className="text-xs text-foreground/40 mt-1 leading-5">
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
        className="w-full max-w-sm bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden"
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
