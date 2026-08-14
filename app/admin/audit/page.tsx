"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AdminShell } from "../AdminShell";

type EventRow = {
  id: string;
  at: string;
  action: string;
  modelName: string;
  statusCode: number;
  path: string;
};

export default function AdminAuditPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/audit", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEvents(data.events || []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load audit."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell title="Audit" hint="Allow and deny events for restricted model names. No prompts stored." active="audit">
      <div className="sticker p-4 sm:p-5">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-nvidia-green" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Path</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-t border-border">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted">
                      {new Date(event.at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-semibold">{event.action}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{event.modelName}</td>
                    <td className="py-2 pr-3">{event.statusCode}</td>
                    <td className="py-2 font-mono text-xs text-muted">{event.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.length === 0 && <p className="py-8 text-center text-sm text-muted">No events yet.</p>}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
