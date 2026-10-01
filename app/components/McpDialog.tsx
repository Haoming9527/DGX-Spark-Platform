"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ExternalLink, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { McpIcon } from "./ui/McpIcon";
import type { McpAuth as Authentication, McpConnection as Connection, McpTool as Tool } from "@/lib/mcp/types";

interface McpDialogProps {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  onSignIn: () => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  disabled?: boolean;
}

const authenticationLabels: Record<Authentication, string> = {
  oauth: "OAuth",
  none: "No authentication",
  auto: "OAuth or no authentication",
  token: "Access token",
};
const buttonBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:text-muted";
const button = `${buttonBase} enabled:hover:bg-panel-hover`;
const primaryButton = `${buttonBase} bg-foreground enabled:text-background enabled:hover:bg-foreground/90 disabled:bg-panel-hover`;
const field = "mt-1.5 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:text-sm";

async function responseBody<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "The request failed. Try again.");
  if (!data) throw new Error("The server returned an empty response. Try again.");
  return data as T;
}

export function McpDialog({ open, onClose, signedIn, onSignIn, selectedIds, onSelectionChange, disabled = false }: McpDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const requests = useRef<AbortController | null>(null);
  const reduceMotion = useReducedMotion();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tools, setTools] = useState<Record<string, Tool[]>>({});
  const [authorization, setAuthorization] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState<Authentication>("oauth");
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [issuer, setIssuer] = useState("");
  const [trusted, setTrusted] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await responseBody<{ connections: Connection[]; configured: boolean }>(await fetch("/api/mcp", { cache: "no-store", signal }));
      if (signal?.aborted) return;
      setConnections(result.connections);
      setConfigured(result.configured);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "Could not load MCP servers.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      closeButton.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !signedIn) return;
    const controller = new AbortController();
    requests.current = controller;
    void refresh(controller.signal);
    return () => controller.abort();
  }, [open, signedIn, refresh]);

  const clearSecrets = () => {
    setToken("");
    setClientSecret("");
  };

  const connect = async (connection: Connection) => {
    const signal = requests.current?.signal;
    setBusy(`connect:${connection.id}`);
    setError(null);
    try {
      const result = await responseBody<{ tools?: Tool[]; authorizationUrl?: string }>(await fetch(`/api/mcp/${connection.id}/connect`, { method: "POST", signal }));
      if (signal?.aborted) return;
      if (result.authorizationUrl) {
        const destination = new URL(result.authorizationUrl);
        if (destination.protocol !== "https:" || destination.username || destination.password) throw new Error("The server returned an invalid OAuth address.");
        setAuthorization((current) => ({ ...current, [connection.id]: destination.href }));
      } else {
        setTools((current) => ({ ...current, [connection.id]: result.tools ?? [] }));
        setAuthorization((current) => {
          const next = { ...current };
          delete next[connection.id];
          return next;
        });
        setConnections((current) => current.map((item) => item.id === connection.id ? { ...item, connected: true } : item));
      }
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "Could not connect. Check the server and try again.");
    } finally {
      if (!signal?.aborted) setBusy(null);
    }
  };

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trusted || disabled || busy) return;
    const signal = requests.current?.signal;
    setBusy("create");
    setError(null);
    try {
      const result = await responseBody<{ connection: Connection }>(await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), description: description.trim(), auth, trusted: true,
          ...(auth === "token" ? { token } : {}),
          ...(auth === "oauth" || auth === "auto" ? { clientId: clientId.trim(), clientSecret, issuer: issuer.trim() } : {}),
        }),
        signal,
      }));
      if (signal?.aborted) return;
      setConnections((current) => [...current, result.connection]);
      setAdding(false);
      setName("");
      setDescription("");
      setUrl("");
      setClientId("");
      setIssuer("");
      setTrusted(false);
      clearSecrets();
      await connect(result.connection);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "Could not save this MCP server.");
    } finally {
      if (!signal?.aborted) setBusy(null);
    }
  };

  const remove = async (connection: Connection) => {
    const signal = requests.current?.signal;
    setBusy(`remove:${connection.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/mcp/${connection.id}`, { method: "DELETE", signal });
      if (!response.ok) await responseBody(response);
      if (signal?.aborted) return;
      setConnections((current) => current.filter((item) => item.id !== connection.id));
      onSelectionChange(selectedIds.filter((selected) => selected !== connection.id));
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "Could not remove this MCP server.");
    } finally {
      if (!signal?.aborted) setBusy(null);
    }
  };

  const blocked = disabled || busy !== null;
  const oauth = auth === "oauth" || auth === "auto";

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      className="sticker fixed m-auto max-h-[calc(100svh_-_2rem)] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto p-0 backdrop:bg-black/60"
      onClose={() => {
        requests.current?.abort();
        setBusy(null);
        clearSecrets();
        setTrusted(false);
        onClose();
        if (opener.current?.isConnected && !opener.current.matches(":disabled")) opener.current.focus();
      }}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-panel px-5 py-4 sm:px-6">
        <div>
          <h2 id={`${id}-title`} className="flex items-center gap-2.5 text-xl font-bold">
            <McpIcon className="h-5 w-5 shrink-0" />
            {adding ? "Add MCP server" : "MCP servers"}
          </h2>
          <p id={`${id}-description`} className="mt-1 text-sm text-muted">Connect tools for this chat.</p>
        </div>
        <button ref={closeButton} type="button" aria-label="Close MCP servers" className={`${button} -mr-2 h-11 w-11 shrink-0 !border-transparent !p-0`} onClick={() => dialog.current?.close()}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {!signedIn ? (
          <div className="py-3">
            <p className="text-sm leading-6 text-muted">Sign in to save your MCP servers and choose which tools to use.</p>
            <button type="button" className={`${primaryButton} mt-4`} onClick={() => { dialog.current?.close(); onSignIn(); }}>Sign in</button>
          </div>
        ) : (
          <>
            {error && <p role="alert" className="mb-4 rounded-xl border border-border bg-background px-3.5 py-3 text-sm leading-6 text-foreground">{error}</p>}
            {disabled && <p role="status" className="mb-4 text-sm text-muted">Finish or stop the current response to change tools.</p>}
            {loading ? (
              <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading MCP servers…</p>
            ) : !configured ? (
              <p className="text-sm leading-6 text-muted">MCP is not configured yet. Ask the administrator to finish setup.</p>
            ) : adding ? (
              <motion.form key="add" initial={reduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} onSubmit={create} className="space-y-4">
                <fieldset disabled={blocked} className="space-y-4 disabled:opacity-70">
                  <label className="block text-sm font-medium" htmlFor={`${id}-name`}>Name
                    <input id={`${id}-name`} className={field} value={name} onChange={(event) => setName(event.target.value)} placeholder="My tools" required maxLength={80} autoComplete="off" />
                  </label>
                  <label className="block text-sm font-medium" htmlFor={`${id}-description-input`}>Description <span className="font-normal text-muted">(optional)</span>
                    <input id={`${id}-description-input`} className={field} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this server helps with" maxLength={300} autoComplete="off" />
                  </label>
                  <label className="block text-sm font-medium" htmlFor={`${id}-url`}>Server URL
                    <input id={`${id}-url`} type="url" className={field} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/mcp" required maxLength={2048} autoComplete="off" spellCheck={false} />
                  </label>
                  <div className="text-sm font-medium">
                    <label htmlFor={`${id}-auth`}>Authentication</label>
                    <select id={`${id}-auth`} className={field} value={auth} onChange={(event) => { setAuth(event.target.value as Authentication); clearSecrets(); }}>
                      {Object.entries(authenticationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  {auth === "auto" && <p className="!mt-2 text-sm text-muted">Use OAuth only if the server asks you to sign in.</p>}
                  {auth === "token" && (
                    <label className="block text-sm font-medium" htmlFor={`${id}-token`}>Access token
                      <input id={`${id}-token`} type="password" className={field} value={token} onChange={(event) => setToken(event.target.value)} required autoComplete="new-password" maxLength={8192} spellCheck={false} />
                    </label>
                  )}
                  {oauth && (
                    <details className="rounded-xl border border-border px-3.5 py-3">
                      <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">Advanced OAuth settings</summary>
                      <p className="mt-2 text-sm leading-6 text-muted">Optional for servers that support automatic registration.</p>
                      <div className="mt-3 space-y-3">
                        <label className="block text-sm font-medium" htmlFor={`${id}-issuer`}>OAuth issuer
                          <input id={`${id}-issuer`} type="url" className={field} value={issuer} onChange={(event) => setIssuer(event.target.value)} onInvalid={(event) => event.currentTarget.closest("details")?.setAttribute("open", "")} placeholder="https://auth.example.com" required={Boolean(clientId || clientSecret)} maxLength={2048} autoComplete="off" spellCheck={false} />
                        </label>
                        <label className="block text-sm font-medium" htmlFor={`${id}-client-id`}>Client ID
                          <input id={`${id}-client-id`} className={field} value={clientId} onChange={(event) => setClientId(event.target.value)} maxLength={1024} autoComplete="off" spellCheck={false} />
                        </label>
                        <label className="block text-sm font-medium" htmlFor={`${id}-client-secret`}>Client secret <span className="font-normal text-muted">(optional)</span>
                          <input id={`${id}-client-secret`} type="password" className={field} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} maxLength={4096} autoComplete="new-password" spellCheck={false} />
                        </label>
                      </div>
                    </details>
                  )}
                  <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-4 text-sm leading-6">
                    <input type="checkbox" checked={trusted} onChange={(event) => setTrusted(event.target.checked)} required className="mt-1 h-4 w-4 shrink-0 accent-nvidia-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground" />
                    <span>I trust this server. Tools can receive chat data and make changes when I approve a call.</span>
                  </label>
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button type="button" className={button} disabled={busy !== null} onClick={() => { setAdding(false); clearSecrets(); setError(null); }}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</button>
                  <button type="submit" className={primaryButton} disabled={blocked || !trusted}>
                    {busy === "create" && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {busy === "create" ? "Adding…" : "Add server"}
                  </button>
                </div>
              </motion.form>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted">{selectedIds.length ? `${selectedIds.length} selected for this chat` : "Choose which servers this chat can use."}</p>
                  <button type="button" className={`${button} !px-3`} disabled={blocked} onClick={() => { setAdding(true); setError(null); }}><Plus className="h-4 w-4" aria-hidden="true" />Add server</button>
                </div>
                {connections.length === 0 ? <p className="py-8 text-sm leading-6 text-muted">No MCP servers yet. Add a server URL to connect your tools.</p> : (
                  <ul className="mt-3 divide-y divide-border">
                    {connections.map((connection) => {
                      const discovered = tools[connection.id];
                      const selected = selectedIds.includes(connection.id);
                      return (
                        <li key={connection.id} className="py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="break-words font-semibold">{connection.name}</h3>
                              {connection.description && <p className="mt-1 break-words text-sm text-muted">{connection.description}</p>}
                              <p className="mt-1 break-all text-xs leading-5 text-muted">{connection.url}</p>
                              <p className="mt-1 text-xs text-muted">{authenticationLabels[connection.auth]}</p>
                            </div>
                            <button type="button" className={`${button} h-11 w-11 shrink-0 !border-transparent !p-0`} aria-label={`Remove ${connection.name}`} disabled={blocked} onClick={() => void remove(connection)}>{busy === `remove:${connection.id}` ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}</button>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <button type="button" className={button} disabled={blocked} onClick={() => void connect(connection)}>
                              {busy === `connect:${connection.id}` ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                              {busy === `connect:${connection.id}` ? "Connecting…" : discovered ? "Refresh tools" : "Connect"}
                            </button>
                            <label className={`flex min-h-11 items-center gap-2.5 text-sm font-medium ${blocked || (!discovered?.length && !selected) ? "text-muted" : "cursor-pointer"}`}>
                              <input type="checkbox" checked={selected} disabled={blocked || (!discovered?.length && !selected)} onChange={(event) => onSelectionChange(event.target.checked ? [...selectedIds, connection.id] : selectedIds.filter((value) => value !== connection.id))} className="h-4 w-4 accent-nvidia-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground" />
                              Use in chat
                            </label>
                          </div>
                          {authorization[connection.id] && <div className="mt-3 text-sm leading-6"><a className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground" href={authorization[connection.id]} target="_blank" rel="noopener noreferrer">Continue with OAuth<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a><p className="text-muted">Sign in in the new tab, then return and connect again.</p></div>}
                          {discovered && (discovered.length === 0 ? <p role="status" className="mt-3 text-sm text-muted">Connected. This server has no tools.</p> : <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">{discovered.length} {discovered.length === 1 ? "tool" : "tools"} available</summary><ul className="mt-2 space-y-3 pl-4">{discovered.map((tool) => <li key={tool.name}><p className="break-words font-medium">{tool.name}</p>{tool.description && <p className="mt-0.5 break-words leading-6 text-muted">{tool.description}</p>}</li>)}</ul></details>)}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="border-t border-border pt-4 text-xs leading-5 text-muted">Saved to your account. Each tool call asks for your approval.</p>
              </>
            )}
            {!adding && <div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={blocked || loading} className="min-h-11 text-sm text-muted underline underline-offset-4 enabled:hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed" onClick={() => void refresh(requests.current?.signal)}>Reload servers</button><button type="button" className={button} onClick={() => dialog.current?.close()}>Done</button></div>}
          </>
        )}
      </div>
    </dialog>
  );
}
