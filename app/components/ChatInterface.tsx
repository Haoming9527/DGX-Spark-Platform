"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Message, ModelItem } from "../types/chat";
import { Header } from "./Header";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { AuthModal } from "./AuthModal";
import { LogOut, TriangleAlert, X, Loader2 } from "lucide-react";
import Link from "next/link";

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [useReasoning, setUseReasoning] = useState(false);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
  const [user, setUser] = useState<{ id: string; username: string; email: string } | null>(null);
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

  const fetchModels = async () => {
    setModelsLoading(true);
    setIsOffline(false);
    setIsSleeping(false);
    try {
      const res = await fetch("/api/models");
      const data = await res.json();

      if (data.error === "OFFLINE") {
        setIsOffline(true);
        setModelsLoading(false);
        return;
      }

      if (data.error === "SLEEPING") {
        setIsSleeping(true);
        setModels([]);
        setSelectedModel("");
        setModelsLoading(false);
        return;
      }

      if (data.models && Array.isArray(data.models)) {
        const loadedModels: ModelItem[] = data.models
          .filter((m: { name: string }) => !m.name.toLowerCase().includes("embed"))
          .map((m: { name: string }) => ({
            id: m.name,
            name: m.name.charAt(0).toUpperCase() + m.name.slice(1),
          }));
        setModels(loadedModels);
        if (loadedModels.length > 0) {
          const preferred = "qwen3.6:35b-a3b";
          const match = loadedModels.find(
            (m: ModelItem) => m.id === preferred || m.id.toLowerCase() === preferred
          );
          setSelectedModel(match?.id || loadedModels[0].id);
        } else {
          setIsSleeping(true);
        }
      }
    } catch (error) {
      console.error("Failed to fetch models", error);
      setIsOffline(true);
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

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
    // Instant jump while streaming — smooth scroll on every token causes shake
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

  const streamAssistant = async (
    history: { role: string; content: string }[],
    assistantMessageId: string
  ) => {
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          useReasoning,
          messages: history,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to fetch response");
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        const note =
          data.error === "SLEEPING"
            ? "DGX Spark is sleeping — no AI servers online."
            : data.error === "OFFLINE"
              ? "Inference gateway is offline."
              : data.message || data.error || "Chat request failed";
        if (data.error === "SLEEPING") setIsSleeping(true);
        if (data.error === "OFFLINE") setIsOffline(true);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content: note, isThinking: false } : msg
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
        let rContent = streamedContent;
        let rThought = streamedThinking;
        let rIsThinking = streamedThinking.length > 0 && streamedContent.length === 0;

        if (!streamedThinking && streamedContent.includes("<think>")) {
          if (streamedContent.includes("</think>")) {
            const thinkMatch = streamedContent.match(/<think>([\s\S]*?)<\/think>/);
            if (thinkMatch) rThought = thinkMatch[1].trim();
            rContent = streamedContent.replace(/<think>[\s\S]*?<\/think>/, "").trim();
            rIsThinking = false;
          } else {
            const parts = streamedContent.split("<think>");
            rContent = parts[0].trim();
            rThought = parts[1] || "";
            rIsThinking = true;
          }
        }

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
          // ignore
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
                  content: msg.content + "\n\n**Error: Failed to connect to DGX Spark backend.**",
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
    if (!input.trim() || isLoading || !selectedModel) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    const history = [...messages, userMessage];
    const assistantMessageId = (Date.now() + 1).toString();

    setInput("");
    setMessages([...history, { id: assistantMessageId, role: "assistant", content: "" }]);
    await streamAssistant(
      history.map((m) => ({ role: m.role, content: m.content })),
      assistantMessageId
    );
  };

  const handleRetry = async (assistantId: string) => {
    if (isLoading || !selectedModel) return;
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx <= 0) return;

    const prefix = messages.slice(0, idx);
    if (prefix[prefix.length - 1]?.role !== "user") return;

    const newAssistantId = `${Date.now()}`;
    setMessages([
      ...prefix,
      { id: newAssistantId, role: "assistant", content: "" },
    ]);
    await streamAssistant(
      prefix.map((m) => ({ role: m.role, content: m.content })),
      newAssistantId
    );
  };

  return (
    <div className="flex h-[100svh] max-h-[100svh] flex-col overflow-hidden bg-background font-sans text-foreground sm:h-dvh sm:max-h-dvh">
      <Header
        models={models}
        selectedModel={selectedModel}
        modelsLoading={modelsLoading}
        isDropdownOpen={isDropdownOpen}
        setIsDropdownOpen={setIsDropdownOpen}
        setSelectedModel={setSelectedModel}
        clearChat={clearChat}
        user={user}
        onAuthClick={() => setIsAuthModalOpen(true)}
        onLogout={() => setIsLogoutConfirmOpen(true)}
      />

      <main
        ref={chatScrollRef}
        className={`min-h-0 flex-1 px-3 py-3 sm:px-4 sm:py-6 md:px-8 ${
          messages.length === 0 ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        <div
          className={`mx-auto flex max-w-3xl flex-col gap-6 sm:gap-7 ${
            messages.length === 0 ? "h-full pb-0" : "pb-36 sm:pb-28"
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
                <>
                  <Image
                    src="/logo.svg"
                    alt=""
                    width={52}
                    height={52}
                    className="mb-6 h-[52px] w-[52px] object-contain sm:mb-8"
                    priority
                  />
                  <h2 className="mb-2 text-balance text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                    How can I help you today?
                  </h2>
                  <p className="max-w-sm text-pretty text-sm leading-relaxed text-foreground/45 sm:text-[15px]">
                    Local models on DGX Spark. Pick a model above and start a conversation.
                  </p>
                </>
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
      />

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

function SleepingState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mb-7"
      >
        <Image src="/logo.svg" alt="" width={52} height={52} className="mx-auto h-[52px] w-[52px] object-contain" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-[22rem]"
      >
        <h2 className="text-balance text-[22px] font-medium tracking-tight sm:text-2xl">
          DGX Spark is sleeping
        </h2>
        <p className="mt-3 text-pretty text-[15px] leading-relaxed text-foreground/50">
          Power on your AI server, then come back here.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer text-[14px] font-medium text-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Try again
          </button>
          <Link
            href="/status"
            className="text-[13px] text-foreground/40 transition-colors hover:text-foreground/65"
          >
            View status
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

function OfflineState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mb-7"
      >
        <Image
          src="/logo.svg"
          alt=""
          width={52}
          height={52}
          className="mx-auto h-[52px] w-[52px] object-contain opacity-70 grayscale"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-[22rem]"
      >
        <h2 className="text-balance text-[22px] font-medium tracking-tight sm:text-2xl">
          Gateway is offline
        </h2>
        <p className="mt-3 text-pretty text-[15px] leading-relaxed text-foreground/50">
          We can&apos;t reach the inference gateway right now.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer text-[14px] font-medium text-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Try again
          </button>
          <Link
            href="/status"
            className="text-[13px] text-foreground/40 transition-colors hover:text-foreground/65"
          >
            View status
          </Link>
        </div>
      </motion.div>
    </div>
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
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl"
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
