"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AdminShell } from "../AdminShell";
import { ConfirmDialog } from "../ConfirmDialog";
import type { UserRole } from "@/lib/account";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
  keyCount: number;
};

type Pending =
  | { kind: "role"; user: AdminUser; role: UserRole }
  | { kind: "disabled"; user: AdminUser; disabled: boolean }
  | { kind: "delete"; user: AdminUser };

function pendingCopy(pending: Pending) {
  const name = pending.user.username;
  if (pending.kind === "role") {
    return {
      title: "Set role",
      body: `Set ${name}'s role to ${pending.role}?`,
      confirmLabel: "Set role",
      danger: pending.role !== "admin" && pending.user.role === "admin",
    };
  }
  if (pending.kind === "disabled") {
    return pending.disabled
      ? {
          title: "Disable account",
          body: `Disable ${name}? They will not be able to sign in or use API keys.`,
          confirmLabel: "Disable",
          danger: true,
        }
      : {
          title: "Enable account",
          body: `Enable ${name}?`,
          confirmLabel: "Enable",
          danger: false,
        };
  }
  return {
    title: "Delete account",
    body: `Delete ${name} and their API keys? This cannot be undone.`,
    confirmLabel: "Delete",
    danger: true,
  };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users.");
      setUsers(data.users || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runPending = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === "delete") {
        const res = await fetch(`/api/admin/users?id=${pending.user.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Delete failed.");
        setUsers((prev) => prev.filter((u) => u.id !== pending.user.id));
      } else {
        const body =
          pending.kind === "role"
            ? { role: pending.role }
            : { disabled: pending.disabled };
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pending.user.id, ...body }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed.");
        setUsers((prev) => prev.map((u) => (u.id === pending.user.id ? { ...u, ...data.user } : u)));
      }
      setPending(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const copy = pending ? pendingCopy(pending) : null;

  return (
    <AdminShell title="Users" hint="Set role, disable, or remove accounts." active="users">
      <ConfirmDialog
        open={Boolean(pending)}
        title={copy?.title || ""}
        body={copy?.body || ""}
        confirmLabel={copy?.confirmLabel || "Confirm"}
        danger={copy?.danger}
        loading={busy}
        onConfirm={runPending}
        onCancel={() => {
          if (!busy) setPending(null);
        }}
      />
      <div className="sticker space-y-4 p-4 sm:p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(q);
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search username or email"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-nvidia-green/50"
          />
          <button type="submit" className="sticker-sm h-9 px-3 text-sm font-semibold">
            Search
          </button>
        </form>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-nvidia-green" />
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {users.map((user) => {
              const lastAdmin =
                user.role === "admin" &&
                !user.disabled &&
                users.filter((u) => u.role === "admin" && !u.disabled).length <= 1;
              return (
                <div
                  key={user.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">
                      {user.username}{" "}
                      <span className="font-mono text-xs font-normal text-muted">{user.email}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {user.disabled ? "disabled · " : ""}
                      {user.keyCount} keys
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold">
                      <span className="text-muted">Role</span>
                      <select
                        value={user.role}
                        disabled={lastAdmin}
                        title={lastAdmin ? "Last admin must keep this role" : "Set role"}
                        onChange={(e) => {
                          const role = e.target.value;
                          if (role !== "user" && role !== "operator" && role !== "admin") return;
                          if (role === user.role) return;
                          setPending({ kind: "role", user, role });
                        }}
                        className="sticker-sm h-8 px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="user">user</option>
                        <option value="operator">operator</option>
                        <option value="admin">admin</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={lastAdmin}
                      onClick={() => setPending({ kind: "disabled", user, disabled: !user.disabled })}
                      className="sticker-sm h-8 px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {user.disabled ? "Enable" : "Disable"}
                    </button>
                    <button
                      type="button"
                      disabled={lastAdmin}
                      onClick={() => setPending({ kind: "delete", user })}
                      className="sticker-sm h-8 px-3 text-xs font-semibold text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
            {users.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted">No users.</div>}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
