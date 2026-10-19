"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type FileUIPart } from "ai";
import { ChatImage, ChatUIMessage, Message, ModelItem } from "../types/chat";
import { Header } from "./Header";
import { ChatInput } from "./ChatInput";
import { LogOut, TriangleAlert, X, Loader2, Router } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "./ui/LogoMark";
import { useChatStickScroll } from "./useChatStickScroll";
import { readThinkingMetadata, selectThinkingControl, thinkingMode } from "@/lib/models/modelThinking";
import { isDecisionModel } from "@/lib/models/modelCapabilities";
import { parseChatError, toViewMessage, type LocalState } from "@/lib/chat/viewMessage";

const McpDialog = dynamic(() => import("./McpDialog").then((m) => m.McpDialog));

const MessageBubble = dynamic(() =>
  import("./MessageBubble").then((m) => m.MessageBubble),
);

const AuthModal = dynamic(() =>
  import("./AuthModal").then((m) => m.AuthModal),
);

const ModelStickers = dynamic(
  () => import("./ui/ModelStickers").then((m) => m.ModelStickers),
  { ssr: false },
);

export type ChatUser = {
  id: string;
  username: string;
  email: string;
  role?: string;
};

type ChatRequestBody = {
  model: string;
  useReasoning: boolean;
  thinkingControl: boolean | string | null;
  webSearch: boolean;
  tools: boolean;
  connectionIds: string[];
  timeZone?: string;
};

const EXPECTED_CODES = new Set(["SLEEPING", "OFFLINE", "MODEL_UNAVAILABLE", "MODEL_CAPABILITY", "GUEST_BUSY", "GUEST_DAILY_LIMIT", "CONTEXT_BUDGET"]);
const ERROR_ID = "chat-error";

// Turns JSON error responses (rate limits, validation, guest limits) into errors that keep their status and code.
async function chatFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || data.message || "Chat request failed. Try again."), { status: response.status, code: data.code });
  }
  return response;
}

