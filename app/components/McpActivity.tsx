"use client";

import { Check, Loader2, X } from "lucide-react";
import { McpIcon } from "./ui/McpIcon";
import type { McpActivity as Activity } from "../../lib/mcpChat";

export function McpActivity({ activities, onDecision }: {
  activities: Activity[];
  onDecision?: (id: string, approved: boolean) => void;
}) {
  return <div className="my-2 divide-y divide-border rounded-xl border border-border bg-panel px-4">
    {activities.map((activity) => <div key={activity.id} className="py-3 text-sm">
      <div className="flex items-start gap-2 text-foreground">
        {activity.status === "running" ? <Loader2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" /> :
          activity.status === "completed" ? <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> :
          activity.status === "declined" || activity.status === "cancelled" ? <X aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> :
          <McpIcon className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{activity.server} · {activity.name}</p>
          <p className="mt-0.5 break-all text-xs text-muted">{new URL(activity.url).origin}</p>
        </div>
        {activity.status !== "approval" && <span className="shrink-0 text-xs capitalize text-muted">{activity.status === "unknown" ? "Result unknown" : activity.status}</span>}
      </div>
      {activity.status === "approval" ? <>
        <p className="mt-3 text-muted">Allow this tool to receive these arguments?</p>
        <pre className="custom-scrollbar my-2 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-panel-hover p-3 text-xs text-foreground">{JSON.stringify(activity.arguments, null, 2)}</pre>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onDecision?.(activity.id, true)} className="rounded-lg bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2">Allow once</button>
          <button type="button" onClick={() => onDecision?.(activity.id, false)} className="rounded-lg border border-border px-4 py-2 font-medium transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2">Decline</button>
        </div>
      </> : activity.status === "unknown" ? <p className="mt-2 text-muted">This tool may have run. Check the connected service before retrying.</p> : null}
    </div>)}
  </div>;
}
