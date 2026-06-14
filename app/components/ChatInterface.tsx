"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Message, ModelItem } from "../types/chat";
import { Header } from "./Header";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { AuthModal } from "./AuthModal";
import { LogOut, TriangleAlert, X, Loader2, RefreshCw } from "lucide-react";

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
  
  const [user, setUser] = useState<{ id: string; username: string; email: string } | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
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
      const res = await fetch("/api/auth/login", {
        method: "DELETE",
      });
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
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      
      if (data.error === "OFFLINE") {
        setIsOffline(true);
        setModelsLoading(false);
        return;
      }

      if (data.models && Array.isArray(data.models)) {
        const loadedModels = data.models
          .filter((m: { name: string }) => !m.name.toLowerCase().includes("embed"))
          .map((m: { name: string }) => ({
            id: m.name,
            name: m.name.charAt(0).toUpperCase() + m.name.slice(1)
          }));
        setModels(loadedModels);
        if (loadedModels.length > 0) {
          setSelectedModel(loadedModels[0].id);
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !selectedModel) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: "assistant", content: "" },
    ]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          useReasoning,
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to fetch response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let done = false;
      let streamedContent = "";
      let lineBuffer = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          lineBuffer += chunk;
          
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || ""; // Store the partial line for the next chunk

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            try {
              const data = JSON.parse(trimmedLine);

              if (data.message && data.message.content) {
                streamedContent += data.message.content;
                
                let rContent = streamedContent;
                let rThought = "";
                let rIsThinking = false;

                if (streamedContent.includes("<think>")) {
                  if (streamedContent.includes("</think>")) {
                     const thinkMatch = streamedContent.match(/<think>([\s\S]*?)<\/think>/);
                     if (thinkMatch) rThought = thinkMatch[1].trim();
                     rContent = streamedContent.replace(/<think>[\s\S]*?<\/think>/, "").trim();
                     rIsThinking = false;
                  } else {
                     const parts = streamedContent.split("<think>");
                     rContent = parts[0].trim();
                     rThought = parts[1];
                     rIsThinking = true;
                  }
                }

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: rContent, thoughtProcess: rThought, isThinking: rIsThinking }
                      : msg
                  )
                );
              }

              if (data.done && data.eval_count && data.eval_duration) {
                 setMessages((prev) =>
                   prev.map((msg) =>
                     msg.id === assistantMessageId
                       ? { ...msg, evalCount: data.eval_count, evalDurationMs: Math.round(data.eval_duration / 1000000) }
                       : msg
                   )
                 );
              }

            } catch (err) {
              console.warn("Failed to parse chunk:", trimmedLine, err);
            }
          }
        }
      }

      // Final check for any leftover data in lineBuffer (unlikely but safe)
      if (lineBuffer.trim()) {
        try {
          const data = JSON.parse(lineBuffer.trim());
          if (data.message && data.message.content) {
            // ... apply final update if needed ...
          }
        } catch {
          // Ignore partial trailing data
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

  return (
    <div className="flex h-[100svh] max-h-[100svh] flex-col bg-background text-foreground overflow-hidden font-sans sm:h-dvh sm:max-h-dvh">
      
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

      {/* Main Chat Area */}
      <main className={`flex-1 min-h-0 px-3 sm:px-4 md:px-8 py-3 sm:py-6 scroll-smooth ${messages.length === 0 ? "overflow-hidden" : "overflow-y-auto"}`}>
        <div className={`max-w-4xl mx-auto flex flex-col gap-5 sm:gap-8 ${messages.length === 0 ? "h-full pb-0" : "pb-32 sm:pb-20"}`}>
          {messages.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full min-h-0 text-center"
            >
              {isOffline ? (
                <OfflineState onRetry={fetchModels} />
              ) : (
                <>
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-nvidia-green/10 rounded-2xl sm:rounded-3xl flex items-center justify-center border border-nvidia-green/20 mb-5 sm:mb-8 relative p-2.5 sm:p-3 overflow-hidden shadow-[0_0_30px_rgba(118,185,0,0.2)]">
                    <Image 
                      src="/logo.svg" 
                      alt="DGX Spark Logo" 
                      width={80} 
                      height={80} 
                      className="w-full h-full object-contain relative z-10" 
                      priority
                    />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-semibold mb-2 sm:mb-3">How can I help you today?</h2>
                  <p className="text-sm sm:text-base text-foreground/40 max-w-[18rem] sm:max-w-md">
                    Experience the power of local LLMs running on DGX Spark. Select a model above and start chatting.
                  </p>
                </>
              )}
            </motion.div>
          ) : (
            <AnimatePresence>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </AnimatePresence>
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

// ── Logout Confirmation Dialog ────────────────────────────────────────────────
function OfflineState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-16 h-16 rounded-2xl bg-panel border border-border flex items-center justify-center mb-5 shadow-[0_0_28px_rgba(118,185,0,0.08)] relative overflow-hidden"
      >
        <Image
          src="/logo.svg"
          alt="DGX Spark Logo"
          width={28}
          height={28}
          className="w-7 h-7 object-contain opacity-25 grayscale"
        />
        <div className="absolute inset-0 bg-nvidia-green/10 rounded-full blur-2xl opacity-40" />
        <div className="absolute inset-0 border border-nvidia-green/10 rounded-2xl pointer-events-none" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-2xl font-bold tracking-tight mb-3">
          DGX Spark is <span className="text-nvidia-green">Resting</span>
        </h2>

        <p className="text-foreground/50 max-w-xs mx-auto mb-6 leading-relaxed text-sm">
          The private DGX hardware is offline right now. Check again when the tunnel is back online.
        </p>

        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-nvidia-green/5 hover:bg-nvidia-green/10 border border-nvidia-green/20 rounded-lg transition-all text-sm font-semibold text-nvidia-green group shadow-md shadow-nvidia-green/5 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700 ease-in-out" />
          Wake Up Check
        </button>
      </motion.div>

      <div className="mt-7 text-[10px] font-mono text-foreground/25 uppercase tracking-[0.16em]">
        api.dgxspark.dev &bull; Cloudflare Tunnel Status: Paused
      </div>
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-sm bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <TriangleAlert className="w-4.5 h-4.5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Sign Out</h3>
              <p className="text-xs text-foreground/40 mt-0.5 font-sans">Are you sure you want to exit?</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-foreground/30 hover:text-foreground/60 transition-colors p-1 rounded-lg hover:bg-panel-hover cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-foreground/70 font-sans">
            You will need to sign in again to manage your API keys or access your profile.
          </p>

          <div className="flex gap-2.5 font-sans">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2 rounded-lg border border-border bg-panel-hover text-sm font-semibold text-foreground/70 hover:text-foreground hover:border-border/80 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing out…</>
              ) : (
                <><LogOut className="w-3.5 h-3.5" /> Sign Out</>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
