"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AdminShell } from "../AdminShell";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  disabled: boolean;
  createdAt: string;
  keyCount: number;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const patch = async (id: string, body: Record<string, unknown>) => {
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Update failed.");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this user and their API keys?")) return;
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Delete failed.");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <AdminShell title="Users" hint="Promote, disable, or remove accounts." active="users">
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
            {users.map((user) => (
              <div key={user.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">
                    {user.username}{" "}
                    <span className="font-mono text-xs font-normal text-muted">{user.email}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {user.role}
                    {user.disabled ? " · disabled" : ""}
                    {" · "}
                    {user.keyCount} keys
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => patch(user.id, { role: user.role === "admin" ? "user" : "admin" })}
                    className="sticker-sm h-8 px-3 text-xs font-semibold"
                  >
                    {user.role === "admin" ? "Demote" : "Promote"}
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(user.id, { disabled: !user.disabled })}
                    className="sticker-sm h-8 px-3 text-xs font-semibold"
                  >
                    {user.disabled ? "Enable" : "Disable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(user.id)}
                    className="sticker-sm h-8 px-3 text-xs font-semibold text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {users.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted">No users.</div>}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