function imagePart(dataUrl: string): FileUIPart {
  return { type: "file", mediaType: /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/png", url: dataUrl };
}

export function ChatInterface({ initialUser = null, authRequested = false, authReturnTo = "/" }: {
  initialUser?: ChatUser | null;
  authRequested?: boolean;
  authReturnTo?: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [useReasoning, setUseReasoning] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
  const [user, setUser] = useState<ChatUser | null>(initialUser);
  const [stickersReady, setStickersReady] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(authRequested);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [local, setLocal] = useState<Record<string, LocalState>>({});
  const [requestError, setRequestError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLElement>(null);
  const requestBodyRef = useRef<ChatRequestBody | null>(null);
  const requestStartRef = useRef(0);
  const activeAssistantRef = useRef<string | null>(null);
  const suggestedResponseRef = useRef<string | null>(null);

  const patchLocal = (id: string, patch: LocalState) =>
    setLocal((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleChatError = (error: Error, assistantId?: string) => {
    const parsed = parseChatError(error.message);
    const code = ("code" in error && typeof error.code === "string" ? error.code : undefined) ?? parsed.code;
    const capability = parsed.capability;
    if (code === "SLEEPING") setIsSleeping(true);
    if (code === "OFFLINE") setIsOffline(true);
    if (code === "MODEL_UNAVAILABLE") void fetchModels(true);
    if (code === "MODEL_CAPABILITY" && capability === "chat") {
      setSelectedModel("");
      void fetchModels(true);
    }
    if (code === "MODEL_CAPABILITY" && capability === "thinking") setUseReasoning(false);
    if (code === "MODEL_CAPABILITY" && capability === "vision") setPendingImages([]);
    const expected = ("status" in error && error.status === 429) || EXPECTED_CODES.has(String(code));
    if (!expected) console.error("Chat Error:", error);
    if (assistantId) patchLocal(assistantId, { errorText: parsed.message, status: "error" });
    else setRequestError(parsed.message || "Could not reach DGX Spark.");
  };

  const { messages, sendMessage: sendChatMessage, regenerate, stop, status, setMessages, addToolApprovalResponse } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport<ChatUIMessage>({
      api: "/api/chat",
      body: () => requestBodyRef.current ?? {},
      fetch: chatFetch,
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    experimental_throttle: 50,
    // useChat keeps the callbacks from its first render, so these read refs instead of state.
    onError: (error) => handleChatError(error, activeAssistantRef.current ?? undefined),
    onFinish: ({ message, isAbort, isError }) => {
      if (message.role !== "assistant") return;
      setLocal((prev) => {
        const current = prev[message.id] ?? {};
        return { ...prev, [message.id]: {
          ...current,
          finishedAt: Date.now(),
          status: isAbort || current.status === "stopped" ? "stopped" : isError || current.status === "error" ? "error" : "complete",
        } };
      });
    },
  });
  const isLoading = status === "submitted" || status === "streaming";

  // Each stream (a new question, a retry, or the continuation after an approval) resets the assistant
  // message's timing and error once, when the message first appears in that stream.
  const streamCountRef = useRef(0);
  const wasLoadingRef = useRef(false);
  const initializedRef = useRef("");
  if (isLoading && !wasLoadingRef.current) streamCountRef.current++;
  wasLoadingRef.current = isLoading;
  const lastChatMessage = messages.at(-1);
  useEffect(() => {
    if (!isLoading || lastChatMessage?.role !== "assistant") return;
    const key = `${streamCountRef.current}:${lastChatMessage.id}`;
    if (initializedRef.current === key) return;
    initializedRef.current = key;
    activeAssistantRef.current = lastChatMessage.id;
    setLocal((prev) => ({ ...prev, [lastChatMessage.id]: {
      ...prev[lastChatMessage.id],
      startedAt: prev[lastChatMessage.id]?.startedAt ?? (requestStartRef.current || Date.now()),
      finishedAt: undefined, status: undefined, errorText: undefined,
    } }));
  }, [isLoading, lastChatMessage?.id, lastChatMessage?.role]);

  const viewMessages = useMemo(() => {
    const lastIndex = messages.length - 1;
    const views: Message[] = messages.filter((message) => message.role !== "system").map((message) =>
      toViewMessage(message, isLoading && message.role === "assistant" && messages.indexOf(message) === lastIndex, local[message.id]));
    if (requestError && !isLoading && views.at(-1)?.role === "user") {
      views.push({ id: ERROR_ID, role: "assistant", content: requestError, responseStatus: "error" });
    }
    return views;
  }, [messages, isLoading, local, requestError]);

  const lastMessage = viewMessages.at(-1);
  const followUpId = lastMessage?.role === "assistant" && lastMessage.id !== ERROR_ID && lastMessage.responseStatus === "complete" ? lastMessage.id : undefined;
  const followUpAnswer = followUpId ? lastMessage?.content : undefined;
  const followUpQuestion = followUpId ? viewMessages.at(-2)?.content : undefined;

  const { stuckToBottom, jumpToBottom, pinToBottom } = useChatStickScroll(
    chatScrollRef,
    messagesListRef,
  );

  const checkSession = async () => {
    try {
      const res = await fetch("/api/auth/login");
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      }
    } catch (err) {
      console.error("Failed to check session:", err);
    }
  };

  useEffect(() => {
    if (!initialUser) return;
    void checkSession();
  }, [initialUser]);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    const show = () => {
      if (!cancelled) setStickersReady(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(show, { timeout: 400 });
    } else {
      timeoutId = window.setTimeout(show, 1);
    }
    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
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
          .filter((m: { name: string; capabilities?: unknown }) =>
            !m.name.toLowerCase().includes("embed") && !isDecisionModel(m.name, m.capabilities))
          .map((m: { name: string; capabilities?: unknown; thinking?: unknown; details?: { parameter_size?: string } }) => {
            const caps = Array.isArray(m.capabilities)
              ? m.capabilities.map((c) => String(c).toLowerCase())
              : [];
            return {
              id: m.name,
              name: m.name.charAt(0).toUpperCase() + m.name.slice(1),
              parameterSize: m.details?.parameter_size ?? null,
              thinkingMode: thinkingMode(m.name, caps, m.thinking),
              thinkingMetadata: readThinkingMetadata(m.thinking),
              vision: caps.includes("vision"),
              tools: caps.includes("tools"),
              audio: caps.includes("audio"),
            };
          });
        setIsOffline(false);
        setIsSleeping(false);
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
    if (isLoading || !selectedModel || !followUpId || !followUpAnswer?.trim() || suggestedResponseRef.current === followUpId) return;
    suggestedResponseRef.current = followUpId;
    const controller = new AbortController();
    void fetch("/api/chat/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: selectedModel, question: followUpQuestion ?? "", answer: followUpAnswer }),
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      const followUps = Array.isArray(result.followUps) ? result.followUps.filter((item: unknown): item is string => typeof item === "string") : [];
      if (!controller.signal.aborted && followUps.length) patchLocal(followUpId, { followUps });
    }).catch(() => {});
    return () => controller.abort();
  }, [followUpId, followUpAnswer, followUpQuestion, isLoading, selectedModel, user?.id]);

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    if (user?.role === "admin") {
      void fetchModels(true);
    }
  }, [user?.role]);

  const selectedCaps = models.find((m) => m.id === selectedModel);
  const selectedThinkingMode = selectedCaps?.thinkingMode ?? "none";
  const canThink = selectedThinkingMode !== "none" || Boolean(selectedCaps?.tools);
  const thinkingControl = selectedThinkingMode === "none" ? null
    : selectThinkingControl(selectedModel, selectedCaps?.thinkingMetadata, useReasoning, Boolean(selectedCaps?.tools));
  const canSee = Boolean(selectedCaps?.vision);
  const noChatModels = !modelsLoading && !isSleeping && !isOffline && models.length === 0;

  requestBodyRef.current = {
    model: selectedModel, useReasoning, thinkingControl, webSearch: useWebSearch,
    tools: Boolean(selectedCaps?.tools), connectionIds: user ? selectedMcpIds : [],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  useEffect(() => {
    if (!canThink && useReasoning) setUseReasoning(false);
  }, [canThink, useReasoning]);

  useEffect(() => {
    if (!canSee) setPendingImages([]);
  }, [canSee]);

  const stopGeneration = () => {
    const responseId = activeAssistantRef.current;
    if (responseId) patchLocal(responseId, { status: "stopped", finishedAt: local[responseId]?.finishedAt ?? Date.now() });
    void stop();
  };

  useEffect(() => {
    setSelectedMcpIds([]);
    void stop();
    return () => { void stop(); };
  }, [user?.id, stop]);

  const decideToolCall = (id: string, approved: boolean) => {
    void addToolApprovalResponse({ id, approved });
  };

  const clearChat = () => {
    void stop();
    pinToBottom();
    setMessages([]);
    setLocal({});
    setRequestError(null);
  };

  const canSend = () => {
    if (isLoading || !selectedModel || isSleeping || isOffline) return false;
    if (models.length > 0 && !models.some((m) => m.id === selectedModel)) {
      void fetchModels(true);
      return false;
    }
    return true;
  };

  const beginRequest = () => {
    requestStartRef.current = Date.now();
    activeAssistantRef.current = null;
    setRequestError(null);
    pinToBottom();
  };

  const sendMessage = async (content: string, images: string[] = [], clearComposer = false) => {
    const text = content.trim();
    if ((!text && images.length === 0) || !canSend()) return;
    if (clearComposer) {
      setInput("");
      setPendingImages([]);
    }
    beginRequest();
    const files = images.map(imagePart);
    await (text ? sendChatMessage({ text, ...(files.length ? { files } : {}) }) : sendChatMessage({ files }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input, canSee ? pendingImages.map(image => image.dataUrl) : [], true);
  };

  const handleRetry = async (assistantId: string) => {
    if (!canSend()) return;
    beginRequest();
    await (assistantId === ERROR_ID ? regenerate() : regenerate({ messageId: assistantId }));
  };

  const handleEdit = async (userId: string, content: string) => {
    const text = content.trim();
    if (!text || !canSend()) return;
    const original = messages.find((message) => message.id === userId && message.role === "user");
    if (!original) return;
    const files = original.parts.filter((part): part is FileUIPart => part.type === "file" && canSee);
    beginRequest();
    await sendChatMessage({ text, messageId: userId, ...(files.length ? { files } : {}) });
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
        {stickersReady ? <ModelStickers docked={viewMessages.length > 0} /> : null}

        <main
          ref={chatScrollRef}
          className={`chat-thread relative z-[2] h-full min-h-0 px-3 py-3 sm:px-4 sm:py-6 md:px-8 ${
            viewMessages.length === 0 ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
        <div
          ref={messagesListRef}
          className={`mx-auto flex max-w-3xl flex-col gap-6 sm:gap-7 ${
            viewMessages.length === 0 ? "h-full justify-center pb-36 sm:pb-32" : "pb-44 sm:pb-40"
          }`}
        >
          {viewMessages.length === 0 ? (
            <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
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
                    {noChatModels ? "No chat models available" : "How can I help you today?"}
                  </h2>
                  <p className="mt-1.5 text-pretty text-[12px] leading-relaxed text-muted sm:mt-2 sm:text-[13px]">
                    {noChatModels ? "Choose a chat-capable model on your AI server. Decision models are available through the API." : "Local models on DGX Spark."}
                  </p>
                </div>
              )}
            </div>
          ) : (
            viewMessages.map((message, i) => {
              const isLastAssistant =
                message.role === "assistant" &&
                i === viewMessages.findLastIndex((m) => m.role === "assistant");
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streaming={isLoading && isLastAssistant}
                  showActions={message.role === "assistant" && !(isLoading && isLastAssistant)}
                  onToolDecision={decideToolCall}
                  onRetry={message.role === "assistant" ? () => handleRetry(message.id) : undefined}
                  retryDisabled={isLoading || !selectedModel || isSleeping || isOffline}
                  onFollowUp={i === viewMessages.length - 1 && message.role === "assistant" ? (prompt) => { void sendMessage(prompt); } : undefined}
                  followUpDisabled={isLoading || !selectedModel || isSleeping || isOffline}
                  onEdit={message.role === "user" && viewMessages[i + 1]?.role === "assistant" && viewMessages[i + 1]?.id !== ERROR_ID && viewMessages[i + 1]?.responseStatus !== "running"
                    ? (text) => handleEdit(message.id, text) : undefined}
                  editDisabled={isLoading || !selectedModel || isSleeping || isOffline}
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
        unavailable={isSleeping || isOffline || !selectedModel}
        selectedModel={selectedModel}
        handleSubmit={handleSubmit}
        stopGeneration={stopGeneration}
        useReasoning={useReasoning}
        setUseReasoning={setUseReasoning}
        useWebSearch={useWebSearch}
        setUseWebSearch={setUseWebSearch}
        onMcp={() => setIsMcpOpen(true)}
        mcpCount={selectedMcpIds.length}
        canThink={canThink && !isSleeping && !isOffline}
        thinkingMode={selectedThinkingMode}
        canSee={canSee && !isSleeping && !isOffline}
        pendingImages={pendingImages}
        setPendingImages={setPendingImages}
        showJumpLatest={viewMessages.length > 0 && !stuckToBottom}
        onJumpLatest={jumpToBottom}
      />
      </div>

      {isMcpOpen && <McpDialog
        key={user?.id || "anonymous"}
        open={isMcpOpen}
        onClose={() => setIsMcpOpen(false)}
        signedIn={!!user}
        onSignIn={() => { setIsMcpOpen(false); setIsAuthModalOpen(true); }}
        selectedIds={selectedMcpIds}
        onSelectionChange={setSelectedMcpIds}
        disabled={isLoading}
      />}

      <AnimatePresence>
        {isAuthModalOpen && (
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => {
              setIsAuthModalOpen(false);
              if (authRequested) router.replace("/");
            }}
            onSuccess={(u) => {
              setUser(u);
              setIsAuthModalOpen(false);
              if (authRequested) router.replace(authReturnTo);
              void fetchModels();
            }}
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
