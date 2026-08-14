"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatImage, Message, ModelItem } from "../types/chat";
import { Header } from "./Header";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { AuthModal } from "./AuthModal";
import { LogOut, TriangleAlert, X, Loader2, Router } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "./ui/LogoMark";
import { ModelStickers } from "./ui/ModelStickers";
import { splitAssistantText } from "../../lib/splitThinking";

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [useReasoning, setUseReasoning] = useState(false);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
  const [user, setUser] = useState<{ id: string; username: string; email: string; role?: string } | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkSession = async () => {
    try {
      const res = await fetch("/api/auth/login");
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
        }
      }
    } catch (err) {
      console.error("Failed to check session:", err);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "DELETE" });
      if (res.ok) {
        setUser(null);
        setIsLogoutConfirmOpen(false);
      }
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setLogoutLoading(false);
    }
  };

  const fetchModels = async (silent = false) => {
    if (!silent) {
      setModelsLoading(true);
      setIsOffline(false);
      setIsSleeping(false);
    }
    try {
      const res = await fetch("/api/models", { cache: "no-store" });
      const data = await res.json();

      if (data.error === "OFFLINE") {
        setIsOffline(true);
        return;
      }

      if (data.error === "SLEEPING") {
        setIsSleeping(true);
        setModels([]);
        setSelectedModel("");
        return;
      }

      if (data.models && Array.isArray(data.models)) {
        const loadedModels: ModelItem[] = data.models
          .filter((m: { name: string }) => !m.name.toLowerCase().includes("embed"))
          .map((m: { name: string; capabilities?: unknown; details?: { parameter_size?: string } }) => {
            const caps = Array.isArray(m.capabilities)
              ? m.capabilities.map((c) => String(c).toLowerCase())
              : [];
            return {
              id: m.name,
              name: m.name.charAt(0).toUpperCase() + m.name.slice(1),
              parameterSize: m.details?.parameter_size ?? null,
              capabilities: caps,
              thinking: caps.includes("thinking"),
              vision: caps.includes("vision"),
              tools: caps.includes("tools"),
              embedding: caps.includes("embedding"),
              audio: caps.includes("audio"),
            };
          });
        setIsOffline(false);
        setIsSleeping(loadedModels.length === 0);
        setModels(loadedModels);
        if (loadedModels.length > 0) {
          const preferred = "qwen3.6:35b-a3b";
          setSelectedModel((current) => {
            if (current && loadedModels.some((m: ModelItem) => m.id === current)) {
              return current;
            }
            const match = loadedModels.find(
              (m: ModelItem) => m.id === preferred || m.id.toLowerCase() === preferred
            );
            return match?.id || loadedModels[0].id;
          });
        } else {
          setSelectedModel("");
        }
      }
    } catch (error) {
      console.error("Failed to fetch models", error);
      if (!silent) setIsOffline(true);
    } finally {
      if (!silent) setModelsLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    if (user?.role === "admin") {
      void fetchModels(true);
    }
  }, [user?.role]);

  const selectedCaps = models.find((m) => m.id === selectedModel);
  const canThink = Boolean(selectedCaps?.thinking);
  const canSee = Boolean(selectedCaps?.vision);

  useEffect(() => {
    if (!canThink && useReasoning) setUseReasoning(false);
  }, [canThink, useReasoning]);

  useEffect(() => {
    if (!canSee) setPendingImages([]);
  }, [canSee]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 96;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    stopGeneration();
    setMessages([]);
  };

  const streamAssistant = async (history: Message[], assistantMessageId: string) => {
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          useReasoning: canThink && useReasoning,
          messages: toChatHistory(history, canSee),
        }),
        signal: abortControllerRef.current.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      if (!response.ok || isJson) {
        let note = "Chat request failed.";
        let code = "";
        let capability = "";
        if (isJson) {
          const data = await response.json();
          code = typeof data.error === "string" ? data.error : "";
          capability = typeof data.capability === "string" ? data.capability : "";
          note =
            code === "SLEEPING"
              ? "DGX Spark is sleeping — no AI servers online."
              : code === "OFFLINE"
                ? "Inference gateway is offline."
                : code === "MODEL_UNAVAILABLE"
                  ? data.message || "That model is not installed on DGX Spark. Choose another model."
                  : code === "MODEL_CAPABILITY"
                    ? data.message || "This model does not support that feature."
                    : data.message || data.error || note;
        } else {
          const text = await response.text();
          if (response.status === 404 || /not found/i.test(text)) {
            code = "MODEL_UNAVAILABLE";
            note = selectedModel
              ? `${selectedModel} is not installed on DGX Spark. Choose another model.`
              : "That model is not installed on DGX Spark. Choose another model.";
          } else {
            note = text.trim() || `Request failed (${response.status}).`;
          }
        }
        if (code === "SLEEPING") setIsSleeping(true);
        if (code === "OFFLINE") setIsOffline(true);
        if (code === "MODEL_UNAVAILABLE") void fetchModels(true);
        if (code === "MODEL_CAPABILITY") {
          if (capability === "thinking") setUseReasoning(false);
          if (capability === "vision") setPendingImages([]);
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content: note, isThinking: false } : msg
          )
        );
        return;
      }

      if (!response.body) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: "Empty response from DGX Spark.", isThinking: false }
              : msg
          )
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let done = false;
      let streamedContent = "";
      let streamedThinking = "";
      let lineBuffer = "";

      const updateAssistant = (partial: Partial<Message>) => {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, ...partial } : msg))
        );
      };

      const applyDisplayFromBuffers = () => {
        const parsed = splitAssistantText(streamedContent);
        const rThought = [streamedThinking, parsed.thought]
          .map((part) => part.trim())
          .filter(Boolean)
          .join("\n\n");
        const rContent = parsed.content;
        const rIsThinking = parsed.isThinking || (rThought.length > 0 && rContent.length === 0);

        updateAssistant({
          content: rContent,
          thoughtProcess: rThought,
          isThinking: rIsThinking,
        });
      };

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          lineBuffer += chunk;
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            try {
              const data = JSON.parse(trimmedLine);
              const msg = data.message;
              if (msg?.thinking) {
                streamedThinking += msg.thinking;
                applyDisplayFromBuffers();
              }
              if (msg?.content) {
                streamedContent += msg.content;
                applyDisplayFromBuffers();
              }
              if (data.done && data.eval_count && data.eval_duration) {
                updateAssistant({
                  evalCount: data.eval_count,
                  evalDurationMs: Math.round(data.eval_duration / 1000000),
                  isThinking: false,
                });
              }
            } catch (err) {
              console.warn("Failed to parse chunk:", trimmedLine, err);
            }
          }
        }
      }

      if (lineBuffer.trim()) {
        try {
          const data = JSON.parse(lineBuffer.trim());
          if (data.message?.thinking) streamedThinking += data.message.thinking;
          if (data.message?.content) streamedContent += data.message.content;
          applyDisplayFromBuffers();
        } catch {
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Chat Error:", error);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: msg.content?.trim()
                    ? `${msg.content}\n\nCould not reach DGX Spark.`
                    : "Could not reach DGX Spark.",
                  isThinking: false,
                }
              : msg
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    const images = canSee ? pendingImages.map((p) => p.dataUrl) : [];
    if ((!text && images.length === 0) || isLoading || !selectedModel) return;
    if (models.length > 0 && !models.some((m) => m.id === selectedModel)) {
      void fetchModels(true);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      ...(images.length ? { images } : {}),
    };
    const history = [...messages, userMessage];
    const assistantMessageId = (Date.now() + 1).toString();

    setInput("");
    setPendingImages([]);
    setMessages([...history, { id: assistantMessageId, role: "assistant", content: "" }]);
    await streamAssistant(history, assistantMessageId);
  };

  const handleRetry = async (assistantId: string) => {
    if (isLoading || !selectedModel) return;
    if (models.length > 0 && !models.some((m) => m.id === selectedModel)) {
      void fetchModels(true);
      return;
    }
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx <= 0) return;

    const prefix = messages.slice(0, idx);
    if (prefix[prefix.length - 1]?.role !== "user") return;

    const newAssistantId = `${Date.now()}`;
    setMessages([
      ...prefix,
      { id: newAssistantId, role: "assistant", content: "" },
    ]);
    await streamAssistant(prefix, newAssistantId);
  };

  return (
    <div className="relative flex h-[100svh] max-h-[100svh] flex-col overflow-hidden font-sans text-foreground sm:h-dvh sm:max-h-dvh">
      <Header
        models={models}
        selectedModel={selectedModel}
        modelsLoading={modelsLoading}
        isOffline={isOffline}
        isSleeping={isSleeping}
        isDropdownOpen={isDropdownOpen}
        setIsDropdownOpen={(open) => {
          if (open) void fetchModels(true);
          setIsDropdownOpen(open);
        }}
        setSelectedModel={setSelectedModel}
        clearChat={clearChat}
        user={user}
        onAuthClick={() => setIsAuthModalOpen(true)}
        onLogout={() => setIsLogoutConfirmOpen(true)}
      />

      <div className="relative min-h-0 flex-1">
        <ModelStickers docked={messages.length > 0} />

        <main
          ref={chatScrollRef}
          className={`relative z-[2] h-full min-h-0 px-3 py-3 sm:px-4 sm:py-6 md:px-8 ${
            messages.length === 0 ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
        <div
          className={`mx-auto flex max-w-3xl flex-col gap-6 sm:gap-7 ${
            messages.length === 0 ? "h-full justify-center pb-36 sm:pb-32" : "pb-36 sm:pb-28"
          }`}
        >
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-full min-h-0 flex-col items-center justify-center text-center"
            >
              {isOffline ? (
                <OfflineState onRetry={fetchModels} />
              ) : isSleeping ? (
                <SleepingState onRetry={fetchModels} />
              ) : (
                <div className="sticker relative mx-auto max-w-[13.5rem] px-3.5 py-3.5 text-center sm:max-w-[18rem] sm:px-5 sm:py-5">
                  <div className="mb-2 flex items-center justify-center sm:mb-3">
                    <LogoMark size={24} />
                  </div>
                  <h2 className="font-display text-balance text-base font-bold uppercase tracking-[0.03em] sm:text-[1.35rem]">
                    How can I help you today?
                  </h2>
                  <p className="mt-1.5 text-pretty text-[12px] leading-relaxed text-muted sm:mt-2 sm:text-[13px]">
                    Local models on DGX Spark.
                  </p>
                </div>
              )}
            </motion.div>
          ) : (
            messages.map((message, i) => {
              const isLastAssistant =
                message.role === "assistant" &&
                i === messages.findLastIndex((m) => m.role === "assistant");
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  showActions={message.role === "assistant" && !isLoading}
                  onRetry={
                    isLastAssistant && !isLoading
                      ? () => handleRetry(message.id)
                      : undefined
                  }
                />
              );
            })
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      <ChatInput
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        selectedModel={selectedModel}
        handleSubmit={handleSubmit}
        stopGeneration={stopGeneration}
        useReasoning={useReasoning}
        setUseReasoning={setUseReasoning}
        canThink={canThink}
        canSee={canSee}
        pendingImages={pendingImages}
        setPendingImages={setPendingImages}
      />
      </div>

      <AnimatePresence>
        {isAuthModalOpen && (
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            onSuccess={(u) => setUser(u)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLogoutConfirmOpen && (
          <ConfirmLogoutDialog
            onConfirm={handleLogout}
            onCancel={() => !logoutLoading && setIsLogoutConfirmOpen(false)}
            loading={logoutLoading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function toOllamaB64(dataUrl: string) {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function toChatHistory(history: Message[], includeImages: boolean) {
  return history.map((m) => {
    const item: { role: string; content: string; images?: string[] } = {
      role: m.role,
      content: m.content,
    };
    if (includeImages && m.role === "user" && m.images?.length) {
      item.images = m.images.map(toOllamaB64);
    }
    return item;
  });
}

function SleepingState({ onRetry }: { onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="sticker-dark relative mx-auto max-w-[12.75rem] px-3.5 py-3.5 text-center sm:max-w-[17rem] sm:px-5 sm:py-5"
    >
      <div className="mb-2 flex items-center justify-center sm:mb-3">
        <LogoMark size={24} />
      </div>
      <h2 className="font-display text-balance text-base font-bold uppercase tracking-[0.05em] sm:text-lg">
        Sleeping
      </h2>
      <p className="mt-1.5 text-pretty text-[12px] leading-relaxed text-[#a8a8a8] sm:mt-2 sm:text-[13px]">
        Power on your AI server, then come back.
      </p>
      <div className="mt-3 flex flex-col items-center gap-1.5 sm:mt-4 sm:gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="sticker-sm cursor-pointer px-2.5 py-1 text-[12px] font-semibold text-foreground transition-[filter] hover:brightness-110 sm:px-3 sm:py-1.5 sm:text-[13px]"
        >
          Try again
        </button>
        <Link href="/status" className="text-[11px] text-[#8a8a8a] transition-colors hover:text-nvidia-green sm:text-[12px]">
          View status
        </Link>
      </div>
    </motion.div>
  );
}

function OfflineState({ onRetry }: { onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="sticker relative mx-auto max-w-[12.75rem] px-3.5 py-3.5 text-center sm:max-w-[17rem] sm:px-5 sm:py-5"
    >
      <div className="mb-2 flex items-center justify-center sm:mb-3">
        <span className="icon-sticker !h-8 !w-8 sm:!h-9 sm:!w-9" aria-hidden>
          <Router className="h-4 w-4 text-[#ff5c5c] sm:h-5 sm:w-5" strokeWidth={2.25} />
        </span>
      </div>
      <h2 className="font-display text-balance text-base font-bold uppercase tracking-[0.04em] sm:text-lg">
        Offline
      </h2>
      <p className="mt-1.5 text-pretty text-[12px] leading-relaxed text-muted sm:mt-2 sm:text-[13px]">
        Can&apos;t reach the inference gateway right now.
      </p>
      <div className="mt-3 flex flex-col items-center gap-1.5 sm:mt-4 sm:gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="sticker-sm cursor-pointer px-2.5 py-1 text-[12px] font-medium text-foreground transition-[filter] hover:brightness-110 sm:px-3 sm:py-1.5 sm:text-[13px]"
        >
          Try again
        </button>
        <Link href="/status" className="text-[11px] text-muted transition-colors hover:text-nvidia-green sm:text-[12px]">
          View status
        </Link>
      </div>
    </motion.div>
  );
}

function ConfirmLogoutDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ duration: 0.18 }}
        className="sticker w-full max-w-sm overflow-hidden !rounded-2xl"
      >
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
              <TriangleAlert className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Sign Out</h3>
              <p className="mt-0.5 font-sans text-xs text-foreground/40">Are you sure you want to exit?</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="cursor-pointer rounded-lg p-1 text-foreground/30 transition-colors hover:bg-panel-hover hover:text-foreground/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="font-sans text-sm text-foreground/70">
            You will need to sign in again to manage your API keys or access your profile.
          </p>
          <div className="flex gap-2.5 font-sans">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 cursor-pointer rounded-lg border border-border bg-panel-hover py-2 text-sm font-semibold text-foreground/70 transition-colors hover:border-border/80 hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-500 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing out…
                </>
              ) : (
                <>
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
