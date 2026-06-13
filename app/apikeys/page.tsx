"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  Key, Trash2, ArrowLeft, Zap, Loader2,
  BarChart3, BookOpen, Clock, TriangleAlert, X
} from "lucide-react";

import { KeysView } from "./KeysView";
import { UsageView } from "./UsageView";
import { DocsView } from "./DocsView";
import { ConfirmRevokeDialog } from "../components/ConfirmRevokeDialog";

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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ApiKeysPage() {
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
  const [activeTab, setActiveTab] = useState<"keys" | "usage" | "docs">("keys");

  // ── Check session ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/login")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) setUser(d.user);
        else router.replace("/");
      })
      .catch(() => router.replace("/"))
      .finally(() => setSessionLoading(false));
  }, [router]);

  // ── Fetch keys ─────────────────────────────────────────────────────────────
  const fetchKeys = useCallback(async () => {
    setKeysLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/apikeys");
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

  // ── Create key ─────────────────────────────────────────────────────────────
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

  // ── Delete key (after confirmation) ───────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmTarget) return;
    const { id } = confirmTarget;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/apikeys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.status === 204) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        setConfirmTarget(null);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke key.");
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

  // ── Copy key ───────────────────────────────────────────────────────────────
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
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">

      {/* ── Confirm Revoke Dialog ────────────────────────────────────────────── */}
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

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-foreground/50 hover:text-foreground transition-colors cursor-pointer text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Chat</span>
          </button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-nvidia-green/10 border border-nvidia-green/20 flex items-center justify-center overflow-hidden p-0.5">
              <Image src="/logo.svg" alt="Logo" width={28} height={28} className="object-contain" />
            </div>
            <span className="font-bold text-sm">DGX Spark<span className="text-nvidia-green"> Platform</span></span>
          </div>
        </div>
        <div className="text-xs text-foreground/40">
          Signed in as <span className="text-foreground/70 font-semibold">{user.username}</span>
        </div>
      </header>

      {/* ── Page Body with Sidebar Layout ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:flex-row">
        
        {/* Sidebar Nav */}
        <nav className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-panel/30 p-4 shrink-0 flex flex-row md:flex-col gap-1.5 md:gap-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto custom-scrollbar md:sticky md:top-[69px] md:h-[calc(100vh-69px)]">
          {[
            { id: "keys", label: "API Keys", icon: Key },
            { id: "usage", label: "Token Usage", icon: BarChart3 },
            { id: "docs", label: "Documentation", icon: BookOpen },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? "bg-nvidia-green/10 text-nvidia-green border border-nvidia-green/15"
                  : "text-foreground/50 hover:text-foreground/80 border border-transparent"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Content Pane */}
        <main className="flex-1 max-w-4xl p-6 md:p-8 space-y-6">
          <div className="border-b border-border/50 pb-4 mb-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              {activeTab === "keys" && "Manage API Keys"}
              {activeTab === "usage" && "Usage & Performance"}
              {activeTab === "docs" && "Developer Documentation"}
            </h1>
            <p className="text-xs text-foreground/40 mt-1">
              {activeTab === "keys" && "Create, inspect, and revoke your credentials."}
              {activeTab === "usage" && "Track usage and token rates consumed per key."}
              {activeTab === "docs" && "Guides, parameters, and quick-start scripts."}
            </p>
          </div>

          <div className="transition-all duration-150">
            {activeTab === "keys" && (
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
                confirmTarget={confirmTarget}
                setConfirmTarget={setConfirmTarget}
                handleDelete={handleDelete}
                deletingId={deletingId}
                error={error}
                onRenameKey={handleRename}
              />
            )}
            {activeTab === "usage" && (
              <UsageView keys={keys} keysLoading={keysLoading} />
            )}
            {activeTab === "docs" && (
              <DocsView />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
