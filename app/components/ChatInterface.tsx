"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Message, ModelItem } from "../types/chat";
import { Header } from "./Header";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { OfflineState } from "./OfflineState";
import { AuthModal } from "./AuthModal";
import { LogOut, TriangleAlert, X, Loader2 } from "lucide-react";

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
    <div className="flex flex-col h-dvh max-h-dvh bg-background text-foreground overflow-hidden font-sans">
      
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
      <main className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-8 py-4 sm:py-6 scroll-smooth">
        <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-20">
          {messages.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center"
            >
              {isOffline ? (
                <OfflineState onRetry={fetchModels} />
              ) : (
                <>
                  <div className="w-20 h-20 bg-nvidia-green/10 rounded-3xl flex items-center justify-center border border-nvidia-green/20 mb-8 relative p-3 overflow-hidden shadow-[0_0_30px_rgba(118,185,0,0.2)]">
                    <Image 
                      src="/logo.svg" 
                      alt="DGX Spark Logo" 
                      width={80} 
                      height={80} 
                      className="w-full h-full object-contain relative z-10" 
                      priority
                    />
                  </div>
                  <h2 className="text-3xl font-semibold mb-3">How can I help you today?</h2>
                  <p className="text-foreground/40 max-w-md">
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
