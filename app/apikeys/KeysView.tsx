"use client";

import { useState } from "react";
import {
  Key, Plus, Trash2, Copy, Check, Clock, Loader2,
  AlertTriangle, Shield, Edit2, X
} from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  total_tokens: number;
  total_requests: number;
}

interface KeysViewProps {
  keys: ApiKey[];
  keysLoading: boolean;
  creating: boolean;
  newKeyName: string;
  setNewKeyName: (name: string) => void;
  handleCreate: (e: React.FormEvent) => Promise<void>;
  createdRawKey: string | null;
  handleCopy: (text: string) => void;
  copied: boolean;
  confirmTarget: { id: string; name: string } | null;
  setConfirmTarget: (target: { id: string; name: string } | null) => void;
  handleDelete: () => Promise<void>;
  deletingId: string | null;
  error: string | null;
  onRenameKey: (id: string, name: string) => Promise<void>;
}

export function KeysView({
  keys,
  keysLoading,
  creating,
  newKeyName,
  setNewKeyName,
  handleCreate,
  createdRawKey,
  handleCopy,
  copied,
  confirmTarget,
  setConfirmTarget,
  handleDelete,
  deletingId,
  error,
  onRenameKey,
}: KeysViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [renaming, setRenaming] = useState<boolean>(false);

  const handleSaveRename = async (id: string) => {
    if (!editingName.trim()) return;
    setRenaming(true);
    try {
      await onRenameKey(id, editingName);
      setEditingId(null);
    } catch (err) {
      // Parent handleRename sets the error banner automatically
    } finally {
      setRenaming(false);
    }
  };
  return (
    <div className="space-y-6">
      {/* Create Key Form */}
      <div className="bg-panel border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4 text-nvidia-green" /> Create New Key
        </h2>
        <form onSubmit={handleCreate} className="flex gap-3">
          <input
            type="text"
            required
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. VSCode / Cursor / LangChain"
            maxLength={100}
            className="flex-1 px-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-foreground/25 focus:border-nvidia-green/50 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={creating || !newKeyName.trim() || keys.length >= 20}
            className="px-5 py-2.5 bg-nvidia-green text-black font-bold rounded-lg text-sm hover:bg-nvidia-green/90 transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-md shadow-nvidia-green/15 shrink-0"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate
          </button>
        </form>

        {/* One-time key reveal */}
        {createdRawKey && (
          <div className="rounded-xl border border-nvidia-green/30 bg-nvidia-green/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-nvidia-green text-xs font-bold">
              <Shield className="w-3.5 h-3.5" />
              Key created — copy it now. It will <span className="underline">never</span> be shown again.
            </div>
            <div className="flex items-center gap-2 bg-background border border-border/60 rounded-lg p-2.5">
              <code className="flex-1 text-xs font-mono text-foreground/90 break-all select-all pl-1">
                {createdRawKey}
              </code>
              <button
                onClick={() => handleCopy(createdRawKey)}
                className="shrink-0 p-2 bg-panel hover:bg-panel-hover border border-border rounded-md text-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                title="Copy"
              >
                {copied ? <Check className="w-4 h-4 text-nvidia-green" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Keys Table */}
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-sm font-bold">Active Keys</h2>
          <span className="text-xs text-foreground/40 tabular-nums">{keys.length} / 20</span>
        </div>

        {keysLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-foreground/30">
            <Loader2 className="w-6 h-6 animate-spin text-nvidia-green" />
            <span className="text-sm">Loading keys…</span>
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-foreground/30">
            <Key className="w-8 h-8 opacity-30" />
            <p className="text-sm">No API keys yet. Create one above to get started.</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[2.5fr_2fr_1fr_1fr_1.5fr_0.5fr] gap-4 px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-foreground/30 border-b border-border/30">
              <span>Name</span>
              <span>Key Prefix</span>
              <span>Requests</span>
              <span>Tokens</span>
              <span>Last Used</span>
              <span />
            </div>
            <div className="divide-y divide-border/20">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="grid grid-cols-1 md:grid-cols-[2.5fr_2fr_1fr_1fr_1.5fr_0.5fr] gap-3 md:gap-4 items-center px-6 py-4 hover:bg-background/40 transition-colors"
                >
                  <div className="font-semibold text-sm text-foreground truncate flex items-center gap-2 min-w-0">
                    {editingId === key.id ? (
                      <div className="flex items-center gap-1.5 w-full min-w-0">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          disabled={renaming}
                          maxLength={100}
                          required
                          className="px-2 py-1 bg-background border border-border/80 focus:border-nvidia-green/50 rounded text-xs outline-none w-full max-w-[130px] min-w-0"
                          autoFocus
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") handleSaveRename(key.id);
                            else if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button
                          onClick={() => handleSaveRename(key.id)}
                          disabled={renaming || !editingName.trim()}
                          className="p-1 hover:bg-nvidia-green/10 rounded border border-transparent hover:border-nvidia-green/20 text-nvidia-green cursor-pointer disabled:opacity-50 shrink-0"
                          title="Save name"
                        >
                          {renaming ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={renaming}
                          className="p-1 hover:bg-red-500/10 rounded border border-transparent hover:border-red-500/20 text-foreground/40 hover:text-red-400 cursor-pointer disabled:opacity-50 shrink-0"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="truncate">{key.name}</span>
                        <button
                          onClick={() => {
                            setEditingId(key.id);
                            setEditingName(key.name);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-panel-hover rounded border border-transparent text-foreground/30 hover:text-nvidia-green transition-all cursor-pointer shrink-0"
                          title="Rename key"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="min-w-0">
                    <code className="text-xs font-mono text-foreground/50 bg-background border border-border/50 rounded px-2 py-0.5 truncate max-w-[180px] inline-block">
                      {key.key_prefix}…
                    </code>
                  </div>
                  <div className="text-sm text-foreground/60 tabular-nums">
                    {key.total_requests.toLocaleString()}
                  </div>
                  <div className="text-sm text-foreground/60 tabular-nums">
                    {key.total_tokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-foreground/40 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}
                  </div>
                  <button
                    onClick={() => setConfirmTarget({ id: key.id, name: key.name })}
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-transparent hover:border-red-500/30 hover:bg-red-500/10 text-foreground/30 hover:text-red-500 transition-all cursor-pointer"
                    title="Revoke key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
